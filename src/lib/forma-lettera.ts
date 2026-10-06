// La FORMA della lettera vecchia: che cosa è in grassetto (6.10.2026,
// richiesta dello studio: «le parole in grassetto, l'andare a capo e tutte
// queste cose devono essere uguali»). PURO, niente AI.
// Le lettere vecchie in cartella sono quasi tutte scansioni: nel testo
// dell'OCR il grassetto non c'è. Qui lo si legge dall'IMMAGINE della pagina:
// per ogni parola (riquadri di tesseract) lo spessore del tratto, confrontato
// con quello normale della pagina. Dai Word si legge invece dal file.
// Il risultato sono FRASI in grassetto («Diagnosi:», «In conclusione»), non
// posizioni: valgono nella lettera nuova dove ricompare la stessa frase.

export type Pagina = { larghezza: number; altezza: number; px: Uint8Array };
export type Parola = { t: string; x: number; y: number; w: number; h: number; riga: string };
// `etichetta`: la frase apriva la riga (titolo o etichetta: «Diagnosi:»).
// `stacco`: com'era staccata dalla riga sopra (riga vuota o a capo semplice).
export type Grassetto = { testo: string; etichetta: boolean; stacco?: 'vuota' | 'capo' };

// Immagine in grigi come la scrive ghostscript (`pgmraw`, P5, 8 bit).
export function leggiPgm(buf: Buffer): Pagina {
  let i = 0;
  const campo = (): string => {
    while (i < buf.length && (buf[i] === 0x23 || buf[i] <= 0x20)) {
      if (buf[i] === 0x23) while (i < buf.length && buf[i] !== 0x0a) i++;
      else i++;
    }
    const da = i;
    while (i < buf.length && buf[i] > 0x20) i++;
    return buf.toString('latin1', da, i);
  };
  if (campo() !== 'P5') throw new Error('pgm');
  const larghezza = Number(campo()), altezza = Number(campo()), massimo = Number(campo());
  i++;
  if (!larghezza || !altezza || massimo !== 255 || buf.length - i < larghezza * altezza) throw new Error('pgm');
  return { larghezza, altezza, px: new Uint8Array(buf.buffer, buf.byteOffset + i, larghezza * altezza) };
}

// Le parole del TSV di tesseract (livello 5), con la loro riga.
export function leggiTsv(tsv: string): Parola[] {
  const out: Parola[] = [];
  for (const r of String(tsv || '').split('\n')) {
    const c = r.split('\t');
    if (c[0] !== '5' || c.length < 12) continue;
    const t = c.slice(11).join('\t').trim();
    if (!t || Number(c[10]) < 30) continue;
    out.push({ t, x: Number(c[6]), y: Number(c[7]), w: Number(c[8]), h: Number(c[9]), riga: `${c[2]}.${c[3]}.${c[4]}` });
  }
  return out;
}

// Soglia fra carta e inchiostro: a metà fra il grigio della carta (il più
// frequente nella metà chiara) e quello dell'inchiostro (il 2% più scuro).
export function sogliaInchiostro(pg: Pagina): number {
  const isto = new Uint32Array(256);
  for (let k = 0; k < pg.px.length; k += 7) isto[pg.px[k]]++;
  let carta = 255, max = 0;
  for (let v = 128; v < 256; v++) if (isto[v] > max) { max = isto[v]; carta = v; }
  const tot = Math.ceil(pg.px.length / 7);
  let somma = 0, inchiostro = 0;
  for (let v = 0; v < 256; v++) { somma += isto[v]; if (somma >= tot * 0.02) { inchiostro = v; break; } }
  return Math.round((carta + Math.min(inchiostro, carta - 40)) / 2);
}

const mediana = (v: number[]): number => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Spessore del tratto di una parola, in pixel: la media delle corse
// orizzontali d'inchiostro più corte dell'altezza della parola (le aste
// verticali; le corse lunghe sono tratti orizzontali o sottolineature).
export function trattoDi(pg: Pagina, p: Parola, soglia: number): number {
  const x1 = Math.min(pg.larghezza, p.x + p.w), y1 = Math.min(pg.altezza, p.y + p.h);
  const corse: number[] = [];
  for (let y = Math.max(0, p.y); y < y1; y++) {
    let lunga = 0;
    const riga = y * pg.larghezza;
    for (let x = Math.max(0, p.x); x <= x1; x++) {
      if (x < x1 && pg.px[riga + x] < soglia) lunga++;
      else { if (lunga > 0 && lunga <= p.h * 0.6) corse.push(lunga); lunga = 0; }
    }
  }
  if (corse.length < 12) return 0;
  corse.sort((a, b) => a - b);
  // Il quarto centrale: fuori le punte delle curve e le corse lunghe.
  const da = Math.floor(corse.length * 0.35), a = Math.ceil(corse.length * 0.65);
  let s = 0;
  for (let k = da; k < a; k++) s += corse[k];
  return s / Math.max(1, a - da);
}

