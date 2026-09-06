import { createHash } from 'crypto';
import { query } from './db';

// Registro append-only degli eventi sui referti (2026-09-06). Regola: mai
// testo clinico nei dettagli — solo numeri, identificativi e impronte.
export function impronta(testo: string | null | undefined): string {
  return createHash('sha256').update(testo ?? '').digest('hex').slice(0, 16);
}

export async function registraEvento(
  studioId: string,
  bozzaId: string | null,
  azione: string,
  attore: string | null,
  dettagli: Record<string, unknown> = {},
  versione: string | null = null
): Promise<void> {
  const puliti: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dettagli)) {
    if (typeof v === 'number' || typeof v === 'boolean') puliti[k] = v;
    else if (typeof v === 'string' && v.length <= 64) puliti[k] = v; // id, impronte, etichette
  }
  try {
    await query(
      `insert into referti_eventi (studio_id, bozza_id, azione, attore, dettagli, versione)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [studioId, bozzaId, azione.slice(0, 40), attore, JSON.stringify(puliti), versione]
    );
  } catch (e: any) {
    console.error('Evento referto non registrato:', e?.message || e);
  }
}
