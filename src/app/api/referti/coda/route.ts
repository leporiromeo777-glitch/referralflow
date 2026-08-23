import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Coda degli audio caricati dalla piattaforma (drag & drop): la pipeline sul
// Mac dello studio la interroga col token referti, scarica ogni audio, lo
// trascrive e POSTa la bozza con audio_id. Mai contenuti nei log.

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  // Anche gli audio rimasti in 'elaborazione' da più di un'ora tornano in
  // coda: il Mac può essersi spento a metà (i retry sono idempotenti).
  const righe = await query<{ id: string; filename: string; tipo: string }>(
    `select id, filename, tipo from referti_audio
      where studio_id = $1
        and (stato = 'in_coda' or (stato = 'elaborazione' and updated_at < now() - interval '1 hour'))
      order by created_at asc
      limit 10`,
    [studio.id]
  );
  return NextResponse.json({ coda: righe });
}
