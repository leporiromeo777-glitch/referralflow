// Robot agenda MediOnline — pezzi comuni: configurazione, login, radiografia.
// Tutto gira SOLO sul Mac dello studio: credenziali e contenuti non escono.

import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function leggiConf() {
  const percorso = path.join(os.homedir(), '.referralflow-agenda.conf');
  const conf = {};
  try {
    for (const riga of readFileSync(percorso, 'utf-8').split('\n')) {
      const i = riga.indexOf('=');
      if (i > 0 && !riga.startsWith('#')) conf[riga.slice(0, i).trim()] = riga.slice(i + 1).trim();
    }
  } catch {
    console.error('Manca ' + percorso + ': esegui prima  bash mac/agenda-robot/installa.sh');
    process.exit(1);
  }
  for (const k of ['MEDIONLINE_URL', 'MEDIONLINE_UTENTE', 'MEDIONLINE_PASSWORD']) {
    if (!conf[k]) { console.error(`Manca ${k} in ${percorso}`); process.exit(1); }
  }
  return conf;
}

// ── REGOLA FERREA: SOLA LETTURA ──────────────────────────────────────────────
// Il robot GUARDA l'agenda e basta. Non crea, non modifica, non cancella,
// non conferma mai nulla su MediOnline. In concreto:
//   - l'unico modulo che compila è quello di LOGIN;
//   - gli unici clic ammessi sono quelli di navigazione scritti nel codice
//     (aprire l'agenda, cambiare giorno) — mai bottoni di salvataggio;
//   - il riparatore AI (riparatore.mjs) può solo TROVARE elementi: che cosa
//     farne lo decide il codice fisso, mai l'AI;
//   - ogni finestra di conferma che dovesse comparire viene RIFIUTATA.
// Questa funzione va chiamata su ogni pagina appena aperta.
const giaProtette = new WeakSet();
export async function modalitaSolaLettura(page) {
  if (giaProtette.has(page)) return;
  giaProtette.add(page);
  page.on('dialog', (d) => {
    console.log(`[sola-lettura] finestra «${d.type()}» rifiutata automaticamente`);
    d.dismiss().catch(() => {});
  });
}

// «Radiografia» di una pagina: struttura (tag, id, classi, attributi tecnici)
// più le sole etichette dell'interfaccia (intestazioni, bottoni, menu — dove
// possono comparire i nomi dei MEDICI, che servono e non sono dati di
// pazienti). Il contenuto delle celle — dove stanno i pazienti — non esce
// mai: si vede solo la lunghezza, o il formato per i numeri/orari.
export async function radiografiaPagina(page) {
  const perFrame = [];
  for (const frame of page.frames()) {
    // L'id di sessione ASP.NET sta nell'URL: si oscura.
    const url = frame.url().replace(/\(S\([^)]*\)\)/g, '(S(...))');
    let albero = '';
    try {
      albero = await frame.evaluate(() => {
        const righe = [];
        function visita(el, prof) {
          if (prof > 22 || righe.length > 2500) return;
          const tag = el.tagName ? el.tagName.toLowerCase() : '';
          if (!tag || ['script', 'style', 'svg', 'noscript'].includes(tag)) return;
          let r = '  '.repeat(prof) + tag;
          if (el.id) r += '#' + el.id;
          if (el.classList && el.classList.length) r += '.' + [...el.classList].join('.');
          for (const a of ['name', 'type', 'role', 'colspan', 'rowspan', 'href', 'onclick', 'title']) {
            const v = el.getAttribute && el.getAttribute(a);
            if (v) r += `[${a}≈${v.length > 40 ? v.slice(0, 40) + '…' : v.replace(/[0-9]{2,}/g, 'NN')}]`;
          }
          const testo = [...el.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent.trim())
            .join(' ')
            .trim();
          if (testo) {
            const uiChrome = ['th', 'button', 'label', 'option', 'a', 'legend', 'h1', 'h2', 'h3'].includes(tag);
            if (/^[\d.:\/\s\-–]+$/.test(testo)) {
              r += ` {num:«${testo.replace(/\d/g, 'N').slice(0, 20)}»}`;   // orari/date: solo il formato
            } else if (uiChrome) {
              r += ` {ui:«${testo.slice(0, 30)}»}`;                        // etichette dell'interfaccia
            } else {
              r += ` {testo:${testo.length} caratteri}`;                   // celle: mai il contenuto
            }
          }
          righe.push(r);
          for (const f of el.children || []) visita(f, prof + 1);
        }
        visita(document.body || document.documentElement, 0);
        return righe.join('\n');
      });
    } catch {
      albero = '(frame non leggibile)';
    }
    perFrame.push(`===== FRAME: ${url}\n${albero}`);
  }
  return perFrame.join('\n\n');
}
