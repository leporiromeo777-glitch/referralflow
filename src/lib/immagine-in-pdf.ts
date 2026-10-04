import 'server-only';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

// TIFF degli scanner e foto HEIC dell'iPhone in PDF (4.10.2026): così si
// vedono nel visore come gli altri, passano dall'OCR e si cercano. TIFF a più
// pagine → PDF a più pagine (img2pdf, senza perdita); HEIC prima in JPEG con
// `sips` (macOS). Se la conversione non riesce si tiene il file com'è.
const ESEGUI = (cmd: string, args: string[]) => new Promise<void>((ok, no) =>
  execFile(cmd, args, { timeout: 120_000 }, (e) => (e ? no(e) : ok())));
const IMG2PDF = process.env.IMG2PDF || '/opt/homebrew/bin/img2pdf';

export function daConvertire(ext: string): boolean {
  return ['.tif', '.tiff', '.heic', '.heif'].includes(ext);
}

export async function inPdf(dati: Buffer, ext: string): Promise<Buffer | null> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rf-img-'));
  try {
    let entrata = path.join(dir, `in${ext}`);
    await writeFile(entrata, dati);
    if (ext === '.heic' || ext === '.heif') {
      const jpg = path.join(dir, 'in.jpg');
      await ESEGUI('/usr/bin/sips', ['-s', 'format', 'jpeg', entrata, '--out', jpg]);
      entrata = jpg;
    }
    const pdf = path.join(dir, 'out.pdf');
    try {
      await ESEGUI(IMG2PDF, ['--output', pdf, entrata]);
    } catch {
      // img2pdf rifiuta le immagini con canale alfa (trasparenza): si passa
      // da un JPEG (solo la prima pagina, se il TIFF ne aveva più d'una).
      const jpg = path.join(dir, 'piatta.jpg');
      await ESEGUI('/usr/bin/sips', ['-s', 'format', 'jpeg', entrata, '--out', jpg]);
      await ESEGUI(IMG2PDF, ['--output', pdf, jpg]);
    }
    const out = await readFile(pdf);
    return out.length > 0 ? out : null;
  } catch (e: any) {
    console.error(`[cartella] conversione in PDF non riuscita (${ext}): ${e?.code ?? e?.name ?? 'errore'}`);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
