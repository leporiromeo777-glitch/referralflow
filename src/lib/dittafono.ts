import 'server-only';

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getFile, putFileAtKey } from './storage';

// File del dittafono Philips DPM (2026-09-07): i browser non suonano i
// .dss/.ds2, e i .ds2 (DSS Pro) NON li decodifica nemmeno ffmpeg (il suo
// dss_sp è un altro codec: esce rumore). Serve il decoder locale della
// catena (pipeline-referti/strumenti/dss-codec/ds2decode.py, Python +
// numpy), che sul Mac dello studio sta in ~/referti-pipeline. Il WAV
// convertito si salva UNA volta nello storage con chiave «<originale>.wav»:
// il player lo chiede a pezzi (richieste Range) e ogni richiesta deve
// costare una lettura, non una decodifica. Percorsi sovrascrivibili con
// DS2_DECODER (script) e DS2_DECODER_PYTHON (interprete con numpy).
// Mai contenuti nei log: solo il nome dell'errore.

const execFileP = promisify(execFile);
export const ESTENSIONI_DITTAFONO = new Set(['.dss', '.ds2']);
const DS2_DECODER = process.env.DS2_DECODER
  || path.join(os.homedir(), 'referti-pipeline', 'strumenti', 'dss-codec', 'ds2decode.py');
const DS2_PYTHON = process.env.DS2_DECODER_PYTHON || '/opt/homebrew/bin/python3.14';

export function estensioneDi(key: string): string {
  const punto = key.lastIndexOf('.');
  return punto === -1 ? '' : key.slice(punto).toLowerCase();
}

export function eDittafono(key: string, contentType: string | null | undefined): boolean {
  return contentType === 'audio/x-dss' || ESTENSIONI_DITTAFONO.has(estensioneDi(key));
}

async function convertiInWav(originale: Buffer, ext: string): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-audio-'));
  const ingresso = path.join(dir, `in${ext}`);
  const uscita = path.join(dir, 'out.wav');
  try {
    await fs.writeFile(ingresso, originale, { mode: 0o600 });
    const decoderPresente = ext === '.ds2' && await fs.access(DS2_DECODER).then(() => true, () => false);
    if (decoderPresente) {
      // cwd = cartella del decoder: carica i suoi codebook con percorso relativo.
      await execFileP(DS2_PYTHON, [DS2_DECODER, ingresso, uscita],
        { timeout: 600_000, maxBuffer: 1024 * 1024, cwd: path.dirname(DS2_DECODER) });
    } else {
      // «-f dss» forzato: l'autoriconoscimento di ffmpeg 8 non prende i DSS.
      await execFileP(
        process.env.FFMPEG_BIN || 'ffmpeg',
        ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'dss', '-i', ingresso,
          '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', uscita],
        { timeout: 120_000, maxBuffer: 1024 * 1024 }
      );
    }
    return await fs.readFile(uscita);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Conversioni in corso, per chiave: due richieste Range simultanee non
// devono lanciare due decodifiche.
const inCorso = new Map<string, Promise<Buffer | null>>();

// Il WAV di riascolto per un file del dittafono: dalla cache nello storage
// se c'è, altrimenti convertito e messo in cache. null se la conversione
// fallisce (il chiamante consegna l'originale così com'è).
export async function wavDaDittafono(key: string, originale?: Buffer): Promise<Buffer | null> {
  const chiaveWav = `${key}.wav`;
  try {
    const cache = await getFile(chiaveWav);
    if (cache.body.length > 44) return cache.body;
  } catch { /* non ancora convertito */ }
  const pendente = inCorso.get(key);
  if (pendente) return pendente;
  const lavoro = (async () => {
    try {
      const sorgente = originale ?? (await getFile(key)).body;
      const ext = ESTENSIONI_DITTAFONO.has(estensioneDi(key)) ? estensioneDi(key) : '.ds2';
      const inizio = Date.now();
      const wav = await convertiInWav(sorgente, ext);
      await putFileAtKey(chiaveWav, wav, 'audio/wav');
      console.log(`Dittafono: WAV di riascolto pronto (${Math.round((Date.now() - inizio) / 100) / 10} s, ${wav.length} byte)`);
      return wav;
    } catch (e: any) {
      console.error('Dittafono: conversione in WAV fallita:', e?.code ?? e?.name ?? 'errore');
      return null;
    } finally {
      inCorso.delete(key);
    }
  })();
  inCorso.set(key, lavoro);
  return lavoro;
}
