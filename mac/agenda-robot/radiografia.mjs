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
import { leggiConf, tentaLogin, radiografiaPagina } from './comune.mjs';

const conf = leggiConf();
const uscita = path.join(os.homedir(), 'agenda-radiografia.txt');
const sezioni = [];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Apro MediOnline…');
await page.goto(conf.MEDIONLINE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

sezioni.push('########## PAGINA DI LOGIN ##########\n' + (await radiografiaPagina(page)));

console.log('Provo il login automatico…');
if (await tentaLogin(page, conf)) {
  console.log('Login automatico riuscito ✓');
} else {
  console.log('Login automatico non riuscito: accedi TU nella finestra del browser.');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise((fine) => {
  rl.question(
    '\nQuando nel browser vedi l\'AGENDA con tutti i medici della giornata,\n' +
      'torna qui e premi Invio… ',
    fine
  );
});
rl.close();

sezioni.push('########## PAGINA DELL\'AGENDA ##########\n' + (await radiografiaPagina(page)));
sezioni.push('########## URL FINALE ##########\n' + page.url().replace(/\(S\([^)]*\)\)/g, '(S(...))'));

writeFileSync(uscita, sezioni.join('\n\n') + '\n', 'utf-8');
await browser.close();

console.log('\n────────────────────────────────────────────────────────────');
console.log('Fatto: radiografia salvata in ' + uscita);
console.log('Aprila (doppio clic), copia tutto e incollalo in chat a Claude.');
console.log('Contiene solo struttura e etichette: nessun dato di pazienti.');
console.log('────────────────────────────────────────────────────────────');