const soloLettere = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '');

// Una riga della pagina come la si vede: il testo, lo stacco da quella sopra
// («vuota» = riga vuota in mezzo, «capo» = a capo voluto, null = il testo
// scorre dalla riga sopra) e le frasi in grassetto.
export type RigaVista = { testo: string; stacco: 'vuota' | 'capo' | null; grassetti: Grassetto[] };

// Una pagina letta dall'immagine. Ogni parola si misura (tratto diviso
// l'altezza della sua riga) e si confronta col valore NORMALE della pagina
// (la mediana: in una lettera il testo normale è la maggioranza). Parole di
// fila in grassetto sulla stessa riga fanno una frase; una parola sola in
// mezzo a una riga vale solo se il tratto è nettamente più spesso.
// Gli a capo si leggono dalla geometria: riga vuota = salto più alto del
// passo normale fra le righe; a capo voluto = la riga finisce prima del
// margine anche se la prima parola della riga sotto ci sarebbe stata.
export function leggiPagina(pg: Pagina, parole: Parola[], quanto = 1.3): { righe: RigaVista[]; misurate: number } {
  const soglia = Math.max(90, Math.min(200, sogliaInchiostro(pg)));
  const perRiga = new Map<string, Parola[]>();
  for (const p of parole) { const v = perRiga.get(p.riga) ?? []; v.push(p); perRiga.set(p.riga, v); }
  type M = { p: Parola; r: number };
  type R = { m: M[]; x: number; fine: number; centro: number };
  const righe: R[] = [];
  for (const v of perRiga.values()) {
    v.sort((a, b) => a.x - b.x);
    const alto = Math.max(...v.map((p) => p.h));
    if (alto < 8) continue;
    righe.push({
      m: v.map((p) => ({ p, r: soloLettere(p.t).length >= 2 ? trattoDi(pg, p, soglia) / alto : 0 })),
      x: v[0].x, fine: Math.max(...v.map((p) => p.x + p.w)), centro: mediana(v.map((p) => p.y + p.h / 2)),
    });
  }
  righe.sort((a, b) => a.centro - b.centro);
  const tutti = righe.flatMap((r) => r.m).filter((m) => m.r > 0).map((m) => m.r);
  const normale = mediana(tutti);
  const misurabile = tutti.length >= 20 && normale > 0;
  const forte = (m: M, q = quanto) => misurabile && m.r >= normale * q;

  // Geometria del testo: passo fra le righe, margine destro, larghezza di una lettera.
  const piene = righe.filter((r) => r.m.length >= 4);
  const passi: number[] = [];
  for (let i = 1; i < righe.length; i++) { const d = righe[i].centro - righe[i - 1].centro; if (d > 4) passi.push(d); }
  const passo = mediana(passi);
  const fini = piene.map((r) => r.fine).sort((a, b) => a - b);
  const margine = fini.length ? fini[Math.min(fini.length - 1, Math.floor(fini.length * 0.9))] : 0;
  const lettera = mediana(righe.flatMap((r) => r.m).filter((m) => m.p.t.length >= 3).map((m) => m.p.w / m.p.t.length)) || 10;

  const out: RigaVista[] = [];
  righe.forEach((riga, i) => {
    let stacco: RigaVista['stacco'] = null;
    if (i === 0) stacco = 'vuota';
    else {
      const sopra = righe[i - 1];
      if (passo && riga.centro - sopra.centro > passo * 1.55) stacco = 'vuota';
      else if (margine && margine - sopra.fine > riga.m[0].p.w + lettera * 2) stacco = 'capo';
    }
    const grassetti: Grassetto[] = [];
    let k = 0;
    while (k < riga.m.length) {
      if (!forte(riga.m[k])) { k++; continue; }
      let j = k;
      // Una parola non misurabile (un numero, «e», «:») in mezzo a due in
      // grassetto resta nella frase.
      while (j + 1 < riga.m.length && (forte(riga.m[j + 1]) || (riga.m[j + 1].r === 0 && j + 2 < riga.m.length && forte(riga.m[j + 2])))) j++;
      const testo = riga.m.slice(k, j + 1).map((m) => m.p.t).join(' ').trim();
      // In testa a un paragrafo; oppure in testa a una riga e chiusa dai due
      // punti («Fattori di rischio:» sotto una riga piena è un'etichetta lo stesso).
      const inizio = k === 0 && (stacco != null || /:$/.test(testo));
      const sicura = j > k || inizio || forte(riga.m[k], quanto + 0.15);
      // Fa andare a capo nella lettera nuova solo ciò che è davvero
      // un'etichetta: finisce coi due punti o è la riga intera (un titolo).
      const titolo = inizio && (/:$/.test(testo) || j === riga.m.length - 1);
      if (sicura && soloLettere(testo).length >= 3) grassetti.push({ testo, etichetta: inizio, ...(titolo ? { stacco: stacco ?? 'capo' } : {}) });
      k = j + 1;
    }
    // Una riga che si apre con un'etichetta in grassetto coi due punti è una
    // riga a sé anche se quella sopra arrivava al margine.
    if (!stacco && grassetti[0]?.etichetta && grassetti[0].stacco) stacco = 'capo';
    out.push({ testo: riga.m.map((m) => m.p.t).join(' '), stacco, grassetti });
  });
  return { righe: out, misurate: tutti.length };
}

