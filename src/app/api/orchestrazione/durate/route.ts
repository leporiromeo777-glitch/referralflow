import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { sessioneStudio, senzaCache } from '../_comune';
import { riepilogoDurate } from '@/lib/orchestrazione/previsione';
export const dynamic = 'force-dynamic';
// «Durate misurate» (§9): prestazione × medico, quanti casi, mediana; e la
// parola dello studio che vince sulla misura.
export async function GET() {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const [oss, fissate] = await Promise.all([
    query<{ prestazione: string; medico: string; ora: number; minuti: number }>('select prestazione, medico, ora, minuti from durate_osservate where studio_id = $1 and giorno > current_date - 120', [a.s.studioId]),
    query('select prestazione, medico, minuti, at::text from durate_fissate where studio_id = $1 order by 1, 2', [a.s.studioId]),
  ]);
  return NextResponse.json({ misurate: riepilogoDurate(oss), fissate, casi: oss.length }, senzaCache);
}
export async function PUT(req: NextRequest) {
  const a = await sessioneStudio(['medico', 'admin']); if ('r' in a) return a.r;
  const c = await req.json().catch(() => null);
  const prestazione = String(c?.prestazione ?? '').trim(), medico = String(c?.medico ?? '').trim(), minuti = Number(c?.minuti);
  if (!prestazione) return NextResponse.json({ errore: 'prestazione mancante' }, { status: 400 });
  if (c?.togli) { await query('delete from durate_fissate where studio_id = $1 and prestazione = $2 and medico = $3', [a.s.studioId, prestazione, medico]); return NextResponse.json({ ok: true }, senzaCache); }
  if (!Number.isFinite(minuti) || minuti < 1 || minuti > 600) return NextResponse.json({ errore: 'minuti non validi' }, { status: 400 });
  await query(`insert into durate_fissate (studio_id, prestazione, medico, minuti, user_id) values ($1,$2,$3,$4,$5) on conflict (studio_id, prestazione, medico) do update set minuti = excluded.minuti, user_id = excluded.user_id, at = now()`, [a.s.studioId, prestazione, medico, minuti, a.s.id]);
  return NextResponse.json({ ok: true }, senzaCache);
}
