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

    // Righe orarie: etichetta «HH:MM» + posizione → mappa pixel→minuti.
    const righe = q('.WeekGrid_rowheader')
      .map((el) => {
        const m = el.textContent.trim().match(/(\d{1,2})[:.h](\d{2})/);
        return m ? { top: el.getBoundingClientRect().top, min: +m[1] * 60 + +m[2] } : null;
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

    // La data mostrata (dd.mm.yyyy da qualche parte nell'intestazione).
    const testata = (document.querySelector('#ctl04_UPHeader') ?? document.body).innerText;
    const md = testata.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    const arrotonda = (m) => Math.round(m / 5) * 5;
    const appuntamenti = q('.WeekGrid_event')
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.height < 4 || r.width < 4) return null;
        const cx = (r.left + r.right) / 2;
        let colonna = colonne.find((c) => cx >= c.left && cx <= c.right)?.sigla ?? '';
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

// Con --visibile si apre il browser vero: utile per capire se un blocco
// dipende dalla modalità invisibile.
const visibile = process.argv.includes('--visibile');
const browser = await lanciaBrowser(!visibile);
let esito = 1;
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    // In modalità invisibile il browser si presenterebbe come
    // «HeadlessChrome»: certi portali gli mostrano pagine diverse.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await modalitaSolaLettura(page);
  await page.goto(conf.MEDIONLINE_URL, { waitUntil: 'domcontentloaded' });

  const { pagina: p, ok } = await accediMediOnline(context, page, conf);
  if (!ok) {
    // Diagnosi automatica: la struttura (senza dati di pazienti) delle
    // finestre aperte, da mandare in chat per capire dove si è fermato.
    try {
      const { radiografiaPagina } = await import('./comune.mjs');
      const pezzi = [];
      let n = 0;
      for (const pg of context.pages()) {
        if (pg.isClosed()) continue;
        n++;
        pezzi.push(`##### DIAGNOSI FINESTRA ${n} — ${pg.url().replace(/\(S\([^)]*\)\)/g, '(S(...))')}\n` + (await radiografiaPagina(pg)));
      }
      const percorsoDiag = path.join(os.homedir(), 'agenda-robot-diagnosi.txt');
      writeFileSync(percorsoDiag, pezzi.join('\n\n') + '\n', 'utf-8');
      log(`login non riuscito: diagnosi scritta in ${percorsoDiag} (solo struttura, da incollare in chat)`);
    } catch {
      log('login non riuscito (e diagnosi non scrivibile)');
    }
    process.exit(1);
  }
  log('login ok');

  // Menu: Agenda → Appuntamenti. La voce c'è nel DOM anche a menu chiuso:
  // si usa il click via JavaScript.
  const voce = await trovaElemento(
    p,
    'menu_appuntamenti',
    ['li#b2 a', 'a[onclick*="AGND_Affiche"]'],
    'la voce di menu «Appuntamenti» dentro la sezione «Agenda»',
    async (loc) => (await loc.count()) > 0
  );
  if (!voce) {
    log('voce di menu Appuntamenti non trovata: mi fermo');
    process.exit(1);
  }
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
