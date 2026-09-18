import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { pianoDelMattino } from '@/lib/orchestrazione/orchestratore';
import { chiaveCronValida } from '@/lib/cron-chiave';
export const dynamic = 'force-dynamic';
// La baseline della giornata (§4), agganciata al giro dell'agenda come il
// piano delle sale: si fa una volta al giorno, poi si riusa.
export async function GET(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  const forza = req.nextUrl.searchParams.get('forza') === '1';
  const studi = await query<{ id: string }>('select id from studios');
  const fatti: unknown[] = [];
  for (const s of studi) {
    try { fatti.push({ studio: s.id, ...(await pianoDelMattino(s.id, { forza })) }); }
    catch (e) { fatti.push({ studio: s.id, errore: (e as Error).message }); }
  }
  return NextResponse.json({ fatti });
}
