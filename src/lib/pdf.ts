import 'server-only';

// Generatore PDF minimo, senza dipendenze: testo su A4 con Helvetica (font
// standard dei lettori PDF, niente da incorporare). Basta per il referto:
// intestazione, righe di metadati, corpo con a-capo e più pagine. I caratteri
// italiani (à è é ì ò ù, «») ci sono tutti nella codifica WinAnsi.

const PAGE_W = 595.28; // A4 in punti
const PAGE_H = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const BODY_LEAD = 16;

// Larghezze Helvetica (per mille) per i caratteri usati: bastano per andare a
// capo in modo decente. Per i caratteri fuori tabella si stima 500.
const W: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '%': 889, '&': 667, "'": 191, '(': 333,
  ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778,
  R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, ']': 278, _: 556, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278,
  g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556,
  p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500, à: 556, è: 556, é: 556, ì: 222, ò: 556, ù: 556, À: 667,
  È: 667, É: 667, Ì: 278, Ò: 778, Ù: 722, '’': 191, '‘': 191, '«': 556, '»': 556,
};

function larghezza(testo: string, size: number): number {
  let mille = 0;
  for (const ch of testo) mille += W[ch] ?? 500;
  return (mille / 1000) * size;
}

// Codifica WinAnsi (cp1252): copre l'italiano; ciò che non esiste diventa '?'.
function winAnsi(testo: string): number[] {
  const extra: Record<string, number> = {
    '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92,
    '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '«': 0xab, '»': 0xbb,
  };
  const out: number[] = [];
  for (const ch of testo) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (extra[ch] !== undefined) out.push(extra[ch]);
    else if (code >= 0xa0 && code <= 0xff) out.push(code);
    else out.push(0x3f); // ?
  }
  return out;
}

function pdfString(testo: string): string {
  const bytes = winAnsi(testo);
  let s = '';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
    else if (b >= 32 && b < 127) s += String.fromCharCode(b);
    else s += '\\' + b.toString(8).padStart(3, '0');
  }
  return `(${s})`;
}

function aCapo(testo: string, size: number, maxW: number): string[] {
  const righe: string[] = [];
  for (const paragrafo of testo.split('\n')) {
    if (!paragrafo.trim()) { righe.push(''); continue; }
    let riga = '';
    for (const parola of paragrafo.split(/\s+/)) {
      const tentativo = riga ? `${riga} ${parola}` : parola;
      if (larghezza(tentativo, size) <= maxW || !riga) riga = tentativo;
      else { righe.push(riga); riga = parola; }
    }
    if (riga) righe.push(riga);
  }
  return righe;
}

export type RefertoPdf = {
  studio: string;
  titolo: string;          // es. «Referto — Rossi Mario»
  meta: string[];          // righe piccole sotto il titolo (data, paziente…)
  corpo: string;           // il testo del referto
  avvertenza?: string;     // riga finale piccola
};

export function generaPdfReferto(r: RefertoPdf): Buffer {
  const maxW = PAGE_W - MARGIN * 2;

  // Contenuto per pagina: array di comandi testo.
  type Riga = { x: number; y: number; size: number; bold: boolean; testo: string };
  const pagine: Riga[][] = [[]];
  let y = PAGE_H - MARGIN;

  const scrivi = (testo: string, size: number, bold = false, lead = BODY_LEAD) => {
    for (const riga of aCapo(testo, size, maxW)) {
      if (y < MARGIN + BODY_LEAD) { pagine.push([]); y = PAGE_H - MARGIN; }
      if (riga) pagine[pagine.length - 1].push({ x: MARGIN, y, size, bold, testo: riga });
      y -= lead;
    }
  };

  scrivi(r.studio, 10, true, 14);
  y -= 6;
  scrivi(r.titolo, 16, true, 22);
  for (const m of r.meta) scrivi(m, 9.5, false, 13);
  y -= 10;
  scrivi(r.corpo, BODY_SIZE, false, BODY_LEAD);
  if (r.avvertenza) { y -= 12; scrivi(r.avvertenza, 8.5, false, 11); }

  // Assemblaggio del PDF: catalogo, pagine, due font, contenuti.
  const oggetti: string[] = [];
  const nPag = pagine.length;
  const kids = Array.from({ length: nPag }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
  oggetti.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  oggetti.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${nPag} >>\nendobj\n`);
  oggetti.push(
    `3 0 obj\n<< /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n` +
    `/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >>\nendobj\n`
  );
  pagine.forEach((righe, i) => {
    const contenuto = righe
      .map((r2) => `BT /${r2.bold ? 'F2' : 'F1'} ${r2.size} Tf ${r2.x.toFixed(1)} ${r2.y.toFixed(1)} Td ${pdfString(r2.testo)} Tj ET`)
      .join('\n');
    const stream = contenuto + '\n';
    oggetti.push(
      `${4 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font 3 0 R >> /Contents ${5 + i * 2} 0 R >>\nendobj\n`
    );
    oggetti.push(`${5 + i * 2} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream\nendobj\n`);
  });

  let corpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of oggetti) {
    offsets.push(Buffer.byteLength(corpo, 'latin1'));
    corpo += o;
  }
  const xrefPos = Buffer.byteLength(corpo, 'latin1');
  let xref = `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  corpo += xref;
  corpo += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}
