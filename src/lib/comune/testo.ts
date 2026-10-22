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
