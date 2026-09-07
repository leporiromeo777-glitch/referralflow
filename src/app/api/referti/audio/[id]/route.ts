import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';

export const runtime = 'nodejs';

// Riascolto dell'audio di un referto (player nel dettaglio bozza).
// Supporta le richieste Range (206): senza, il browser non può spostare il
// cursore avanti/indietro nella traccia — Safari nemmeno mostra la durata.
// Solo utenti dello studio proprietario.
// Formati del dittafono (DSS/DSS Pro, 2026-09-07): il browser non li sa
// suonare, quindi si convertono al volo in WAV con ffmpeg (file temporaneo
// cancellato subito, mai in log). Senza ffmpeg si consegna il file originale
// così com'è (scaricabile, non riproducibile in pagina).

const execFileP = promisify(execFile);
const ESTENSIONI_DITTAFONO = new Set(['.dss', '.ds2']);

function estensioneDi(key: string): string {
  const punto = key.lastIndexOf('.');
  return punto === -1 ? '' : key.slice(punto).toLowerCase();
}

// I .ds2 (DSS Pro) NON li decodifica ffmpeg (il suo dss_sp è un altro codec e
// produce rumore): serve il decoder locale della catena
// (pipeline-referti/strumenti/dss-codec/ds2decode.py, Python + numpy), che
// sul Mac dello studio sta in ~/referti-pipeline. Percorsi sovrascrivibili
// con DS2_DECODER (script) e DS2_DECODER_PYTHON (interprete con numpy).
const DS2_DECODER = process.env.DS2_DECODER
  || path.join(os.homedir(), 'referti-pipeline', 'strumenti', 'dss-codec', 'ds2decode.py');
const DS2_PYTHON = process.env.DS2_DECODER_PYTHON || '/opt/homebrew/bin/python3.14';

async function convertiInWav(originale: Buffer, ext: string): Promise<Buffer | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-audio-'));
  const ingresso = path.join(dir, `in${ext}`);
  const uscita = path.join(dir, 'out.wav');
  try {
    await fs.writeFile(ingresso, originale, { mode: 0o600 });
    const decoderPresente = ext === '.ds2' && await fs.access(DS2_DECODER).then(() => true, () => false);
    if (decoderPresente) {
      // cwd = cartella del decoder: carica i suoi codebook con percorso relativo.
      await execFileP(DS2_PYTHON, [DS2_DECODER, ingresso, uscita],
        { timeout: 300_000, maxBuffer: 1024 * 1024, cwd: path.dirname(DS2_DECODER) });
    } else {
      await execFileP(
        process.env.FFMPEG_BIN || 'ffmpeg',
        // «-f dss» forzato: l'autoriconoscimento di ffmpeg 8 non prende i DSS.
        ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-f', 'dss', '-i', ingresso,
          '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', uscita],
        { timeout: 120_000, maxBuffer: 1024 * 1024 }
      );
    }
    return await fs.readFile(uscita);
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });

  const [audio] = await query<{ storage_key: string; content_type: string | null }>(
    `select storage_key, content_type from referti_audio
      where id = $1 and studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!audio) return new NextResponse('Non trovato', { status: 404 });

  const letto = await getFile(audio.storage_key);
  let body = letto.body;
  let tipo = audio.content_type ?? letto.contentType ?? 'application/octet-stream';
  const ext = estensioneDi(audio.storage_key);
  if (tipo === 'audio/x-dss' || ESTENSIONI_DITTAFONO.has(ext)) {
    const wav = await convertiInWav(body, ESTENSIONI_DITTAFONO.has(ext) ? ext : '.dss');
    if (wav) {
      body = wav;
      tipo = 'audio/wav';
    }
  }
  const totale = body.length;

  const range = req.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] !== '' || m[2] !== '')) {
    let inizio = m[1] === '' ? Math.max(0, totale - Number(m[2])) : Number(m[1]);
    let fine = m[1] !== '' && m[2] !== '' ? Number(m[2]) : totale - 1;
    if (inizio >= totale || fine < inizio) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${totale}` },
      });
    }
    fine = Math.min(fine, totale - 1);
    return new NextResponse(body.subarray(inizio, fine + 1), {
      status: 206,
      headers: {
        'Content-Type': tipo,
        'Content-Range': `bytes ${inizio}-${fine}/${totale}`,
        'Content-Length': String(fine - inizio + 1),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return new NextResponse(body, {
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(totale),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
    },
  });
}
