import { NextResponse, type NextRequest } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { parametriDi, salvaParametri } from '@/lib/orchestrazione/orchestratore';
import { PARAMETRI_DEFAULT } from '@/lib/orchestrazione/parametri';
export const dynamic = 'force-dynamic';
export async function GET() {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  return NextResponse.json({ parametri: await parametriDi(a.s.studioId), default: PARAMETRI_DEFAULT }, senzaCache);
}
export async function PUT(req: NextRequest) {
  const a = await sessioneStudio(['admin']); if ('r' in a) return a.r;
  const c = await req.json().catch(() => null);
  if (!c || typeof c !== 'object') return NextResponse.json({ errore: 'corpo non valido' }, { status: 400 });
  await salvaParametri(a.s.studioId, c, a.s.id);
  return NextResponse.json({ ok: true, parametri: await parametriDi(a.s.studioId) }, senzaCache);
}
