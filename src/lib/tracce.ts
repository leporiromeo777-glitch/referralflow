import 'server-only';
import { query } from './db';

// Tracce delle procedure dell'assistente (13.9.2026): per ogni risposta si
// salva il percorso del CODICE (obiettivo, passi con esito, fonti lette,
// mancanze, modello, tempo), mai il «pensiero» del modello. Le tracce stanno
// nel DB sotto le regole della cartella; nei log solo id e numeri.
export type PassoTraccia = { passo: string; esito: 'ok' | 'mancante' | 'vuoto'; fonti?: string[]; nota?: string };
export type FonteTraccia = { tipo: string; id: string; titolo: string; data?: string };
export type Traccia = {
  id: number;
  procedura: string;
  obiettivo: string;
  passi: PassoTraccia[];
  fonti: FonteTraccia[];
  mancanti: { controllo?: string; testo: string }[];
  modello: string | null;
  durata_ms: number | null;
  risposta_caratteri: number | null;
  created_at: string;
  patient_id: string | null;
};

export async function apriTraccia(a: {
  studioId: string; userId?: string | null; patientId?: string | null; procedura: string; obiettivo: string;
  passi: PassoTraccia[]; fonti: FonteTraccia[]; mancanti?: { controllo?: string; testo: string }[]; modello?: string | null;
}): Promise<number> {
  const [r] = await query<{ id: number }>(
    `insert into assistente_tracce (studio_id, user_id, patient_id, procedura, obiettivo, passi, fonti, mancanti, modello)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9) returning id`,
    [a.studioId, a.userId ?? null, a.patientId ?? null, a.procedura, a.obiettivo.slice(0, 500), JSON.stringify(a.passi), JSON.stringify(a.fonti), JSON.stringify(a.mancanti ?? []), a.modello ?? null]
  );
  return Number(r.id);
}

export async function chiudiTraccia(id: number, a: { durataMs: number; caratteri: number; passi?: PassoTraccia[] }): Promise<void> {
  await query(
    `update assistente_tracce set durata_ms = $2, risposta_caratteri = $3, passi = coalesce($4::jsonb, passi) where id = $1`,
    [id, Math.round(a.durataMs), a.caratteri, a.passi ? JSON.stringify(a.passi) : null]
  );
}

export async function leggiTraccia(studioId: string, id: number): Promise<Traccia | null> {
  const [t] = await query<Traccia>(
    `select id, procedura, obiettivo, passi, fonti, mancanti, modello, durata_ms, risposta_caratteri, created_at::text, patient_id
       from assistente_tracce where id = $1 and studio_id = $2`,
    [id, studioId]
  );
  return t ? { ...t, id: Number(t.id) } : null;
}

export async function ultimeTracce(studioId: string, limite = 30): Promise<Traccia[]> {
  const righe = await query<Traccia>(
    `select id, procedura, obiettivo, passi, fonti, mancanti, modello, durata_ms, risposta_caratteri, created_at::text, patient_id
       from assistente_tracce where studio_id = $1 order by created_at desc limit $2`,
    [studioId, limite]
  );
  return righe.map((t) => ({ ...t, id: Number(t.id) }));
}
