// Saturazione notturna (22.10.2026, [[Piattaforma/Saturazione notturna]]) — la parte PURA.
//
// Le notti arrivano dal generatore dei referti dello studio (scheda «Sonno · O2Ring»), già lette e calcolate
// dal suo o2ring.js: per ogni notte inizio e fine, durata, saturazione media/minima/massima, frequenza cardiaca, tempo
// sotto il 90%, cadute ≥3% e ≥4% (ODI), istogramma, una curva ridotta a un punto ogni 30 s e i minuti delle cadute ≥4%.
// Qui si CONTROLLA ciò che arriva (forma e limiti: niente di più grande o di diverso da una notte di un saturimetro) e si
// fanno i totali di tutte le notti allo stesso modo del generatore (`unisci`), così la pagina mostra gli stessi numeri
// del rapporto che il medico ha confermato. Gli istanti sono «ora del paziente» codificata in UTC, come nel generatore.

export const MASSIMO_NOTTI = 14;
export const MASSIMO_PUNTI = 2400;          // 20 ore a un punto ogni 30 s
export const MASSIMO_REFERTO = 8 * 1024 * 1024;

export type Notte = {
  inizio: number; fine: number; durata: number; valide: number; passo: number;
  spo2: { media: number | null; min: number | null; max: number | null };
  fc: { media: number | null; min: number | null; max: number | null };
  t90: number; cad3: number; cad4: number; odi3: number; odi4: number;
  hist: Record<string, number>; nValide: number;
  serie: { m: number; s: number | null; f: number | null }[];
  eventi4: number[];
};
export type Totale = {
  notti: number; durata: number; valide: number; t90: number; t90pct: number | null; cad3: number; cad4: number; odi3: number; odi4: number;
  media: number | null; min: number | null; max: number | null; fcmedia: number | null; fcmin: number | null; fcmax: number | null;
  hist: Record<string, number>;
};
export type Invio = {
  chi: { cognome: string; nome: string; nascita: string };
  apparecchio: string;
  notti: Notte[];
  totale: Totale;
  nota: string | null;
  valutazione: string | null;
  referto: { nome: string; dati: Buffer; tipo: 'pdf' | 'docx' } | null;
};

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const intero = (v: unknown, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= hi ? v : null);
const pulisciNome = (s: unknown) => String(s ?? '').replace(/[^A-Za-zÀ-ÿ '’-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const testo = (s: unknown, max: number) => { const t = String(s ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max); return t || null; };
const ANNI = [Date.UTC(2020, 0, 1), Date.UTC(2100, 0, 1)];

function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
// «12.03.1961» o «1961-03-12» → «1961-03-12»
function nascitaIso(s: unknown): string {
  const v = String(s ?? '').trim();
  const a = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  const iso = a ? `${a[3]}-${a[2].padStart(2, '0')}-${a[1].padStart(2, '0')}` : v;
  return dataValida(iso) ? iso : '';
}
// Nome del file del referto: solo caratteri sicuri.
export function nomeReferto(s: unknown, tipo: 'pdf' | 'docx'): string {
  const base = String(s ?? '').replace(/\.(pdf|docx)$/i, '').replace(/[^A-Za-zÀ-ÿ0-9 ._()-]+/g, ' ').replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s.]+/, '').trim().slice(0, 120);
  return `${base || 'Rapporto del sonno'}.${tipo}`;
}

