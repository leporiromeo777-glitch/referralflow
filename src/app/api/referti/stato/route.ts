import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stato vivo della coda di trascrizione per la pagina Referti (polling del
// componente di avanzamento). Solo utenti dello studio.

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }

  const righe = await query<{
    id: string; filename: string; stato: string; tipo: string; fase: string | null;
    fase_at: string | null; created_at: string; bozza_id: string | null;
  }>(
    `select id, filename, stato, tipo, fase, fase_at::text, created_at::text, bozza_id
       from referti_audio
      where studio_id = $1
        and (stato in ('in_coda', 'elaborazione')
             or (stato in ('fatto', 'errore') and updated_at > now() - interval '10 minutes'))
      order by created_at asc
      limit 50`,
    [session.studioId]
  );
  return NextResponse.json({ voci: righe });
}
