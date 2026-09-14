// Lettore dell'agenda MediOnline — costruito sulla radiografia del 2026-08-14.
//
//   node mac/agenda-robot/leggi-agenda.mjs
//
// Cosa fa, tutto in SOLA LETTURA (vedi comune.mjs): login automatico, apre
// Agenda → Appuntamenti, si mette su OGGI in vista Multi (tutte le agende
// visibili), legge gli appuntamenti del giorno e dei prossimi giorni
// (AGENDA_GIORNI in ~/.referralflow-agenda.conf, default 10) e scrive
// agenda-locale/medionline.ics nel progetto. ReferralFlow lo importa col
// feed «locale:medionline.ics».
//
// Come legge la griglia (DayPilot WeekGrid): niente numeri magici — gli
// orari si ricavano dalle etichette delle righe orarie della pagina stessa
// (posizione → minuti), la colonna dall'intestazione sopra il riquadro
// (sigla dell'agenda, es. «M.M.»). Se il sito cambia, i pezzi di percorso
// sono auto-riparabili (riparatore.mjs) e in ogni caso il feed segnala il
// file fermo. Nei log mai contenuti: solo date e conteggi.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanciaBrowser, leggiConf, modalitaSolaLettura } from './comune.mjs';
import { accediMediOnline, trovaElemento } from './riparatore.mjs';

