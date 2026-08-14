// Radiografia di MediOnline — da eseguire UNA volta, con l'aiuto di una persona:
//
//   node mac/agenda-robot/radiografia.mjs
//
// Apre un browser visibile, prova il login automatico con le credenziali di
// ~/.referralflow-agenda.conf (se non riesce, accedi tu a mano), poi aspetta
// che TU porti l'agenda sulla vista giusta (la giornata con tutti i medici).
// Quando premi Invio nel Terminale, salva in ~/agenda-radiografia.txt la
// STRUTTURA delle pagine (mai i contenuti delle celle: vedi comune.mjs) da
// incollare in chat per costruire il lettore su misura.

import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { leggiConf, modalitaSolaLettura, radiografiaPagina } from './comune.mjs';
import { accediMediOnline } from './riparatore.mjs';

const conf = leggiConf();
const uscita = path.join(os.homedir(), 'agenda-radiografia.txt');
const sezioni = [];

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await modalitaSolaLettura(page);

console.log('Apro MediOnline…');
await page.goto(conf.MEDIONLINE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

sezioni.push('########## PAGINA D\'INGRESSO ##########\n' + (await radiografiaPagina(page)));

console.log('Percorso d\'accesso automatico…');
// Qualunque cosa vada storta qui, la radiografia deve arrivare comunque in
// fondo: l'accesso lo si può completare a mano nella finestra del browser.
try {
  const { pagina, ok } = await accediMediOnline(context, page, conf);
  if (ok) {
    console.log('Login automatico riuscito ✓');
  } else {
    console.log('Login automatico non riuscito fino in fondo: completa TU nella finestra del browser.');
  }
  if (!pagina.isClosed()) {
    sezioni.push('########## FINESTRA DI LOGIN/DOPO-LOGIN ##########\n' + (await radiografiaPagina(pagina)));
  }
} catch (e) {
  console.log(
    'Accesso automatico interrotto (' + String(e?.message ?? e).split('\n')[0] + '): ' +
      'completa TU il login nella finestra del browser.'
  );
}

// Più scatti nella stessa corsa: porti il browser su una schermata, premi
// Invio, la fotografo; navighi altrove, premi ancora Invio… scrivi «fine»
// per chiudere. Ogni scatto fotografa tutte le finestre ancora aperte.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const chiedi = (testo) => new Promise((fine) => rl.question(testo, fine));

let scatto = 0;
for (;;) {
  const risposta = (
    await chiedi(
      scatto === 0
        ? '\nPorta il browser sulla schermata da fotografare (es. Agenda → Appuntamenti,\n' +
          'vista con tutti i medici) e premi Invio. Quando hai finito gli scatti, scrivi «fine». '
        : '\nAltro scatto? Naviga e premi Invio — oppure scrivi «fine»: '
    )
  ).trim().toLowerCase();
  if (risposta === 'fine') break;
  scatto++;
  let n = 0;
  for (const p of context.pages()) {
    if (p.isClosed()) continue;
    n++;
    try {
      sezioni.push(
        `########## SCATTO ${scatto} — FINESTRA ${n} — ${p.url().replace(/\(S\([^)]*\)\)/g, '(S(...))')} ##########\n` +
          (await radiografiaPagina(p))
      );
    } catch {
      sezioni.push(`########## SCATTO ${scatto} — FINESTRA ${n}: non più leggibile ##########`);
    }
  }
  console.log(`Scatto ${scatto} fatto ✓`);
}
rl.close();

writeFileSync(uscita, sezioni.join('\n\n') + '\n', 'utf-8');
await browser.close();

console.log('\n────────────────────────────────────────────────────────────');
console.log('Fatto: radiografia salvata in ' + uscita);
console.log('Aprila (doppio clic), copia tutto e incollalo in chat a Claude.');
console.log('Contiene solo struttura e etichette: nessun dato di pazienti.');
console.log('────────────────────────────────────────────────────────────');
