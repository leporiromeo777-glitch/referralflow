import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Scarico di un audio della coda da parte della pipeline (token referti).
// Il prelievo marca 'elaborazione': se il Mac muore a metà, dopo un'ora
// l'audio ricompare in coda (vedi ../route.ts).

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  const [audio] = await query<{ storage_key: string; content_type: string | null; filename: string }>(
    `update referti_audio set stato = 'elaborazione', updated_at = now()
      where id = $1 and studio_id = $2 and stato in ('in_coda', 'elaborazione')
      returning storage_key, content_type, filename`,
    [params.id, studio.id]
  );
  if (!audio) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  const { body, contentType } = await getFile(audio.storage_key);
  const punto = audio.filename.lastIndexOf('.');
  const ext = punto === -1 ? '' : audio.filename.slice(punto);
  return new NextResponse(body, {
    headers: {
      'Content-Type': audio.content_type ?? contentType ?? 'application/octet-stream',
      // Nome neutro: l'id al posto del nome del file (che può contenere il
      // nome del paziente) — sul Mac il file prende questo nome.
      'Content-Disposition': `attachment; filename="${params.id}${ext}"`,
    },
  });
}
