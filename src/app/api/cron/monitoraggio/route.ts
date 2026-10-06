import { NextResponse, type NextRequest } from 'next/server';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { giroTutti } from '@/lib/monitoraggio/motore';

export const dynamic = 'force-dynamic';

// Un giro del motore del monitoraggio a richiesta (rete di sicurezza: di norma
// lo fa il timer del server, src/instrumentation.ts). Risponde solo coi conteggi.
export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  return NextResponse.json({ ok: true, studi: await giroTutti() });
}
