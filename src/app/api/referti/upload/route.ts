import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { putFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Drag & drop dalla pagina Referti: l'audio entra nella coda di trascrizione
// (referti_audio, stato in_coda); la pipeline sul Mac dello studio lo preleva,
// lo trascrive e restituisce la bozza. Solo utenti dello studio.

const TIPI: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
  '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aiff': 'audio/aiff', '.caf': 'audio/x-caf',
};
const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ errore: 'file_mancante' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ errore: 'file_troppo_grande' }, { status: 400 });
  }
  const punto = file.name.lastIndexOf('.');
  const ext = punto === -1 ? '' : file.name.slice(punto).toLowerCase();
  if (!TIPI[ext]) {
    return NextResponse.json({ errore: 'formato_non_audio' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await putFile(buffer, TIPI[ext], ext);
  const [row] = await query<{ id: string }>(
    `insert into referti_audio (studio_id, filename, storage_key, content_type, uploaded_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [session.studioId, file.name.slice(0, 200), key, TIPI[ext], session.id]
  );

  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
