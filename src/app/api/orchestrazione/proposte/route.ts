import { NextResponse, type NextRequest } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { decidiProposta } from '@/lib/orchestrazione/orchestratore';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const c = await req.json().catch(() => null);
  const azione = c?.azione === 'accetta' ? 'accetta' : c?.azione === 'ignora' ? 'ignora' : null;
  if (!azione || !c?.id) return NextResponse.json({ errore: 'azione o id mancanti' }, { status: 400 });
  const esito = await decidiProposta(a.s.studioId, String(c.id), azione, a.s.id);
  return NextResponse.json(esito, { ...senzaCache, status: esito.ok ? 200 : 409 });
}
