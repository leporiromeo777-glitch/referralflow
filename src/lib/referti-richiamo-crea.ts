import 'server-only';
import { query } from './db';
import { trovaPaziente } from './referti-allegati';
import { registraEvento } from './referti-eventi';

// Richiamo dal referto (14.9.2026): il cuore di «Crea il richiamo» della
// piattaforma, condiviso con l'interfaccia nuova. Il paziente si trova per
// nome dai campi della bozza, il richiamo va sull'ultima referral del
// paziente (mesi dalla visita, o dall'appuntamento, o da oggi) e resta
// annotato nel payload della bozza con un evento. Solo id e numeri nei log.
export type EsitoRichiamo = { ok: true; referralId: string; mesi: number } | { ok: false; errore: 'mesi' | 'paziente' | 'referral' | 'gia_creato' };

export async function creaRichiamoDaBozza(studioId: string, userId: string, bozzaId: string, mesi: number): Promise<EsitoRichiamo> {
  if (!Number.isInteger(mesi) || mesi < 1 || mesi > 120) return { ok: false, errore: 'mesi' };
  const [b] = await query<{ nome: string | null; gia: string | null }>(
    `select coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente') as nome, payload->'richiamo'->>'referral_id' as gia
       from referti_bozze where id = $1 and studio_id = $2`,
    [bozzaId, studioId]
  );
  if (!b) return { ok: false, errore: 'paziente' };
  if (b.gia) return { ok: false, errore: 'gia_creato' };
  const patientId = await trovaPaziente(studioId, b.nome ?? null);
  if (!patientId) return { ok: false, errore: 'paziente' };
  const [ref] = await query<{ id: string }>(`select id from referrals where studio_id = $1 and patient_id = $2 order by created_at desc limit 1`, [studioId, patientId]);
  if (!ref) return { ok: false, errore: 'referral' };
  await query(
    `update referrals
        set follow_up_months = $2,
            follow_up_due = (coalesce(
              (select max(changed_at) from referral_status_history where referral_id = $1 and to_status = 'vista'),
              appuntamento_at, now()) + make_interval(months => $2))::date,
            follow_up_done_at = null
      where id = $1 and studio_id = $3`,
    [ref.id, mesi, studioId]
  );
  await query(
    `update referti_bozze set payload = jsonb_set(payload, '{richiamo}', $3::jsonb) where id = $1 and studio_id = $2`,
    [bozzaId, studioId, JSON.stringify({ mesi, referral_id: ref.id, creato_at: new Date().toISOString(), da: userId })]
  );
  await registraEvento(studioId, bozzaId, 'richiamo_creato', userId, { mesi, referral: ref.id });
  return { ok: true, referralId: ref.id, mesi };
}
