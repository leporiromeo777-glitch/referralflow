import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { preparaPianoSale } from '@/lib/piano-sale';
import { chiaveCronValida } from '@/lib/cron-chiave';

export const dynamic = 'force-dynamic';

// Il piano delle sale del giorno, preparato PRIMA che qualcuno lo chieda
// (15.9.2026). Lo chiama il cron dell'agenda, che gira già ogni 15 minuti: il
// piano si fa una volta al giorno e poi si riusa. Il lavoro vero sta in
// `src/lib/piano-sale.ts`, perché lo chiede anche il pulsante nella pagina
// Sale e dev'essere lo stesso lavoro.
export async function GET(req: NextRequest) {
  if (!chiaveCronValida(req)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const forza = req.nextUrl.searchParams.get('forza') === '1';
  const studi = await query<{ id: string }>('select id from studios');
  const fatti: { studio: string; stato: string }[] = [];
  for (const s of studi) {
    const esito = await preparaPianoSale(s.id, { forza });
    fatti.push({ studio: s.id, stato: esito.stato });
  }
  return NextResponse.json({ giorno: new Date().toISOString().slice(0, 10), fatti });
}
