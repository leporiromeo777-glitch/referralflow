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
        // Le griglie dei calendari hanno migliaia di celle identiche: i
        // sottoalberi ripetuti si comprimono in «(uguale ×N)», così la
        // fotografia arriva fino in fondo (dove stanno gli appuntamenti).
        function serializza(el, prof) {
          if (prof > 24) return null;
          const tag = el.tagName ? el.tagName.toLowerCase() : '';
          if (!tag || ['script', 'style', 'svg', 'noscript'].includes(tag)) return null;
          let r = '  '.repeat(prof) + tag;
          if (el.id) r += '#' + el.id;
          if (el.classList && el.classList.length) r += '.' + [...el.classList].join('.');
          for (const a of ['name', 'type', 'role', 'colspan', 'rowspan', 'href', 'onclick', 'title', 'style']) {
            const v = el.getAttribute && el.getAttribute(a);
            if (v) r += `[${a}≈${v.length > 60 ? v.slice(0, 60) + '…' : v.replace(/[0-9]{4,}/g, 'NNNN')}]`;
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
          const righe = [r];
          let prec = null;
          let uguali = 0;
          const chiudi = () => {
            if (prec === null) return;
            righe.push(...prec);
            if (uguali > 1) righe.push('  '.repeat(prof + 1) + `(uguale ×${uguali})`);
          };
          for (const f of el.children || []) {
            const sotto = serializza(f, prof + 1);
            if (!sotto) continue;
            const chiave = sotto.join('\n');
            if (prec !== null && chiave === prec.join('\n')) {
              uguali++;
              continue;
            }
            chiudi();
            prec = sotto;
            uguali = 1;
          }
          chiudi();
          return righe;
        }
        const tutte = serializza(document.body || document.documentElement, 0) || [];
        if (tutte.length > 6000) {
          tutte.length = 6000;
          tutte.push('… (fotografia tagliata a 6000 righe)');
        }
        return tutte.join('\n');
      });
    } catch {
      albero = '(frame non leggibile)';
    }
    perFrame.push(`===== FRAME: ${url}\n${albero}`);
  }
  return perFrame.join('\n\n');
}
