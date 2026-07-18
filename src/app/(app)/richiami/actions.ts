'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Segna un richiamo come gestito (paziente contattato / nuova referral aperta).
// tipo: 'referral' (deciso alla chiusura) o 'appuntamento' (visita da agenda senza referral).
export async function segnaGestito(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('id') || '');
  const tipo = String(formData.get('tipo') || 'referral');
  if (id) {
    if (tipo === 'appuntamento') {
      await query(
        'update appointments set follow_up_done_at = now() where id = $1 and studio_id = $2',
        [id, session.studioId]
      );
    } else {
      await query(
        'update referrals set follow_up_done_at = now() where id = $1 and studio_id = $2',
        [id, session.studioId]
      );
    }
  }
  revalidatePath('/richiami');
}

// Dal richiamo alla nuova visita in un tocco: crea una referral di controllo
// precompilata (stesso paziente e medico inviante), pronta da prenotare,
// e segna il richiamo come gestito.
export async function creaReferralControllo(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const id = String(formData.get('id') || '');
  const [orig] = await query<{
    patient_id: string; referring_doctor_id: string | null; follow_up_months: number | null;
  }>(
    `select patient_id, referring_doctor_id, follow_up_months
       from referrals where id = $1 and studio_id = $2`,
    [id, session.studioId]
  );
  if (!orig) redirect('/richiami');

  const quesito = orig.follow_up_months
    ? `Visita di controllo programmata (richiamo a ${orig.follow_up_months} mesi)`
    : 'Visita di controllo programmata (richiamo)';

  const [nuova] = await query<{ id: string }>(
    `insert into referrals
       (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale)
     values ($1,$2,$3,$4,'normale'::urgenza,'da_prenotare'::referral_status,'richiamo')
     returning id`,
    [session.studioId, orig.patient_id, orig.referring_doctor_id, quesito]
  );
  await query(
    `insert into referral_status_history (referral_id, to_status, changed_by, nota)
     values ($1,'da_prenotare'::referral_status,$2,'Creata dal richiamo (controllo programmato)')`,
    [nuova.id, session.id]
  );
  // Il richiamo è gestito: la nuova referral prende il suo posto.
  await query(
    'update referrals set follow_up_done_at = now() where id = $1 and studio_id = $2',
    [id, session.studioId]
  );

  revalidatePath('/richiami');
  redirect(`/referral/${nuova.id}`);
}
