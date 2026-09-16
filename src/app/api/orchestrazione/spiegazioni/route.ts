import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { sessioneStudio, senzaCache } from '../_comune';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const quante = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('quante') ?? 50)));
  const righe = await query(`select id, livello, perche, testo, scritto_da, at::text, appointment_id, piano_id from orchestrazione_spiegazioni where studio_id = $1 and giorno = current_date order by at desc limit $2`, [a.s.studioId, quante]);
  return NextResponse.json({ spiegazioni: righe }, senzaCache);
}
