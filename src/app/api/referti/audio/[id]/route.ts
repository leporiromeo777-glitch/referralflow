import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';
import { eDittafono, wavDaDittafono } from '@/lib/dittafono';

export const runtime = 'nodejs';

// Riascolto dell'audio di un referto (player nel dettaglio bozza).
// Supporta le richieste Range (206): senza, il browser non può spostare il
// cursore avanti/indietro nella traccia — Safari nemmeno mostra la durata.
// Solo utenti dello studio proprietario.
// File del dittafono (DSS/DSS Pro): si consegna il WAV convertito e messo in
// cache nello storage (src/lib/dittafono.ts); se la conversione fallisce,
// l'originale così com'è (scaricabile, non riproducibile in pagina).

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });

  const [audio] = await query<{ storage_key: string; content_type: string | null }>(
    `select storage_key, content_type from referti_audio
      where id = $1 and studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!audio) return new NextResponse('Non trovato', { status: 404 });

  let body: Buffer;
  let tipo: string;
  if (eDittafono(audio.storage_key, audio.content_type)) {
    const wav = await wavDaDittafono(audio.storage_key);
    if (wav) {
      body = wav;
      tipo = 'audio/wav';
    } else {
      const letto = await getFile(audio.storage_key);
      body = letto.body;
      tipo = audio.content_type ?? letto.contentType ?? 'application/octet-stream';
    }
  } else {
    const letto = await getFile(audio.storage_key);
    body = letto.body;
    tipo = audio.content_type ?? letto.contentType ?? 'application/octet-stream';
  }
  const totale = body.length;
  // Diagnostica (mai contenuti): id dell'audio, tipo servito, byte, Range chiesto.
  console.log(`Audio referto ${params.id.slice(0, 8)}: ${tipo}, ${totale} byte, range=${req.headers.get('range') ?? '-'}`);

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
