import { NextResponse, type NextRequest } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { pianoDelMattino } from '@/lib/orchestrazione/orchestratore';
export const dynamic = 'force-dynamic';
// «Rifai il piano del mattino»: lo stesso lavoro del cron, a mano.
export async function POST(req: NextRequest) {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const c = await req.json().catch(() => ({}));
  return NextResponse.json(await pianoDelMattino(a.s.studioId, { forza: !!c?.forza }), senzaCache);
}
