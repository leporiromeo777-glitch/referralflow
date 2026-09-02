import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Memoria della visita (2026-09-02): la pipeline chiede la trascrizione
// integrale della visita registrata più recente (entro `ore`, default 12)
// per consultarla sulle frasi dubbie del referto dettato. Autenticazione
// col token referti dello studio, come la coda. Mai contenuti nei log.

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

  const ore = Math.min(48, Math.max(1, Number(req.nextUrl.searchParams.get('ore')) || 12));
  const [visita] = await query<{ testo: string | null; parole: unknown }>(
    `select payload->>'testo_grezzo' as testo, payload->'parole_grezzo' as parole
       from referti_bozze
      where studio_id = $1 and tipo = 'visita'
        and created_at > now() - ($2 || ' hours')::interval
      order by created_at desc
      limit 1`,
    [studio.id, String(ore)]
  );
  if (!visita || !visita.testo) return NextResponse.json({});
  return NextResponse.json({
    testo: visita.testo,
    parole: Array.isArray(visita.parole) ? visita.parole : [],
  });
}