const conf = leggiConf();
const GIORNI = Math.min(30, Math.max(1, Number(conf.AGENDA_GIORNI || 10)));
// Giorni GIÀ PASSATI da ripassare a ogni giro. Servono alla fatturazione: lo
// stato di un appuntamento (moneta = da fatturare, visto verde = fatturato)
// cambia giorni dopo la visita, quindi non basta guardare in avanti.
//   AGENDA_GIORNI_INDIETRO=7
const INDIETRO = Math.min(60, Math.max(0, Number(conf.AGENDA_GIORNI_INDIETRO ?? 7)));
// Stati dell'appuntamento in MediOnline. Il portale li disegna come icona in
// alto a destra nel riquadro (<i class="stN"> con l'immagine nello sfondo):
// si riconoscono dal NOME DEL FILE, che è parlante e in francese — più stabile
// del numero della classe. Rilevati dal portale il 14.9.2026.
const STATI = {
  ag_rdv_masque_16: 'bloccato',   // orologio + lucchetto
  ag_rdv_16: 'fissato',           // orologio
  ag_arrive_16_inv: 'arrivato',   // sedia (in sala d'attesa)
  ag_encours_16_inv: 'in_corso',  // stetoscopio
  ag_atraiter_16: 'da_fatturare', // moneta d'oro («à traiter»)
  ag_ok_16: 'trattato',           // quadrato verde col visto
  ag_excuse_16: 'scusato',        // faccia
  ag_ok_f_16: 'fatturato',        // quadrato verde col visto e la «F» («facturé»)
};
// Se un giorno il portale rinomina le icone, si rimedia senza toccare il
// codice: AGENDA_STATI=ag_nuovo_16:fatturato ag_altro_16:da_fatturare
for (const coppia of (conf.AGENDA_STATI ?? '').split(/[\s,;]+/)) {
  const [icona, chiave] = coppia.split(':');
  if (icona && chiave) STATI[icona.toLowerCase().replace(/\.\w+$/, '')] = chiave;
}
// Colori dei riquadri da NON considerare appuntamenti (blocchi, pause,
// assenze…): in ~/.referralflow-agenda.conf, es.
//   AGENDA_COLORI_IGNORA=#ffdc00 #01ff70
const COLORI_IGNORA = new Set(
  (conf.AGENDA_COLORI_IGNORA ?? '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((c) => /^#[0-9a-f]{6}$/.test(c))
);
// Alcuni colori sono «misti» (il rosso è sia «Visita urgenza» sia «Stop» /
// «non occupare»): i riquadri il cui testo contiene una di queste parole
// vengono scartati qualunque sia il colore. In conf, separate da virgola:
//   AGENDA_TESTI_IGNORA=stop, no coro, non occupare
const TESTI_IGNORA = (conf.AGENDA_TESTI_IGNORA ?? '')
  .toLowerCase()
  .split(',')
  .map((t) => t.trim())
  .filter((t) => t.length >= 3);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEST_DIR = path.join(REPO, 'agenda-locale');
const DEST = path.join(DEST_DIR, 'medionline.ics');

function log(m) {
  console.log(`${new Date().toISOString().slice(0, 16)} ${m}`);
}

// Estrae gli appuntamenti della giornata visibile. Gira DENTRO la pagina:
// geometria e testi restano sul Mac, fuori escono solo strutture.
async function estraiGiorno(p) {
  // Prima strada: DayPilot tiene gli appuntamenti in `dpc.events.list`, con
  // orari esatti, un id vero di MediOnline e la risorsa. È molto meglio che
  // misurare i rettangoli: niente scala oraria da dedurre, niente colonna da
  // indovinare dalla geometria, niente arrotondamenti ai 5 minuti. Se un
  // giorno la struttura non c'è più, si torna alla lettura per geometria.
  const dalla = await p.evaluate(() => {
    const dpc = window.dpc;
    const lista = dpc && dpc.events && dpc.events.list;
    if (!Array.isArray(lista) || !lista.length) return null;
    const sigle = new Map();
    for (const c of (dpc.columns && dpc.columns[0] && dpc.columns[0].children) || []) {
      if (c && c.id != null && c.name) sigle.set(String(c.id), String(c.name).trim());
    }
    const quando = (v) => (v && typeof v === 'object' && v.value ? String(v.value) : String(v ?? ''));
    const min = (iso) => {
      const m = /T(\d{2}):(\d{2})/.exec(iso);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const fuori = [];
    for (const e of lista) {
      const i = quando(e.start), f = quando(e.end);
      const inizio = min(i), fine = min(f);
      if (inizio === null) continue;
      const html = String(e.html ?? '');
      const stato = (html.match(/class=['"](st\d+)['"]/) || [])[1] ?? '';
      // Il testo si ricava facendolo leggere al DOM, non con un'espressione
      // regolare: MediOnline scrive «N&#176;» e togliere i tag a mano lascia
      // l'entità codificata (visto il 15.9.2026 — il numero di paziente
      // arrivava come «N&#176; 202847»).
      const culla = document.createElement('div');
      culla.innerHTML = html.replace(/<br\s*\/?>/gi, ' ');
      const testo = (culla.textContent || '').replace(/\s+/g, ' ').trim();
      fuori.push({
        idMol: String(e.id ?? ''),
        inizio,
        durata: fine !== null && fine > inizio ? fine - inizio : 30,
        colonna: sigle.get(String(e.resource)) ?? '',
        risorsa: String(e.resource ?? ''),
        colore: String(e.backColor ?? '').toLowerCase(),
        stato,
        iconaStato: '',
        annullato: stato === 'st6',
        testo: testo.slice(0, 200),
        data: i.slice(0, 10),
      });
    }
    const date = [...new Set(fuori.map((x) => x.data))];
    return { data: date.length === 1 ? date[0] : null, appuntamenti: fuori, via: 'struttura' };
  });
  if (dalla && dalla.appuntamenti.length) return dalla;
  return p.evaluate(() => {
    const q = (s) => [...document.querySelectorAll(s)];

    // Righe orarie: etichetta + posizione → mappa pixel→minuti. DayPilot
    // scrive l'ora in celle separate senza i due punti («7» grande e «00»
    // piccolo), quindi si accettano «7:00», «7 00», «700» e anche solo «7».
    const oreDa = (grezzo) => {
      const t = grezzo.replace(/\s+/g, ' ').trim();
      let m = t.match(/^(\d{1,2})[:.h ]?(\d{2})$/);
      if (!m) {
        const solo = t.match(/^(\d{1,2})$/);
        if (solo) m = [null, solo[1], '00'];
      }
      if (!m) return null;
      const ore = +m[1];
      const minuti = +m[2];
      if (ore > 23 || minuti > 59) return null;
      return ore * 60 + minuti;
    };
    // Nel margine ogni blocco-ora ha l'ora grande (td.fs14) e i quarti
    // «00 15 30 45» piccoli: l'ora del blocco è la cella grande, il blocco
    // parte al minuto 00. Gli altri formati restano come ripiego.
    const righe = q('.WeekGrid_rowheader')
      .map((el) => {
        let min = null;
        const cellaOra = el.querySelector('.fs14');
        if (cellaOra) {
          const h = parseInt(cellaOra.textContent.replace(/\D/g, ''), 10);
          if (Number.isFinite(h) && h >= 0 && h <= 23) min = h * 60;
        }
        if (min === null) min = oreDa(el.textContent);
        return min === null ? null : { top: el.getBoundingClientRect().top, min };
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);
    if (righe.length < 2) return { errore: 'righe_orarie_non_trovate' };
    const primo = righe[0];
    const ultimo = righe[righe.length - 1];
    const pxAlMinuto = (ultimo.top - primo.top) / (ultimo.min - primo.min);
    if (!(pxAlMinuto > 0)) return { errore: 'scala_oraria_non_valida' };

    // Colonne: intestazioni con la sigla dell'agenda.
    const colonne = q('.WeekGrid_colheader')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, sigla: el.textContent.trim() };
      })
      .filter((c) => c.sigla && c.right > c.left);

    // Riserva: sigle delle agende spuntate, nell'ordine delle colonne.
    const sigle = q('#ctl04_TblLstAgendas input[type="checkbox"]')
      .filter((i) => i.checked)
      .map((i) => i.parentElement?.querySelector('label')?.textContent.trim() ?? '');

    // La data mostrata (dd.mm.yyyy): nell'intestazione della pagina o in
    // quella larga sopra le colonne.
    const testata =
      ((document.querySelector('#ctl04_UPHeader')?.innerText ?? '') +
        ' ' +
        colonne.map((c) => c.sigla).join(' ')) || document.body.innerText;
    const md = testata.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    const arrotonda = (m) => Math.round(m / 5) * 5;
    const appuntamenti = q('.WeekGrid_event')
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.height < 4 || r.width < 4) return null;
        const cx = (r.left + r.right) / 2;
        // Tra le intestazioni che contengono il punto si prende la PIÙ
        // STRETTA: quella larga quanto la griglia è la riga della data.
        let colonna =
          colonne
            .filter((c) => cx >= c.left && cx <= c.right)
            .sort((a, b) => a.right - a.left - (b.right - b.left))[0]?.sigla ?? '';
        if (!colonna) {
          const td = el.closest('td');
          if (td && td.parentElement) {
            const idx = [...td.parentElement.children].indexOf(td);
            colonna = sigle[idx] ?? sigle[idx - 1] ?? '';
          }
        }
        const inizio = arrotonda(primo.min + (r.top - primo.top) / pxAlMinuto);
        const durata = Math.max(5, arrotonda(r.height / pxAlMinuto));
        // Il colore del riquadro distingue i tipi (visite, blocchi, pause…):
        // serve per scartare quelli che non sono appuntamenti veri.
        let colore = '';
        const inner = el.querySelector('.WeekGrid_event_inner') ?? el;
        const mc = getComputedStyle(inner).backgroundColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (mc) {
          colore = '#' + [mc[1], mc[2], mc[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
        }
        // Stato dell'appuntamento: MediOnline lo disegna come icona in alto a
        // destra, con un <i class="stN"> e l'immagine nello sfondo CSS.
        // Della classe interessa il numero; il nome del file serve da controllo.
        let stato = '';
        let iconaStato = '';
        for (const i of el.querySelectorAll('i')) {
          const c = [...i.classList].find((x) => /^st\d+$/.test(x));
          if (!c) continue;
          stato = c;
          const u = getComputedStyle(i).backgroundImage.match(/url\(["']?([^"')]+)/);
          if (u && !u[1].startsWith('data:')) {
            iconaStato = (u[1].split('?')[0].split('/').pop() ?? '').toLowerCase();
          }
          break;
        }
        const annullato = el.classList.contains('_Canceled');
        return {
          inizio,
          durata,
          colonna,
          colore,
          stato,
          iconaStato,
          annullato,
          testo: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 200),
        };
      })
      .filter(Boolean);

    return {
      data: md ? `${md[3]}-${md[2]}-${md[1]}` : null,
      appuntamenti,
    };
  });
}

function icsData(dataISO, minuti) {
  const hh = String(Math.floor(minuti / 60)).padStart(2, '0');
  const mm = String(minuti % 60).padStart(2, '0');
  return dataISO.replaceAll('-', '') + 'T' + hh + mm + '00';
}

// Dallo stato disegnato nel riquadro alla parola nostra. Vuoto quando l'icona
// non c'è o non è in tabella: «non lo so» non si scrive come «no».
// Corrispondenza fra la classe del riquadro e l'icona: serve quando lo stato
// arriva dalla struttura di DayPilot, dove c'è la classe ma non il file.
const CLASSI = {
  st0: 'ag_rdv_masque_16', st1: 'ag_rdv_16', st2: 'ag_arrive_16_inv', st3: 'ag_encours_16_inv',
  st4: 'ag_atraiter_16', st5: 'ag_ok_16', st6: 'ag_excuse_16', st8: 'ag_ok_f_16',
};

function statoAppuntamento(a) {
  if (a.annullato) return 'annullato';
  const icona = (a.iconaStato ?? '').replace(/\.\w+$/, '') || CLASSI[a.stato] || '';
  return STATI[icona] ?? '';
}

function icsTesto(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Con --visibile la finestra del browser resta sullo schermo (utile per
// guardare cosa fa); di norma è parcheggiata fuori, ma esiste sempre: il
// portale di login non gradisce i browser senza finestra.
const visibile = process.argv.includes('--visibile');

// Diagnosi: struttura (senza dati di pazienti) delle finestre aperte, da
// incollare in chat quando qualcosa si ferma.
async function scriviDiagnosi(context, motivo) {
  try {
    const { radiografiaPagina } = await import('./comune.mjs');
    const pezzi = [];
    let n = 0;
    for (const pg of context.pages()) {
      if (pg.isClosed()) continue;
      n++;
      pezzi.push(
        `##### DIAGNOSI FINESTRA ${n} — ${pg.url().replace(/\(S\([^)]*\)\)/g, '(S(...))')}\n` +
          (await radiografiaPagina(pg))
      );
    }
    const percorso = path.join(os.homedir(), 'agenda-robot-diagnosi.txt');
    writeFileSync(percorso, pezzi.join('\n\n') + '\n', 'utf-8');
    log(`${motivo}: diagnosi scritta in ${percorso} (solo struttura, da incollare in chat)`);
  } catch {
    log(`${motivo} (e diagnosi non scrivibile)`);
  }
}

const browser = await lanciaBrowser({ fuoriSchermo: !visibile });
let esito = 1;
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  await modalitaSolaLettura(page);
  await page.goto(conf.MEDIONLINE_URL, { waitUntil: 'domcontentloaded' });

  let { pagina: p, ok } = await accediMediOnline(context, page, conf);
  if (!ok) {
    await scriviDiagnosi(context, 'login non riuscito');
    process.exit(1);
  }
  log('login ok');

  // Menu: Agenda → Appuntamenti. Dopo il login il portale rimescola le
  // finestre: la voce si cerca in TUTTE quelle aperte, con pazienza (le
  // pagine arrivano con calma). La voce c'è nel DOM anche a menu chiuso:
  // si usa il click via JavaScript.
  const SELETTORI_VOCE = ['li#b2 a', 'a[onclick*="AGND_Affiche"]'];
  let voce = null;
  for (let giro = 0; giro < 15 && !voce; giro++) {
    if (giro > 0) await page.waitForTimeout(2500);
    for (const pg of context.pages()) {
      if (pg.isClosed()) continue;
      for (const sel of SELETTORI_VOCE) {
        try {
          if ((await pg.locator(sel).count()) > 0) {
            p = pg;
            voce = pg.locator(sel).first();
            break;
          }
        } catch {
          /* finestra chiusa nel frattempo */
        }
      }
      if (voce) break;
    }
  }
  if (!voce) {
    // Ultima carta: la riparazione AI sulla finestra del dopo-login.
    voce = await trovaElemento(
      p,
      'menu_appuntamenti',
      SELETTORI_VOCE,
      'la voce di menu «Appuntamenti» dentro la sezione «Agenda»',
      async (loc) => (await loc.count()) > 0
    );
  }
  if (!voce) {
    await scriviDiagnosi(context, 'voce di menu Appuntamenti non trovata');
    process.exit(1);
  }
  await modalitaSolaLettura(p);
  await voce.evaluate((el) => el.click());
  await p.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await p.waitForSelector('.WeekGrid_main', { timeout: 30_000 });

  // Vista «Multi» (tutte le agende affiancate) e «oggi».
  const multi = p.locator('#ctl04_lkMulti');
  if ((await multi.count()) > 0 && !/\bon\b/.test((await multi.getAttribute('class')) ?? '')) {
    await multi.evaluate((el) => el.click());
    await p.waitForTimeout(2500);
  }
  const oggi = await trovaElemento(
    p,
    'agenda_oggi',
    ['#ctl04_imbtnToday'],
    'il bottone «oggi» (sole) nella barra dell\'agenda',
    async (loc) => (await loc.count()) > 0
  );
  if (oggi) {
    await oggi.evaluate((el) => el.click());
    await p.waitForTimeout(2500);
  }

  // La freccia del giorno precedente / successivo nella barra dell'agenda.
  const freccia = async (verso) =>
    trovaElemento(
      p,
      verso > 0 ? 'agenda_avanti' : 'agenda_indietro',
      verso > 0 ? ['#ctl04_imgNext'] : ['#ctl04_imgPrev', '#ctl04_imgPrevious'],
      verso > 0
        ? 'la freccia per passare al giorno successivo nella barra dell\'agenda'
        : 'la freccia per tornare al giorno precedente nella barra dell\'agenda',
      async (loc) => (await loc.count()) > 0
    );

  // Si parte da INDIETRO giorni fa e si cammina in avanti fino a oggi + GIORNI.
  let dataFallback = new Date();
  let partenzaOk = true;
  for (let g = 0; g < INDIETRO; g++) {
    const dietro = await freccia(-1);
    if (!dietro) {
      log(`freccia «giorno precedente» non trovata: si legge solo da oggi in avanti`);
      partenzaOk = false;
      break;
    }
    await dietro.evaluate((el) => el.click());
    await p.waitForTimeout(2000);
    dataFallback.setDate(dataFallback.getDate() - 1);
  }
  const ARRETRATI = partenzaOk ? INDIETRO : 0;
  const TOTALE = ARRETRATI + GIORNI;

  // Giorno per giorno: gli arretrati, oggi e i prossimi.
  const perGiorno = [];
  const censimentoColori = new Map();
  const censimentoIcone = new Map();
  let scartatiPerColore = 0;
  for (let g = 0; g < TOTALE; g++) {
    await p.waitForSelector('.WeekGrid_main', { timeout: 30_000 });
    await p.waitForTimeout(800);
    const giorno = await estraiGiorno(p);
    if (giorno.errore) {
      log(`giorno ${g + 1}: lettura non riuscita (${giorno.errore})`);
      if (g === 0) await scriviDiagnosi(context, 'griglia non leggibile');
    } else {
      const dataISO = giorno.data ?? dataFallback.toISOString().slice(0, 10);
      if (giorno.data) dataFallback = new Date(giorno.data + 'T12:00:00');
      for (const a of giorno.appuntamenti) {
        censimentoColori.set(a.colore, (censimentoColori.get(a.colore) ?? 0) + 1);
        const eti = `${a.stato || 'senza-icona'}${a.iconaStato ? '/' + a.iconaStato.replace(/\.\w+$/, '') : ''}`;
        censimentoIcone.set(eti, (censimentoIcone.get(eti) ?? 0) + 1);
      }
      const tenuti = giorno.appuntamenti.filter((a) => {
        if (COLORI_IGNORA.has(a.colore)) {
          scartatiPerColore++;
          return false;
        }
        const t = a.testo.toLowerCase();
        if (TESTI_IGNORA.some((parola) => t.includes(parola))) {
          scartatiPerColore++;
          return false;
        }
        return true;
      });
      perGiorno.push({ data: dataISO, appuntamenti: tenuti });
      log(`giorno ${g + 1}/${TOTALE}${g < ARRETRATI ? ' (arretrato)' : ''}${giorno.via === 'struttura' ? '' : ' [geometria]'}: ${dataISO} → ${tenuti.length} appuntamenti` +
        (giorno.appuntamenti.length !== tenuti.length ? ` (+${giorno.appuntamenti.length - tenuti.length} scartati per colore)` : ''));
    }
    if (g < TOTALE - 1) {
      const avanti = await freccia(1);
      if (!avanti) break;
      await avanti.evaluate((el) => el.click());
      await p.waitForTimeout(2000);
      dataFallback.setDate(dataFallback.getDate() + 1);
    }
  }

  // ICS: un evento per appuntamento. La sigla dell'agenda va in LOCATION
  // (nel feed di ReferralFlow scegliere «location» come campo del medico e
  // mettere le sigle negli alias dei medici).
  const righe = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ReferralFlow//robot-agenda-medionline//IT',
  ];
  let totale = 0;
  for (const giorno of perGiorno) {
    for (const a of giorno.appuntamenti) {
      const uid = createHash('sha1')
        .update(`${giorno.data}|${a.inizio}|${a.colonna}|${a.testo}`)
        .digest('hex')
        .slice(0, 20);
      righe.push(
        'BEGIN:VEVENT',
        `UID:mol-${uid}`,
        `DTSTART:${icsData(giorno.data, a.inizio)}`,
        `DTEND:${icsData(giorno.data, Math.min(a.inizio + a.durata, 24 * 60 - 1))}`,
        `SUMMARY:${icsTesto(a.testo)}`,
        `LOCATION:${icsTesto(a.colonna)}`,
        // Colore del riquadro nell'agenda originale (14.9.2026): la piattaforma
        // lo conserva e l'interfaccia nuova lo mostra sull'appuntamento.
        ...(a.colore ? [`X-RF-COLORE:${a.colore}`] : []),
        // Stato letto dall'icona in alto a destra del riquadro (moneta = da
        // fatturare, visto con la «F» = fatturato, sedia = arrivato…).
        ...(statoAppuntamento(a) ? [`X-RF-STATO:${statoAppuntamento(a)}`] : []),
        // Gli annullati esistono nella struttura di DayPilot ma non devono
        // affollare l'agenda: si marcano come cancellati e la piattaforma li
        // scarta da sola (`agenda-sync` filtra STATUS:CANCELLED). Prima, con
        // la lettura a pixel, non arrivavano proprio.
        ...(['annullato', 'scusato'].includes(statoAppuntamento(a)) ? ['STATUS:CANCELLED'] : []),
        // Identificativo dell'appuntamento in MediOnline (15.9.2026): viene
        // dalla struttura di DayPilot, è stabile quando il testo cambia, e
        // permette alla piattaforma di riconoscere lo stesso appuntamento da
        // un giro all'altro. NON si usa ancora come UID: cambiarlo ora
        // duplicherebbe gli appuntamenti già in archivio.
        ...(a.idMol ? [`X-RF-ID:${icsTesto(a.idMol)}`] : []),
        ...(a.risorsa ? [`X-RF-RISORSA:${icsTesto(a.risorsa)}`] : []),
        'END:VEVENT'
      );
      totale++;
    }
  }
  righe.push('END:VCALENDAR');

  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST + '.parziale', righe.join('\r\n') + '\r\n', 'utf-8');
  renameSync(DEST + '.parziale', DEST);
  log(`scritto medionline.ics: ${totale} appuntamenti su ${perGiorno.length} giorni` +
    (scartatiPerColore ? ` (${scartatiPerColore} scartati per colore)` : ''));
  // Censimento dei colori visti (per decidere quali ignorare): solo colori
  // e conteggi, nessun contenuto.
  const riepilogo = [...censimentoColori.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c || 'senza-colore'}×${n}`)
    .join('  ');
  if (riepilogo) log(`colori visti: ${riepilogo}`);
  // Censimento degli stati visti (classe/icona): solo nomi e conteggi.
  const riepilogoIcone = [...censimentoIcone.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([i, n]) => `${i}×${n}`)
    .join('  ');
  if (riepilogoIcone) log(`stati visti: ${riepilogoIcone}`);
  const perStato = new Map();
  for (const g of perGiorno) {
    for (const a of g.appuntamenti) {
      const st = statoAppuntamento(a);
      if (st) perStato.set(st, (perStato.get(st) ?? 0) + 1);
    }
  }
  if (perStato.size) {
    log('stati riconosciuti: ' + [...perStato.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}×${n}`).join('  '));
  } else if (riepilogoIcone) {
    log('nessuna icona riconosciuta: aggiorna la tabella STATI o AGENDA_STATI nel conf');
  }

  // Sveglia subito la sincronizzazione dell'app (se il server è acceso).
  try {
    const env = readFileSync(path.join(REPO, '.env'), 'utf-8');
    const chiave = env.match(/^REMINDER_SECRET=(.+)$/m)?.[1]?.trim();
    if (chiave) {
      const r = await fetch(`http://localhost:3000/api/cron/agenda?key=${chiave}`, {
        signal: AbortSignal.timeout(60_000),
      });
      log(`sincronizzazione app: ${r.status}${r.status === 200 ? ' — ReferralFlow aggiornato ✓' : ''}`);
    } else {
      log('ATTENZIONE: manca REMINDER_SECRET nel .env — ReferralFlow non viene avvisato.');
      log('Rimedio: cd ~/referralflow && bash mac/installa-server.sh');
    }
  } catch {
    log('sincronizzazione app non raggiungibile (andrà al prossimo giro)');
  }
  esito = 0;
} finally {
  await browser.close();
  process.exit(esito);
}
