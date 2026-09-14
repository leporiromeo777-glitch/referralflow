// Il foglio del banco in PDF, da leggere e votare su carta o su iPad.
//
//   node scripts/banco-pdf.mjs [sorgente.md] [destinazione.pdf]
//
// Prende ~/banco-domanda-medica.md e ne fa un fascicolo: una domanda per
// pagina, le risposte in riquadri numerati, la casella del voto già pronta,
// e la chiave dei nomi in fondo su una pagina a sé — così non la si vede per
// sbaglio mentre si vota. Nessun dato di pazienti: sono domande di medicina
// generale.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../mac/agenda-robot/node_modules/playwright/index.mjs';

const sorgente = process.argv[2] || path.join(os.homedir(), 'banco-domanda-medica.md');
const dest = process.argv[3] || path.join(os.homedir(), 'banco-domanda-medica.pdf');
const md = readFileSync(sorgente, 'utf-8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Markdown minimo: solo ciò che il banco produce davvero.
function inline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
function blocchi(testo) {
  const out = [];
  const righe = testo.split('\n');
  let i = 0;
  while (i < righe.length) {
    const r = righe[i];
    if (!r.trim()) { i++; continue; }
    if (/^\|/.test(r)) {                                   // tabella
      const t = [];
      while (i < righe.length && /^\|/.test(righe[i])) t.push(righe[i++]);
      const celle = (x) => x.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const testa = celle(t[0]);
      const corpo = t.slice(2).map(celle);
      out.push(`<table><thead><tr>${testa.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo.map((rg) => `<tr>${rg.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(r)) {            // elenco
      const ord = /^\s*\d+[.)]\s+/.test(r);
      const voci = [];
      while (i < righe.length && /^\s*([-*]|\d+[.)])\s+/.test(righe[i])) {
        voci.push(righe[i++].replace(/^\s*([-*]|\d+[.)])\s+/, ''));
      }
      out.push(`<${ord ? 'ol' : 'ul'}>${voci.map((v) => `<li>${inline(v)}</li>`).join('')}</${ord ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^---+$/.test(r.trim())) { i++; continue; }
    const par = [];
    while (i < righe.length && righe[i].trim() && !/^\||^\s*([-*]|\d+[.)])\s+|^#{1,6}\s|^---+$/.test(righe[i])) par.push(righe[i++]);
    out.push(`<p>${inline(par.join(' '))}</p>`);
  }
  return out.join('\n');
}

const voto = `<div class="voto"><span>Voto</span>${[1, 2, 3, 4, 5].map((n) => `<i>${n}</i>`).join('')}<span class="nota">1 sbagliata · 3 corretta ma generica · 5 quello che diresti tu</span></div>`;

// Struttura: intestazione, domande, consumo, chiave.
const [prima, chiaveGrezza] = md.split(/^## Chiave.*$/m);
const corpo = prima.split(/^## Consumo e tempi$/m);
const domandeTesto = corpo[0];
const consumo = corpo[1] ?? '';
const pezzi = domandeTesto.split(/^## Domanda (\d+)$/m);
const testa = pezzi[0].replace(/^# .*$/m, '').trim();

let html = `<h1>Banco dei modelli — domande di medicina</h1>${blocchi(testa)}
<p class="avviso">Le risposte sono mescolate e senza nome, e l'ordine cambia a ogni domanda: <b>«A» non è sempre lo stesso modello</b>. La chiave dei nomi è nell'ultima pagina: guardala solo alla fine.</p>`;

for (let k = 1; k < pezzi.length; k += 2) {
  const n = pezzi[k];
  const testo = pezzi[k + 1];
  const domanda = (testo.match(/\*\*(.+?)\*\*/) || [, ''])[1];
  html += `<section class="dom"><div class="cap">Domanda ${n} di 10</div><h2>${inline(domanda)}</h2>`;
  for (const m of testo.matchAll(/^### ([A-H])\n\n([\s\S]*?)\n\n\*\*Voto \(1-5\):\*\* ____/gm)) {
    html += `<div class="risp"><div class="lettera">${m[1]}</div><div class="testo">${blocchi(m[2].trim())}</div>${voto}</div>`;
  }
  html += `</section>`;
}
if (consumo) html += `<section class="dom"><h2>Consumo e tempi</h2>${blocchi(consumo)}</section>`;
if (chiaveGrezza) html += `<section class="dom chiave"><div class="cap">Ultima pagina</div><h2>Chiave — solo dopo aver votato</h2>${blocchi(chiaveGrezza.replace(/^.*guardare solo dopo.*$/m, ''))}</section>`;

const pagina = `<!doctype html><meta charset="utf-8"><style>
@page { size: A4; margin: 16mm 15mm 14mm; }
body { font: 10.5pt/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1E2622; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 6pt; letter-spacing: -.01em; }
h2 { font-size: 12.5pt; margin: 0 0 10pt; line-height: 1.35; }
p { margin: 0 0 7pt; }
.avviso { border-left: 2.5pt solid #0D5C48; padding-left: 9pt; color: #3C4742; margin-top: 12pt; }
.cap { font-size: 8pt; letter-spacing: .09em; text-transform: uppercase; color: #8A938E; margin-bottom: 4pt; }
section.dom { break-before: page; }
.risp { border: .6pt solid #D8D7D0; border-radius: 4pt; padding: 8pt 10pt 6pt; margin-bottom: 8pt; break-inside: avoid; }
.risp .lettera { float: left; width: 15pt; height: 15pt; margin: 0 8pt 2pt 0; border-radius: 50%; background: #0D5C48; color: #fff; font-size: 9pt; font-weight: 700; text-align: center; line-height: 15pt; }
.risp .testo { font-size: 9.6pt; }
.risp .testo p:last-child, .risp .testo ul:last-child, .risp .testo ol:last-child { margin-bottom: 0; }
ul, ol { margin: 0 0 7pt; padding-left: 15pt; }
li { margin-bottom: 2pt; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 0 0 8pt; }
th, td { border: .5pt solid #D8D7D0; padding: 3pt 5pt; text-align: left; }
th { background: #F1F1ED; font-weight: 650; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 9pt; }
.voto { clear: both; margin-top: 7pt; padding-top: 5pt; border-top: .5pt dashed #D8D7D0; display: flex; align-items: center; gap: 5pt; font-size: 8.5pt; color: #5A635E; }
.voto i { display: inline-block; width: 13pt; height: 13pt; border: .7pt solid #8A938E; border-radius: 50%; text-align: center; line-height: 12pt; font-style: normal; font-size: 8pt; color: #3C4742; }
.voto .nota { margin-left: auto; color: #A8AFAA; font-size: 7.5pt; }
.chiave table { font-size: 8.5pt; }
</style>${html}`;

// Con --html salva anche la pagina, utile per guardarla nel browser.
if (process.argv.includes('--html')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(dest.replace(/\.pdf$/, '.html'), pagina, 'utf-8');
  console.log('Scritto ' + dest.replace(/\.pdf$/, '.html'));
}

const browser = await chromium.launch();
const p = await browser.newPage();
await p.setContent(pagina, { waitUntil: 'load' });
await p.pdf({
  path: dest,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font:7.5pt -apple-system,sans-serif;color:#A8AFAA;padding:0 15mm;display:flex"><span>ReferralFlow · banco dei modelli · domande di medicina generale, nessun dato di pazienti</span><span style="margin-left:auto"><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>',
  margin: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' },
});
await browser.close();
console.log('Scritto ' + dest);
