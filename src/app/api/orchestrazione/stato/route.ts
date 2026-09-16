import { NextResponse } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { statoOperativo } from '@/lib/orchestrazione/orchestratore';
export const dynamic = 'force-dynamic';
// Lo stato operativo: sale, medici, pazienti, ingressi da fare, avvisi. Lo
// chiede la mappa ogni 20 secondi; il battito degli eventi derivati gira al
// massimo ogni 30, dentro.
export async function GET() {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  try { return NextResponse.json(await statoOperativo(a.s.studioId, a.s.id), senzaCache); }
  catch (e) { console.log(`[orchestrazione] stato: ${(e as Error).message}`); return NextResponse.json({ errore: 'stato non disponibile' }, { status: 500 }); }
}
