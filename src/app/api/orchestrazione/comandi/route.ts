import { NextResponse, type NextRequest } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { eventoDaTesto, registraComando, ritiraComando } from '@/lib/orchestrazione/orchestratore';
export const dynamic = 'force-dynamic';
// Un comando (§11) diventa un vincolo con autore e scadenza. Un testo libero
// passa dal modello piccolo e torna DA CONFERMARE: non si applica da solo.
export async function POST(req: NextRequest) {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const c = await req.json().catch(() => null);
  if (c?.testo) return NextResponse.json(await eventoDaTesto(a.s.studioId, String(c.testo), a.s.id), senzaCache);
  if (c?.azione === 'ritira' && c?.id) return NextResponse.json(await ritiraComando(a.s.studioId, String(c.id)), senzaCache);
  const comando = String(c?.comando ?? '');
  if (!comando) return NextResponse.json({ errore: 'comando mancante' }, { status: 400 });
  const esito = await registraComando(a.s.studioId, comando, c?.parametri ?? {}, a.s.id);
  return NextResponse.json(esito, { ...senzaCache, status: esito.ok ? 200 : 400 });
}
