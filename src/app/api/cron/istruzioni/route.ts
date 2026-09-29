import { NextResponse, type NextRequest } from 'next/server';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { giroIstruzioni } from '@/lib/istruzioni-traccia-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Seconde tracce con istruzioni da applicare (29.9.2026): la chiama
// mac/automazioni.sh ogni quarto d'ora; parte solo a catena ferma.
export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  void giroIstruzioni().catch((e: any) => console.error(`[istruzioni] giro: ${e?.code ?? e?.name ?? 'errore'}`));
  return NextResponse.json({ ok: true, avviato: true });
}
export const GET = POST;