// Il segno di «a capo voluto» fra le righe passate a `pulisciScansione`
// (una riga vuota è un paragrafo nuovo, questo è un a capo semplice).
export const A_CAPO = '\u0001';

// Le righe di più pagine come le vuole `pulisciScansione`: una riga per riga
// vista, con le righe vuote e gli a capo voluti al loro posto.
export function righePerIlTesto(pagine: RigaVista[][]): string[] {
  const out: string[] = [];
  pagine.forEach((righe, n) => righe.forEach((r, i) => {
    // Fra una pagina e l'altra il testo scorre, a meno che la pagina nuova apra un paragrafo vero.
    const stacco = n > 0 && i === 0 ? null : r.stacco;
    if (out.length && stacco === 'vuota') out.push('');
    else if (out.length && stacco === 'capo') out.push(A_CAPO);
    out.push(r.testo);
  }));
  return out;
}

// Dal Word: i pezzi in <strong> dell'HTML che ne ricava mammoth, paragrafo
// per paragrafo (etichetta = il grassetto apre il paragrafo; fa andare a
// capo se finisce coi due punti o è il paragrafo intero).
export function grassettiDaHtml(html: string): Grassetto[] {
  const out: Grassetto[] = [];
  const pulito = (s: string) => s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  let vuotoPrima = true;
  for (const par of String(html || '').match(/<(p|li|h\d|td)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g) ?? []) {
    const dentro = par.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
    const intero = pulito(dentro).trim();
    if (!intero) { vuotoPrima = true; continue; }
    const stacco = vuotoPrima ? 'vuota' as const : 'capo' as const;
    vuotoPrima = false;
    if (/^<h\d/.test(par)) { out.push({ testo: intero, etichetta: true, stacco }); continue; }
    const rx = /<strong>([\s\S]*?)<\/strong>/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(dentro))) {
      const t = pulito(m[1]).trim();
      if (soloLettere(t).length < 3) continue;
      const inizio = !pulito(dentro.slice(0, m.index)).trim();
      const titolo = inizio && (/:$/.test(t) || t === intero);
      out.push({ testo: t, etichetta: inizio, ...(titolo ? { stacco } : {}) });
    }
  }
  return out;
}

