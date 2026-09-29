import { NextResponse, type NextRequest } from 'next/server';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { query } from '@/lib/db';
import { inviaAvviso } from '@/lib/avvisi';
import { riepilogoSettimana } from '@/lib/riepilogo-settimana-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Riepilogo settimanale delle correzioni sul telefono (29.9.2026): lo chiama
// mac/automazioni.sh il lunedì mattina. Solo numeri. `?prova=1` restituisce
// il testo senza mandarlo.
export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  const prova = req.nextUrl.searchParams.get('prova') === '1';
  const studi = await query<{ id: string }>('select id from studios where attivo = true and referti_token_hash is not null');
  const testi: string[] = [];
  let inviati = 0;
  for (const s of studi) {
    const t = await riepilogoSettimana(s.id);
    testi.push(t);
    if (!prova && (await inviaAvviso(t, { priorita: 'low', tag: 'bar_chart' }))) inviati++;
  }
  return NextResponse.json(prova ? { ok: true, testi } : { ok: true, studi: studi.length, inviati });
}
export const GET = POST;
