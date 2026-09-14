// Sonda: com'è fatto DENTRO un riquadro dell'agenda MediOnline.
//
//   node mac/agenda-robot/sonda-riquadri.mjs [giorni-indietro]
//
// Serve quando si deve riconoscere un segno grafico nel riquadro (p.es.
// l'icona di stato della fatturazione: moneta = da fatturare, quadrato col
// visto verde = fatturato) e non si sa in che forma il portale lo scriva.
// Stampa la STRUTTURA dei primi riquadri — tag, classi, attributi, immagini
// di sfondo — con TUTTI I TESTI TOLTI: nessun dato di paziente esce di qui.
// Sola lettura come il resto del robot.

import { lanciaBrowser, leggiConf, modalitaSolaLettura } from './comune.mjs';
import { accediMediOnline, trovaElemento } from './riparatore.mjs';

const conf = leggiConf();
const INDIETRO = Math.min(30, Math.max(0, Number(process.argv[2] ?? 5)));

const browser = await lanciaBrowser({ fuoriSchermo: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 8 });
  const page = await context.newPage();
  await modalitaSolaLettura(page);
  await page.goto(conf.MEDIONLINE_URL, { waitUntil: 'domcontentloaded' });
  const { pagina: p, ok } = await accediMediOnline(context, page, conf);
  if (!ok) { console.log('login non riuscito'); process.exit(1); }
  console.log('login ok');

  const SELETTORI_VOCE = ['li#b2 a', 'a[onclick*="AGND_Affiche"]'];
  let voce = null;
  for (let giro = 0; giro < 15 && !voce; giro++) {
    if (giro > 0) await p.waitForTimeout(2500);
    for (const pg of context.pages()) {
      if (pg.isClosed()) continue;
      for (const sel of SELETTORI_VOCE) {
        const l = pg.locator(sel).first();
        if ((await l.count()) > 0) { voce = l; break; }
      }
      if (voce) break;
    }
  }
  if (!voce) { console.log('menu Agenda non trovato'); process.exit(1); }
  await voce.evaluate((el) => el.click());
  await p.waitForSelector('.WeekGrid_main', { timeout: 30_000 });

  const multi = p.locator('#ctl04_lkMulti');
  if ((await multi.count()) > 0 && !/\bon\b/.test((await multi.getAttribute('class')) ?? '')) {
    await multi.evaluate((el) => el.click());
    await p.waitForTimeout(2500);
  }
  const oggi = await trovaElemento(p, 'agenda_oggi', ['#ctl04_imbtnToday'], 'il bottone «oggi»',
    async (loc) => (await loc.count()) > 0);
  if (oggi) { await oggi.evaluate((el) => el.click()); await p.waitForTimeout(2500); }

  for (let g = 0; g < INDIETRO; g++) {
    const dietro = await trovaElemento(p, 'agenda_indietro', ['#ctl04_imgPrev', '#ctl04_imgPrevious'],
      'la freccia del giorno precedente', async (loc) => (await loc.count()) > 0);
    if (!dietro) break;
    await dietro.evaluate((el) => el.click());
    await p.waitForTimeout(1800);
  }
  await p.waitForSelector('.WeekGrid_main', { timeout: 30_000 });
  await p.waitForTimeout(1200);

  const esito = await p.evaluate(() => {
    // Struttura di un elemento, SENZA nessun nodo di testo.
    const struttura = (el, prof) => {
      if (prof > 8) return [];
      let r = '  '.repeat(prof) + el.tagName.toLowerCase();
      if (el.id) r += '#' + String(el.id).replace(/\d{3,}/g, 'N');
      if (el.classList.length) r += '.' + [...el.classList].join('.');
      for (const a of ['title', 'alt', 'src', 'role', 'onclick']) {
        const v = el.getAttribute(a);
        if (v) r += ` [${a}=${v.split('?')[0].split('/').pop().slice(0, 50)}]`;
      }
      const st = getComputedStyle(el);
      if (st.backgroundImage && st.backgroundImage !== 'none') {
        const m = st.backgroundImage.match(/url\(["']?([^"')]+)/);
        const nome = m ? (m[1].startsWith('data:') ? 'data:' + m[1].length + 'car' : m[1].split('?')[0].split('/').pop()) : st.backgroundImage.slice(0, 40);
        r += ` [sfondo=${nome}` + (st.backgroundPosition !== '0% 0%' ? ` pos:${st.backgroundPosition}` : '') + ']';
      }
      const inline = el.getAttribute('style');
      if (inline && /background|url\(/i.test(inline)) r += ` [style≈${inline.slice(0, 90)}]`;
      const testo = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (testo) r += ` {testo:${testo.length}car}`;
      const righe = [r];
      for (const f of el.children) righe.push(...struttura(f, prof + 1));
      return righe;
    };
    const box = [...document.querySelectorAll('.WeekGrid_event')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 4 && r.width > 4;
    });
    const data = (document.querySelector('#ctl04_UPHeader')?.innerText ?? '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
    // Si prendono riquadri DIVERSI fra loro: struttura uguale = uno solo.
    const viste = new Map();
    for (const el of box) {
      const s = struttura(el, 0).join('\n');
      const chiave = s.replace(/\{testo:\d+car\}/g, '{testo}');
      if (!viste.has(chiave)) viste.set(chiave, { s, n: 1 });
      else viste.get(chiave).n++;
    }
    return {
      data: data ? `${data[1]}.${data[2]}.${data[3]}` : '?',
      totale: box.length,
      varianti: [...viste.values()].sort((a, b) => b.n - a.n).slice(0, 12),
    };
  });

  console.log(`\nGiorno mostrato: ${esito.data} — ${esito.totale} riquadri, ${esito.varianti.length} strutture diverse\n`);
  esito.varianti.forEach((v, i) => {
    console.log(`───── VARIANTE ${i + 1} (×${v.n}) ─────`);
    console.log(v.s);
    console.log('');
  });
  // Con --dati: cerca nella pagina le strutture JavaScript di DayPilot (e
  // simili) che contengono gli appuntamenti. Stampa SOLO i nomi dei campi e il
  // tipo del valore, con la lunghezza per le stringhe: mai il contenuto.
  if (process.argv.includes('--dati')) {
    const trovato = await p.evaluate(() => {
      const fuori = [];
      const visti = new Set();
      const tipo = (v) => {
        if (v === null) return 'null';
        if (Array.isArray(v)) return `array[${v.length}]`;
        if (v instanceof Date) return 'data';
        if (typeof v === 'string') return `testo(${v.length})`;
        return typeof v;
      };
      // Un oggetto «appuntamento» ha un inizio e una fine o una durata.
      const sembraAppuntamento = (o) => {
        if (!o || typeof o !== 'object') return false;
        const k = Object.keys(o).map((x) => x.toLowerCase());
        return k.some((x) => /^(start|begin|debut|inizio|from)/.test(x)) &&
               k.some((x) => /^(end|fin|durée|duration|durata|to)/.test(x));
      };
      const guarda = (valore, percorso, prof) => {
        if (prof > 4 || fuori.length > 12) return;
        if (!valore || typeof valore !== 'object') return;
        if (visti.has(valore)) return;
        visti.add(valore);
        if (Array.isArray(valore)) {
          if (valore.length && sembraAppuntamento(valore[0])) {
            fuori.push({
              dove: percorso,
              quanti: valore.length,
              campi: Object.entries(valore[0]).map(([k, v]) => `${k}: ${tipo(v)}`).sort(),
            });
            return;
          }
          for (let i = 0; i < Math.min(3, valore.length); i++) guarda(valore[i], `${percorso}[${i}]`, prof + 1);
          return;
        }
        for (const k of Object.keys(valore)) {
          let v;
          try { v = valore[k]; } catch { continue; }
          guarda(v, `${percorso}.${k}`, prof + 1);
        }
      };
      for (const k of Object.keys(window)) {
        if (/^(document|location|navigator|history|external|frames|top|parent|self|window)$/.test(k)) continue;
        let v;
        try { v = window[k]; } catch { continue; }
        guarda(v, k, 0);
      }
      return fuori;
    });
    if (!trovato.length) console.log('\nNessuna struttura di appuntamenti trovata fra le variabili globali.');
    for (const t of trovato) {
      console.log(`\n═══ ${t.dove} — ${t.quanti} elementi, campi del primo:`);
      for (const c of t.campi) console.log('   ' + c);
    }
  }

  // Con --tag: guarda dentro dpc.events.list — struttura, non contenuti.
  // Delle stringhe esce la FORMA (lettere→a, cifre→9) e la lunghezza, mai il
  // testo: così si capisce se un campo è un id, una data o un nome, senza
  // leggere il nome.
  if (process.argv.includes('--tag')) {
    const fuori = await p.evaluate(() => {
      const forma = (s) => String(s).replace(/[A-ZÀ-Ý]/g, 'A').replace(/[a-zà-ÿ]/g, 'a').replace(/\d/g, '9').slice(0, 40);
      const descrivi = (v, prof = 0) => {
        if (v === null || v === undefined) return String(v);
        if (typeof v === 'string') return `testo(${v.length}) forma «${forma(v)}»`;
        if (typeof v === 'number' || typeof v === 'boolean') return `${typeof v}: ${v}`;
        if (Array.isArray(v)) return prof > 2 ? `array[${v.length}]` : `array[${v.length}] → ${v.map((x) => descrivi(x, prof + 1)).join(' | ')}`;
        if (typeof v === 'object') {
          const k = Object.keys(v);
          if (v.value !== undefined && k.length < 6) return `oggetto{${k.join(',')}} value=${descrivi(v.value, prof + 1)}`;
          return prof > 2 ? `oggetto{${k.join(',')}}` : `oggetto{${k.map((x) => `${x}=${descrivi(v[x], prof + 1)}`).join(', ')}}`;
        }
        return typeof v;
      };
      const lista = (window.dpc && window.dpc.events && window.dpc.events.list) || [];
      return {
        quanti: lista.length,
        esempi: lista.slice(0, 3).map((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, descrivi(v)]))),
      };
    });
    console.log(`\n═══ dpc.events.list: ${fuori.quanti} appuntamenti. Forma dei primi ${fuori.esempi.length} (mai i contenuti):`);
    fuori.esempi.forEach((e, i) => {
      console.log(`\n  — appuntamento ${i + 1}`);
      for (const [k, v] of Object.entries(e)) console.log(`    ${k}: ${v}`);
    });
  }

  // Con --agende: l'elenco delle agende come lo mostra MediOnline, con tutte
  // le etichette e i suggerimenti. Sono nomi di colonne, non dati di pazienti.
  if (process.argv.includes('--agende')) {
    const el = await p.evaluate(() => {
      const fuori = [];
      // la lista con le spunte delle agende
      for (const inp of document.querySelectorAll('input[type=checkbox]')) {
        const riga = inp.closest('tr, li, div');
        if (!riga) continue;
        const testo = (riga.innerText || '').replace(/\s+/g, ' ').trim();
        if (!testo || testo.length > 80) continue;
        fuori.push({
          spuntata: inp.checked,
          testo,
          titolo: inp.getAttribute('title') || riga.getAttribute('title') || '',
          id: inp.id || '',
        });
      }
      // eventuali tooltip sulle intestazioni di colonna
      const teste = [...document.querySelectorAll('.WeekGrid_colheader')].map((h) => ({
        testo: (h.innerText || '').trim(),
        titolo: h.getAttribute('title') || '',
      })).filter((x) => x.testo);
      return { fuori, teste };
    });
    console.log('\n═══ elenco delle agende (spunte):');
    for (const x of el.fuori) console.log(`   [${x.spuntata ? 'x' : ' '}] ${x.testo}${x.titolo ? '   → ' + x.titolo : ''}`);
    console.log('\n═══ intestazioni di colonna:');
    for (const t of el.teste) console.log(`   ${t.testo}${t.titolo ? '   → ' + t.titolo : ''}`);
  }

  // Con --risorse: la mappa risorsa → colonna, e la forma dell'html.
  if (process.argv.includes('--risorse')) {
    const r = await p.evaluate(() => {
      const col = (window.dpc && window.dpc.columns) || [];
      const figli = (col[0] && col[0].children) || [];
      const lista = (window.dpc && window.dpc.events && window.dpc.events.list) || [];
      return {
        colonne: figli.map((c) => ({ id: c.id ?? null, nome: c.name ?? null, campi: Object.keys(c) })),
        // dell'html esce solo lo SCHELETRO: i tag restano, il testo diventa «…»
        scheletri: [...new Set(lista.slice(0, 40).map((e) => String(e.html).replace(/>[^<]+/g, '>…')))].slice(0, 6),
      };
    });
    console.log('\n═══ colonne (risorse):');
    for (const c of r.colonne) console.log(`   id=${c.id} nome=${c.nome}`);
    console.log('\n═══ forma dell\'html dei riquadri (testo tolto):');
    for (const x of r.scheletri) console.log('   ' + x);
  }

  // Con --ritagli: il catalogo COMPLETO delle icone di stato, preso dal
  // foglio di stile (non dai riquadri a schermo, che ne mostrano solo alcuni)
  // e scaricato dal portale. Sono pittogrammi dell'interfaccia, non dati.
  if (process.argv.includes('--ritagli')) {
    const dir = process.env.SONDA_DIR || '/tmp';
    const catalogo = await p.evaluate(async () => {
      const trovate = new Map();
      for (const foglio of document.styleSheets) {
        let regole;
        try { regole = foglio.cssRules; } catch { continue; }
        for (const r of regole ?? []) {
          const sel = r.selectorText ?? '';
          const m = sel.match(/^\s*(?:[\w.#>\s]*\s)?i?\.(st\d+)\s*$/);
          if (!m) continue;
          const url = (r.style?.backgroundImage ?? '').match(/url\(["']?([^"')]+)/);
          if (url) trovate.set(m[1], url[1]);
        }
      }
      // In più: gli stati DAVVERO presenti nei riquadri a schermo, letti dallo
      // stile calcolato (alcune regole stanno in fogli non leggibili).
      for (const i of document.querySelectorAll('.WeekGrid_event_inner i, .WeekGrid_event i')) {
        const classe = [...i.classList].find((c) => /^st\d+$/.test(c));
        if (!classe || trovate.has(classe)) continue;
        const u = getComputedStyle(i).backgroundImage.match(/url\(["']?([^"')]+)/);
        if (u) trovate.set(classe, u[1]);
      }
      const fuori = [];
      for (const [classe, url] of trovate) {
        try {
          const risposta = await fetch(url);
          const buf = new Uint8Array(await risposta.arrayBuffer());
          let bin = '';
          for (const b of buf) bin += String.fromCharCode(b);
          fuori.push({ classe, nome: url.split('?')[0].split('/').pop(), b64: btoa(bin) });
        } catch (e) {
          fuori.push({ classe, nome: url.split('?')[0].split('/').pop(), errore: String(e).slice(0, 60) });
        }
      }
      return fuori.sort((a, b) => a.classe.localeCompare(b.classe, 'en', { numeric: true }));
    });
    const { writeFileSync } = await import('node:fs');
    for (const i of catalogo) {
      if (!i.b64) { console.log(`icona ${i.classe} (${i.nome}): ${i.errore}`); continue; }
      const dest = `${dir}/icona-${i.classe}-${i.nome}`;
      writeFileSync(dest, Buffer.from(i.b64, 'base64'));
      console.log(`icona: ${dest}`);
    }
  }
} finally {
  await browser.close();
}
