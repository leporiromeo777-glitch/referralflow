import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';

export const runtime = 'nodejs';

// Riascolto dell'audio di un referto (player nel dettaglio bozza).
// Solo utenti dello studio proprietario.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });

  const [audio] = await query<{ storage_key: string; content_type: string | null }>(
    `select storage_key, content_type from referti_audio
      where id = $1 and studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!audio) return new NextResponse('Non trovato', { status: 404 });

  const { body, contentType } = await getFile(audio.storage_key);
  return new NextResponse(body, {
    headers: {
      'Content-Type': audio.content_type ?? contentType ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
    },
  });
}