// Solo il grassetto del CORPO della lettera: le frasi che si ritrovano nel
// testo fra il saluto e i saluti finali (non carta intestata, titolo, firma).
export function grassettiDelCorpo(grassetti: Grassetto[], corpo: string): Grassetto[] {
  let c = ` ${chiaveLarga(corpo)} `;
  // I saluti finali: l'ULTIMA volta che compaiono, e solo nella seconda metà
  // (un «cordiali saluti» in alto è di un'altra lettera citata o di un biglietto).
  let fine = -1;
  for (const m of c.matchAll(/ (?:cordiali|distinti|migliori|cari) saluti /g)) fine = m.index ?? fine;
  if (fine > c.length / 2) c = `${c.slice(0, fine)} `;
  return grassetti.filter((g) => { const k = chiaveLarga(g.testo); return k.length >= 3 && c.includes(` ${k} `); });
}
const chiaveLarga = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Due letture dello stesso testo (strato dell'OCR e immagine riletta)? La
// quota delle parole lunghe della prima che la seconda ha.
export function stessoTesto(a: string, b: string): number {
  const pa = chiaveLarga(a).split(' ').filter((w) => w.length > 3);
  if (pa.length < 20) return 0;
  const pb = new Set(chiaveLarga(b).split(' '));
  return pa.filter((w) => pb.has(w)).length / pa.length;
}

// Elenco pulito: senza doppioni, le frasi più lunghe prima (così «Fattori di
// rischio» vince su «rischio»), mai più di `max`. Una frase vista sia come
// etichetta sia in mezzo al testo vale ovunque.
export function riordinaGrassetti(tutti: Grassetto[], max = 40): Grassetto[] {
  const visti = new Map<string, Grassetto>();
  for (const g of tutti) {
    const testo = g.testo.replace(/\s+/g, ' ').trim();
    if (soloLettere(testo).length < 3 || testo.length > 160) continue;
    const k = chiave(testo);
    const c = visti.get(k);
    if (!c) visti.set(k, { testo, etichetta: g.etichetta, ...(g.etichetta && g.stacco ? { stacco: g.stacco } : {}) });
    else if (c.etichetta && !g.etichetta) { c.etichetta = false; delete c.stacco; }
  }
  return [...visti.values()].sort((a, b) => b.testo.length - a.testo.length).slice(0, max);
}

const chiave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s:;,.]+$/g, '').replace(/\s+/g, ' ').trim();

// Le CATEGORIE (6.10.2026, precisazione dello studio): il grassetto delle
// lettere è quasi sempre l'etichetta di una categoria — fattori di rischio
// cardiovascolari, comorbidità, allergie, terapia… — e le categorie sono
// sempre le stesse anche se scritte in modi diversi («FRCV», «Fattori di
// rischio cardiovascolari»). Se le lettere del paziente hanno in grassetto
// l'etichetta di una categoria, nella lettera nuova va in grassetto (e a
// capo allo stesso modo) l'etichetta di QUELLA categoria comunque sia
// scritta, purché apra una frase e finisca coi due punti.
const FAMIGLIE: [string, RegExp][] = [
  ['frcv', /^(?:frcv|fdrcv|fdr cv|fr cv|fattori di rischio(?: cardio ?vascolar[ei]| cv)?|rischio cardiovascolare|profilo di rischio(?: cardiovascolare)?)$/],
  ['comorbidita', /^(?:comorbidita|comorbilita|co morbidita|comorbidita note|patologie associate|patologie concomitanti|altre patologie|malattie associate|altre diagnosi|diagnosi secondarie)$/],
  ['allergie', /^(?:allergi[ae]|allergie note|intolleranze|allergie e intolleranze|allergie intolleranze)$/],
  ['terapia', /^(?:terapia|terapia attuale|terapia in atto|terapia in corso|terapia abituale|terapia farmacologica|terapia domiciliare|terapia medicamentosa|terapia cardiologica|farmaci|medicamenti)$/],
  ['diagnosi', /^(?:diagnosi|diagnosi principale|diagnosi principali|diagnosi cardiologic[ah]e?|diagnosi cardiovascolar[ei]|lista dei problemi|problemi)$/],
  ['anamnesi_familiare', /^(?:anamnesi familiare|familiarita)$/],
  ['anamnesi', /^(?:anamnesi|anamnesi attuale|anamnesi recente|anamnesi intermedia|anamnesi cardiologica|anamnesi remota|anamnesi patologica(?: remota| prossima)?|anamnesi personale|anamnesi sociale|motivo della visita|motivo della consultazione|motivo del controllo|motivo)$/],
  ['esame', /^(?:esame clinico|esame obiettivo|esame fisico|status|stato clinico|obiettivita|parametri|parametri vitali|clinicamente)$/],
  ['ecg', /^(?:ecg|ecg a riposo|ecg basale|elettrocardiogramma(?: a riposo| basale)?)$/],
  ['eco', /^(?:eco|ett|ecocardiogramma(?: transtoracico| doppler| color ?doppler)?|ecocardiografia(?: transtoracica| doppler)?|eco ?color ?doppler cardiaco)$/],
  ['sforzo', /^(?:ergometria|cicloergometria|spiroergometria|test da sforzo|prova da sforzo|ecg da sforzo|test ergometrico)$/],
  ['holter', /^(?:holter|holter ecg|ecg holter|ecg dinamico|holter pressorio|mapa)$/],
  ['laboratorio', /^(?:laboratorio|esami di laboratorio|esami ematici|esami ematochimici|esami del sangue|esami)$/],
  ['conclusione', /^(?:conclusion[ei]|in conclusione|valutazione|giudizio|giudizio clinico|sintesi|riassunto|commento|discussione|epicrisi)$/],
  ['procedere', /^(?:procedere|proposte|proposta|programma|piano|raccomandazioni|consigli|prossimo controllo|controllo|controlli)$/],
];
export function famigliaDi(testo: string): string | null {
  const k = chiaveLarga(testo);
  if (!k || k.length > 48) return null;
  for (const [nome, rx] of FAMIGLIE) if (rx.test(k)) return nome;
  return null;
}
// Il modello della categoria, per la pagina (che dipinge con la stessa regola).
export const modelloFamiglia = (famiglia: string | null): string | null => FAMIGLIE.find(([n]) => n === famiglia)?.[1].source ?? null;
// L'etichetta in testa a una frase: fino a 45 caratteri, poi i due punti.
const RX_ETICHETTA_IN_TESTA = /(^|[.!?]\s+)([\s•\-–]*)([^\n:.!?;]{2,45}):/gu;

