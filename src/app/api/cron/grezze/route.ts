import { NextResponse, type NextRequest } from 'next/server';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { giroGrezze } from '@/lib/esporta-grezze';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Trascrizioni grezze» pseudonimizzate (27.9.2026): la chiama
// mac/automazioni.sh ogni quarto d'ora. Il giro parte solo a catena ferma e
// dura minuti (il modello locale rilegge ogni dettato): la risposta non lo
// aspetta. Nella risposta e nei log solo numeri.
export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  void giroGrezze().catch((e: any) => console.error(`[grezze] giro: ${e?.code ?? e?.name ?? 'errore'}`));
  return NextResponse.json({ ok: true, avviato: true });
}
export const GET = POST;
