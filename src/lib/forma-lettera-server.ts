import 'server-only';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import mammoth from 'mammoth';
import { grassettiDaHtml, leggiPagina, leggiPgm, leggiTsv, righePerIlTesto, riordinaGrassetti, type Grassetto } from './forma-lettera';

// La forma della lettera vecchia letta dal FILE (6.10.2026): dal Word il
// grassetto com'è scritto; dal PDF (quasi sempre una scansione) l'immagine
// delle pagine — ghostscript le disegna, tesseract dà i riquadri delle
// parole, `forma-lettera.ts` misura il tratto e la geometria delle righe.
// Tutto in locale. Nei log solo numeri, mai il testo.

const GS = process.env.GS_BIN || '/opt/homebrew/bin/gs';
const TESSERACT = process.env.TESSERACT_BIN || '/opt/homebrew/bin/tesseract';
const LINGUE = process.env.OCR_LINGUE || 'ita+deu+fra+eng';
const MAX_PAGINE = 4;

function esegui(bin: string, args: string[], ms: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // stderr può contenere pezzi del documento: non si legge e non si registra.
    execFile(bin, args, { timeout: ms, maxBuffer: 1 << 27, encoding: 'buffer' }, (err, stdout) =>
      (err ? reject(Object.assign(new Error(path.basename(bin)), { code: (err as any).code ?? 'errore' })) : resolve(stdout as Buffer)));
  });
}

export type FormaLetta = { righe: string[]; grassetti: Grassetto[]; pagine: number; misurate: number };

// Le pagine `da`…`a` del PDF (al massimo quattro) lette dall'immagine: le
// righe del testo con righe vuote e a capo al loro posto, e il grassetto.
// null se gli strumenti mancano o qualcosa va storto: chi chiama resta al
// testo dell'OCR.
async function leggiPdf(body: Buffer, da: number, a: number): Promise<FormaLetta | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-forma-'));
  try {
    const ingresso = path.join(dir, 'in.pdf');
    await fs.writeFile(ingresso, body);
    const ultima = Math.min(a, da + MAX_PAGINE - 1);
    await esegui(GS, ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pgmraw', '-r300', `-dFirstPage=${da}`, `-dLastPage=${ultima}`, `-sOutputFile=${path.join(dir, 'p-%03d.pgm')}`, ingresso], 60_000);
    const file = (await fs.readdir(dir)).filter((n) => n.endsWith('.pgm')).sort();
    const viste = [];
    let misurate = 0;
    for (const f of file) {
      const tsv = await esegui(TESSERACT, [path.join(dir, f), '-', '-l', LINGUE, '--psm', '6', 'tsv'], 60_000);
      const pagina = leggiPagina(leggiPgm(await fs.readFile(path.join(dir, f))), leggiTsv(tsv.toString('utf-8')));
      misurate += pagina.misurate;
      viste.push(pagina.righe);
    }
    if (!viste.length) return null;
    return { righe: righePerIlTesto(viste), grassetti: riordinaGrassetti(viste.flat().flatMap((r) => r.grassetti), 200), pagine: viste.length, misurate };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Letture già fatte (per documento e pagine): la revisione richiede lo stato
// a ogni apertura, la pagina non si ridisegna ogni volta.
const fatte = new Map<string, Promise<FormaLetta | null>>();

export function formaDelPdf(chiave: string, body: Buffer, da: number, a: number): Promise<FormaLetta | null> {
  const k = `${chiave}:${da}-${a}`;
  let p = fatte.get(k);
  if (!p) {
    const t0 = Date.now();
    p = leggiPdf(body, da, a)
      .then((r) => { console.log(`[forma-lettera] ${chiave.slice(0, 8)} pp. ${da}-${a}: ${r ? `${r.pagine} pagine, ${r.misurate} parole misurate, ${r.grassetti.length} in grassetto` : 'niente'} (${Date.now() - t0} ms)`); return r; })
      .catch((e: any) => { console.error(`[forma-lettera] ${chiave.slice(0, 8)}: ${e?.code ?? e?.name ?? 'errore'}`); fatte.delete(k); return null; });
    fatte.set(k, p);
    if (fatte.size > 40) fatte.delete(fatte.keys().next().value as string);
  }
  return p;
}

export async function grassettiDelDocx(body: Buffer): Promise<Grassetto[]> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: body }, { ignoreEmptyParagraphs: false });
    return riordinaGrassetti(grassettiDaHtml(value), 200);
  } catch { return []; }
}