// Una notte come la manda il generatore (l'oggetto «analisi» di o2ring.js) → controllata, o il perché no.
export function notteValida(x: unknown): Notte | string {
  const n = (x ?? {}) as Record<string, any>;
  const inizio = num(n.inizio, ANNI[0], ANNI[1]), fine = num(n.fine, ANNI[0], ANNI[1]);
  if (inizio === null || fine === null || fine <= inizio || fine - inizio > 20 * 3600000) return 'inizio e fine non validi';
  const durata = num(n.durata, 0, 1200), valide = num(n.valide, 0, 1200), passo = num(n.passo, 0.5, 120);
  if (durata === null || valide === null || passo === null || valide > durata + 1) return 'durata non valida';
  const tre = (o: any, lo: number, hi: number) => ({ media: o?.media == null ? null : num(o.media, lo, hi), min: o?.min == null ? null : num(o.min, lo, hi), max: o?.max == null ? null : num(o.max, lo, hi) });
  const spo2 = tre(n.spo2, 50, 100), fc = tre(n.fc, 20, 250);
  if (spo2.media === null || spo2.min === null || spo2.max === null) return 'saturazione mancante';
  if ([n.fc?.media, n.fc?.min, n.fc?.max].some((v, i) => v != null && [fc.media, fc.min, fc.max][i] === null)) return 'frequenza cardiaca fuori scala';
  const t90 = num(n.t90, 0, 1200), cad3 = intero(n.cad3, 20000), cad4 = intero(n.cad4, 20000), odi3 = num(n.odi3, 0, 500), odi4 = num(n.odi4, 0, 500), nValide = intero(n.nValide, 200000);
  if (t90 === null || cad3 === null || cad4 === null || odi3 === null || odi4 === null || nValide === null || cad4 > cad3) return 'valori della notte non validi';
  const hist: Record<string, number> = {};
  for (const [k, v] of Object.entries((n.hist ?? {}) as Record<string, unknown>)) {
    if (!/^\d{2,3}$/.test(k) || +k < 50 || +k > 100) return 'istogramma non valido';
    const c = intero(v, 200000); if (c === null) return 'istogramma non valido';
    hist[k] = c;
  }
  if (!Array.isArray(n.serie) || n.serie.length > MASSIMO_PUNTI) return 'curva non valida';
  const serie: Notte['serie'] = [];
  for (const p of n.serie) {
    const m = num(p?.m, 0, 1200); if (m === null) return 'curva non valida';
    serie.push({ m, s: p?.s == null ? null : num(p.s, 50, 100), f: p?.f == null ? null : num(p.f, 20, 250) });
  }
  if (!Array.isArray(n.eventi4) || n.eventi4.length > 20000) return 'cadute non valide';
  const eventi4: number[] = [];
  for (const e of n.eventi4) { const m = num(e, 0, 1200); if (m === null) return 'cadute non valide'; eventi4.push(m); }
  return { inizio, fine, durata, valide, passo, spo2, fc, t90, cad3, cad4, odi3, odi4, hist, nValide, serie, eventi4 };
}

// Tutte le notti insieme, come `unisci` del generatore: in ordine di tempo, la stessa notte una volta sola.
export function unisci(notti: Notte[]): { notti: Notte[]; totale: Totale } {
  const ord = notti.slice().sort((a, b) => a.inizio - b.inizio).filter((n, i, a) => !i || Math.abs(n.inizio - a[i - 1].inizio) > 60000);
  let durata = 0, valide = 0, t90 = 0, cad3 = 0, cad4 = 0, nV = 0, sS = 0, sF = 0, nF = 0;
  let min: number | null = null, max: number | null = null, fcmin: number | null = null, fcmax: number | null = null;
  const hist: Record<string, number> = {};
  for (const n of ord) {
    durata += n.durata; valide += n.valide; t90 += n.t90; cad3 += n.cad3; cad4 += n.cad4;
    if (n.spo2.media !== null) { sS += n.spo2.media * n.nValide; nV += n.nValide; }
    if (n.fc.media !== null) { sF += n.fc.media * n.nValide; nF += n.nValide; }
    if (n.spo2.min !== null) min = min === null ? n.spo2.min : Math.min(min, n.spo2.min);
    if (n.spo2.max !== null) max = max === null ? n.spo2.max : Math.max(max, n.spo2.max);
    if (n.fc.min !== null) fcmin = fcmin === null ? n.fc.min : Math.min(fcmin, n.fc.min);
    if (n.fc.max !== null) fcmax = fcmax === null ? n.fc.max : Math.max(fcmax, n.fc.max);
    for (const [k, v] of Object.entries(n.hist)) hist[k] = (hist[k] ?? 0) + v;
  }
  const ore = valide / 60 || 1;
  return {
    notti: ord,
    totale: {
      notti: ord.length, durata, valide, t90, t90pct: valide ? (t90 / valide) * 100 : null, cad3, cad4, odi3: cad3 / ore, odi4: cad4 / ore,
      media: nV ? sS / nV : null, min, max, fcmedia: nF ? sF / nF : null, fcmin, fcmax, hist,
    },
  };
}

