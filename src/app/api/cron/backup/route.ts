import { NextResponse, type NextRequest } from 'next/server';
import { portaFuori } from '@/lib/backup-fuori';
import { chiaveCronValida } from '@/lib/cron-chiave';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// La copia di sicurezza fuori dal Mac (13.10.2026): la chiama mac/automazioni.sh ogni quarto d'ora. Porta sul
// server dello studio i pacchi cifrati che il backup notturno ha preparato. Il primo giro può durare minuti
// (qualche gigabyte): la risposta non lo aspetta, a meno di «?aspetta=1» (per provarlo a mano).
export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  if (req.nextUrl.searchParams.get('aspetta') === '1') return NextResponse.json(await portaFuori());
  void portaFuori();
  return NextResponse.json({ ok: true, avviato: true });
}
export const GET = POST;
