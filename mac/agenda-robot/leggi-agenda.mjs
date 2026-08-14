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
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEST_DIR = path.join(REPO, 'agenda-locale');
const DEST = path.join(DEST_DIR, 'medionline.ics');

function log(m) {
  console.log(`${new Date().toISOString().slice(0, 16)} ${m}`);
}

// Estrae gli appuntamenti della giornata visibile. Gira DENTRO la pagina:
// geometria e testi restano sul Mac, fuori escono solo strutture.
async function estraiGiorno(p) {
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
        return {
          inizio,
          durata,
          colonna,
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

  // Giorno per giorno: oggi + i prossimi.
  const perGiorno = [];
  let dataFallback = new Date();
  for (let g = 0; g < GIORNI; g++) {
    await p.waitForSelector('.WeekGrid_main', { timeout: 30_000 });
    await p.waitForTimeout(800);
    const giorno = await estraiGiorno(p);
    if (giorno.errore) {
      log(`giorno ${g + 1}: lettura non riuscita (${giorno.errore})`);
      if (g === 0) await scriviDiagnosi(context, 'griglia non leggibile');
    } else {
      const dataISO = giorno.data ?? dataFallback.toISOString().slice(0, 10);
      if (giorno.data) dataFallback = new Date(giorno.data + 'T12:00:00');
      perGiorno.push({ data: dataISO, appuntamenti: giorno.appuntamenti });
      log(`giorno ${g + 1}: ${dataISO} → ${giorno.appuntamenti.length} appuntamenti`);
    }
    if (g < GIORNI - 1) {
      const avanti = await trovaElemento(
        p,
        'agenda_avanti',
        ['#ctl04_imgNext'],
        'la freccia per passare al giorno successivo nella barra dell\'agenda',
        async (loc) => (await loc.count()) > 0
      );
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
        'END:VEVENT'
      );
      totale++;
    }
  }
  righe.push('END:VCALENDAR');

  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST + '.parziale', righe.join('\r\n') + '\r\n', 'utf-8');
  renameSync(DEST + '.parziale', DEST);
  log(`scritto medionline.ics: ${totale} appuntamenti su ${perGiorno.length} giorni`);

  // Sveglia subito la sincronizzazione dell'app (se il server è acceso).
  try {
    const env = readFileSync(path.join(REPO, '.env'), 'utf-8');
    const chiave = env.match(/^REMINDER_SECRET=(.+)$/m)?.[1]?.trim();
    if (chiave) {
      const r = await fetch(`http://localhost:3000/api/cron/agenda?key=${chiave}`, {
        signal: AbortSignal.timeout(60_000),
      });
      log(`sincronizzazione app: ${r.status}`);
    }
  } catch {
    log('sincronizzazione app non raggiungibile (andrà al prossimo giro)');
  }
  esito = 0;
} finally {
  await browser.close();
  process.exit(esito);
}
