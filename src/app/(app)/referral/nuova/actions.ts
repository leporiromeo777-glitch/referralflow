'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function createReferral(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const cognome = String(formData.get('cognome') ?? '').trim();
  const nome = String(formData.get('nome') ?? '').trim();
  if (!cognome || !nome) redirect('/referral/nuova?error=nome');

  const dataNascita = String(formData.get('data_nascita') ?? '') || null;
  const telefono = String(formData.get('telefono') ?? '').trim() || null;
  const assicurazione = String(formData.get('assicurazione') ?? '').trim() || null;

  const doctorId = String(formData.get('referring_doctor_id') ?? '') || null;
  const nuovoMedico = String(formData.get('nuovo_medico') ?? '').trim();
  const quesito = String(formData.get('quesito') ?? '').trim() || null;
  const urgenza = String(formData.get('urgenza') ?? 'normale');
  const canale = String(formData.get('canale') ?? 'form');

  const [patient] = await query<{ id: string }>(
    `insert into patients (studio_id, cognome, nome, data_nascita, telefono, assicurazione)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [session.studioId, cognome, nome, dataNascita, telefono, assicurazione]
  );

  let resolvedDoctorId = doctorId;
  if (resolvedDoctorId) {
    // Il medico scelto deve appartenere allo studio della sessione.
    const [d] = await query<{ id: string }>(
      'select id from referring_doctors where id = $1 and studio_id = $2',
      [resolvedDoctorId, session.studioId]
    );
    resolvedDoctorId = d?.id ?? null;
  }
  if (!resolvedDoctorId && nuovoMedico) {
    const [d] = await query<{ id: string }>(
      'insert into referring_doctors (studio_id, nome) values ($1,$2) returning id',
      [session.studioId, nuovoMedico]
    );
    resolvedDoctorId = d.id;
  }

  const [ref] = await query<{ id: string }>(
    `insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale)
     values ($1,$2,$3,$4,$5::urgenza,'ricevuta'::referral_status,$6) returning id`,
    [session.studioId, patient.id, resolvedDoctorId, quesito, urgenza, canale]
  );

  await query(
    `insert into referral_status_history (referral_id, to_status, changed_by, nota)
     values ($1,'ricevuta'::referral_status,$2,$3)`,
    [ref.id, session.id, 'Referral registrata']
  );

  redirect(`/referral/${ref.id}`);
}