// Quanto è frequente il cadere della saturazione (ODI 4%), come lo scrive il rapporto del generatore: indicativo,
// meno di 5 all'ora nella norma, 5–15 lieve, 15–30 moderato, oltre 30 marcato. La valutazione resta del medico.
export type Livello = 'norma' | 'lieve' | 'moderato' | 'marcato';
export function livelloOdi(odi4: number | null): Livello | null {
  if (odi4 === null || !Number.isFinite(odi4)) return null;
  return odi4 < 5 ? 'norma' : odi4 < 15 ? 'lieve' : odi4 < 30 ? 'moderato' : 'marcato';
}
export const NOME_LIVELLO: Record<Livello, string> = { norma: 'nella norma', lieve: 'lieve', moderato: 'moderato', marcato: 'marcato' };

// L'impronta di un invio: lo stesso paziente con le stesse notti è lo stesso invio (niente doppioni se si rimanda),
// comunque sia scritto il nome (ordine delle parole, maiuscole, accenti).
export function impronta(chi: Invio['chi'], notti: Notte[]): string {
  const parole = `${chi.cognome} ${chi.nome}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[\s'’-]+/).filter(Boolean).sort().join(' ');
  return `${parole}|${chi.nascita}|${notti.map((n) => Math.round(n.inizio / 60000)).join(',')}`;
}

// Un istante del generatore («ora del paziente» in UTC) → «AAAA-MM-GGThh:mm» per il database.
export function ora(t: number): string { return new Date(t).toISOString().slice(0, 16); }

export function validaInvio(corpo: unknown): Invio | { errore: string } {
  const c = (corpo ?? {}) as Record<string, any>;
  const p = (c.paziente ?? {}) as Record<string, unknown>;
  const cognome = pulisciNome(p.cognome), nome = pulisciNome(p.nome), nascita = nascitaIso(p.data_nascita ?? p.nascita);
  if (!cognome || !nome) return { errore: 'Mancano cognome e nome del paziente.' };
  if (!nascita) return { errore: 'Manca la data di nascita del paziente (serve per riconoscerlo).' };
  if (!Array.isArray(c.notti) || !c.notti.length) return { errore: 'Manca almeno una notte.' };
  if (c.notti.length > MASSIMO_NOTTI) return { errore: `Troppe notti (${c.notti.length}): al massimo ${MASSIMO_NOTTI}.` };
  const notti: Notte[] = [];
  for (let i = 0; i < c.notti.length; i++) {
    const n = notteValida(c.notti[i]);
    if (typeof n === 'string') return { errore: `Notte ${i + 1}: ${n}.` };
    notti.push(n);
  }
  const u = unisci(notti);
  let referto: Invio['referto'] = null;
  if (c.referto != null) {
    const pdf = c.referto.pdf_base64, docx = c.referto.docx_base64;
    const b64 = String(pdf ?? docx ?? ''), tipo: 'pdf' | 'docx' = pdf != null ? 'pdf' : 'docx';
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length > Math.ceil(MASSIMO_REFERTO / 3) * 4) return { errore: 'Il referto non è valido o è troppo grande.' };
    const dati = Buffer.from(b64, 'base64');
    const giusto = tipo === 'pdf' ? dati.subarray(0, 5).toString('latin1') === '%PDF-' : dati.length > 4 && dati[0] === 0x50 && dati[1] === 0x4b;
    if (!giusto) return { errore: tipo === 'pdf' ? 'Il referto non è un PDF.' : 'Il referto non è un file Word (.docx).' };
    referto = { nome: nomeReferto(c.referto.nome_file, tipo), dati, tipo };
  }
  return {
    chi: { cognome, nome, nascita },
    apparecchio: String(c.apparecchio ?? 'O2Ring').replace(/[^A-Za-zÀ-ÿ0-9 .()-]+/g, ' ').trim().slice(0, 40) || 'O2Ring',
    notti: u.notti, totale: u.totale,
    nota: testo(c.nota, 600), valutazione: testo(c.valutazione, 4000),
    referto,
  };
}
