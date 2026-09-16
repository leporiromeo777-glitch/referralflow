import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { sessioneStudio, senzaCache } from '../_comune';
export const dynamic = 'force-dynamic';
// Il piano del giorno: la versione corrente o una specifica, con le sue righe.
export async function GET(req: NextRequest) {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const v = req.nextUrl.searchParams.get('versione');
  const [p] = await query<{ id: string; versione: number; motivo: string; motore: string; ms: number; costo: unknown; comunicata_at: string | null; created_at: string }>(
    v != null
      ? `select id, versione, motivo, motore, ms, costo, comunicata_at::text, created_at::text from piani_giornata where studio_id = $1 and giorno = current_date and versione = $2`
      : `select id, versione, motivo, motore, ms, costo, comunicata_at::text, created_at::text from piani_giornata where studio_id = $1 and giorno = current_date and corrente`,
    v != null ? [a.s.studioId, Number(v)] : [a.s.studioId]);
  if (!p) return NextResponse.json({ piano: null, versioni: [] }, senzaCache);
  const [righe, versioni] = await Promise.all([
    query(`select appointment_id, medico, prestazione, durata_prevista, durata_stimata, ora_teorica, ingresso_previsto, inizio_stimato, fine_stimata, sala, assistente, preparazione_min, priorita, rigidita, perche from piano_visite where piano_id = $1 order by ingresso_previsto nulls last, ora_teorica`, [p.id]),
    query(`select versione, motivo, motore, ms, comunicata_at::text, created_at::text, corrente from piani_giornata where studio_id = $1 and giorno = current_date order by versione`, [a.s.studioId]),
  ]);
  return NextResponse.json({ piano: { ...p, visite: righe }, versioni }, senzaCache);
}