export type Pezzo = { t: string; b: boolean };

// Una riga della lettera nuova divisa in pezzi normali e in grassetto.
// Un'etichetta vale solo in testa alla riga o a una frase; le altre frasi
// dove ricompaiono, a parola intera, senza badare a maiuscole e accenti. I
// due punti attaccati all'etichetta vanno in grassetto con lei, come nella
// lettera vecchia se lì c'erano.
export function applicaGrassetti(riga: string, grassetti: Grassetto[]): Pezzo[] {
  const s = String(riga ?? '');
  if (!s.trim() || !grassetti.length) return [{ t: s, b: false }];
  const segni = new Uint8Array(s.length);
  for (const g of grassetti) {
    const k = chiave(g.testo);
    if (!k) continue;
    const corpo = k.split(' ').map((w) => w.split('').map((ch) => lettera(ch)).join('')).join('\\s+');
    const coda = /[:;,.]\s*$/.test(g.testo) ? '[:;,.]?' : '';
    const rx = new RegExp(`(?<![\\p{L}\\p{N}])${corpo}(?![\\p{L}\\p{N}])${coda}`, 'giu');
    let m: RegExpExecArray | null;
    while ((m = rx.exec(s))) {
      if (!m[0].length) { rx.lastIndex++; continue; }
      if (g.etichetta && !/(^|[.!?]\s+)$/.test(s.slice(0, m.index).replace(/^[\s•\-–]+/, ''))) continue;
      let libero = true;
      for (let i = m.index; i < m.index + m[0].length; i++) if (segni[i]) { libero = false; break; }
      if (libero) segni.fill(1, m.index, m.index + m[0].length);
    }
  }
  // Le categorie: un'etichetta della stessa famiglia di una in grassetto
  // nelle lettere vecchie, in testa a una frase e coi due punti.
  const famiglie = new Map<string, Grassetto>();
  for (const g of grassetti) { if (!g.etichetta) continue; const f = famigliaDi(g.testo); if (f && !famiglie.has(f)) famiglie.set(f, g); }
  if (famiglie.size) {
    for (const m of s.matchAll(RX_ETICHETTA_IN_TESTA)) {
      const g = famiglie.get(famigliaDi(m[3]) ?? '');
      if (!g) continue;
      const da = (m.index ?? 0) + m[1].length + m[2].length;
      const a = da + m[3].length + (/:\s*$/.test(g.testo) ? 1 : 0);
      let libero = true;
      for (let i = da; i < a; i++) if (segni[i]) { libero = false; break; }
      if (libero) segni.fill(1, da, a);
    }
  }
  const out: Pezzo[] = [];
  for (let i = 0; i < s.length; i++) {
    const b = segni[i] === 1;
    const u = out[out.length - 1];
    if (u && u.b === b) u.t += s[i]; else out.push({ t: s[i], b });
  }
  return out;
}

// Una lettera del modello: senza accento nella chiave, con o senza nel testo.
function lettera(ch: string): string {
  const accenti: Record<string, string> = { a: '[aàáâä]', e: '[eèéêë]', i: '[iìíîï]', o: '[oòóôö]', u: '[uùúûü]', c: '[cç]' };
  return accenti[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
