import 'server-only';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mammoth from 'mammoth';
import { testoDelPdf } from '../pressione/cartella-server';
import type { Formato } from './regole';

// Il testo di una lettera della cartella comune, per riconoscere il paziente e i doppioni (mai nei log).
// Word nuovo con mammoth; Word vecchio (.doc) con textutil di macOS, che sa anche convertirlo in .docx.

function textutil(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // stderr può contenere pezzi del documento: non si legge.
    execFile('/usr/bin/textutil', args, { timeout: 60_000, maxBuffer: 1 << 26 }, (err) =>
      (err ? reject(Object.assign(new Error('textutil'), { code: (err as any).code ?? 'errore' })) : resolve()));
  });
}

async function conDocVecchio<T>(dati: Buffer, fa: (ingresso: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-comune-'));
  try {
    const ingresso = path.join(dir, 'lettera.doc');
    await fs.writeFile(ingresso, dati, { mode: 0o600 });
    return await fa(ingresso, dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

export async function testoDi(dati: Buffer, formato: Formato): Promise<string> {
  try {
    if (formato === 'docx') return (await mammoth.extractRawText({ buffer: dati })).value;
    if (formato === 'pdf') return dati.subarray(0, 5).toString('latin1') === '%PDF-' ? await testoDelPdf(dati) : '';
    return await conDocVecchio(dati, async (ingresso, dir) => {
      const uscita = path.join(dir, 'lettera.txt');
      await textutil(['-convert', 'txt', '-encoding', 'UTF-8', '-output', uscita, ingresso]);
      return await fs.readFile(uscita, 'utf-8');
    });
  } catch { return ''; }
}

// Le prime pagine di una scansione senza testo, lette da Tesseract (per sapere di chi è: nome e data di nascita stanno
// all'inizio della cartella). Il resto lo fa l'OCR dei documenti, dopo il caricamento.
const GS = process.env.GS_BIN || '/opt/homebrew/bin/gs';
const TESSERACT = process.env.TESSERACT_BIN || '/opt/homebrew/bin/tesseract';
function esegui(bin: string, args: string[], ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: ms, maxBuffer: 1 << 26 }, (err, stdout) =>
      (err ? reject(Object.assign(new Error(path.basename(bin)), { code: (err as any).code ?? 'errore' })) : resolve(String(stdout))));
  });
}
export async function ocrPrimePagine(dati: Buffer, pagine = 3): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-comune-ocr-'));
  try {
    const ingresso = path.join(dir, 'in.pdf');
    await fs.writeFile(ingresso, dati, { mode: 0o600 });
    await esegui(GS, ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pnggray', '-r200', '-dFirstPage=1', `-dLastPage=${pagine}`, `-sOutputFile=${path.join(dir, 'p-%02d.png')}`, ingresso], 120_000);
    const testi: string[] = [];
    for (const f of (await fs.readdir(dir)).filter((n) => n.endsWith('.png')).sort()) testi.push(await esegui(TESSERACT, [path.join(dir, f), '-', '-l', 'ita+deu+fra+eng'], 120_000));
    return testi.join('\n');
  } catch { return ''; } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// Il Word vecchio diventa .docx: la piattaforma (dittafono, aggiornamento della lettera) legge solo quello.
export async function docxDaDoc(dati: Buffer): Promise<Buffer | null> {
  try {
    return await conDocVecchio(dati, async (ingresso, dir) => {
      const uscita = path.join(dir, 'lettera.docx');
      await textutil(['-convert', 'docx', '-output', uscita, ingresso]);
      return await fs.readFile(uscita);
    });
  } catch { return null; }
}
