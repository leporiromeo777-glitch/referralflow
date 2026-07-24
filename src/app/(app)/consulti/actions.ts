'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { notifyConsultoRisposta } from '@/lib/notify';

// Risposta scritta dello specialista: chiude il consulto (stato 'risposto')
// e avvisa l'inviante con email neutra — la risposta si legge solo dal portale.
export async function rispondiConsulto(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/consulti');

  const risposta = String(formData.get('risposta') ?? '').trim().slice(0, 8000);
  if (!risposta) redirect(`/consulti/${id}?err=vuota`);

  const [row] = await query<{ id: string; primo: boolean }>(
    `update consulti
        set risposta = $3, stato = 'risposto',
            answered_by = $4, answered_at = coalesce(answered_at, now())
      where id = $1 and studio_id = $2 and stato in ('aperto', 'risposto')
      returning id, (answered_at = now()) as primo`,
    [id, session.studioId, risposta, session.id]
  );
  if (!row) redirect('/consulti');

  // Avviso all'inviante solo alla prima risposta (le correzioni successive
  // non generano nuove email).
  if (row.primo) await notifyConsultoRisposta(id);

  revalidatePath('/consulti');
  redirect(`/consulti/${id}?ok=risposto`);
}

// «Serve una visita»: il consulto diventa una referral vera. La domanda
// diventa il quesito, gli allegati passano alla referral (stesso storage,
// nessuna copia dei file) e l'inviante ritrova tutto nel suo portale.
export async function convertiConsulto(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/consulti');

  const cognome = String(formData.get('cognome') ?? '').trim();
  const nome = String(formData.get('nome') ?? '').trim();
  if (!cognome || !nome) redirect(`/consulti/${id}?err=nome`);

  const dataNascita = String(formData.get('data_nascita') ?? '') || null;
  const telefono = String(formData.get('telefono') ?? '').trim() || null;
  const urgenza = String(formData.get('urgenza') ?? 'normale');

  const [consulto] = await query<{
    id: string; domanda: string; referring_doctor_id: string;
  }>(
    `select id, domanda, referring_doctor_id from consulti
      where id = $1 and studio_id = $2 and stato in ('aperto', 'risposto')`,
    [id, session.studioId]
  );
  if (!consulto) redirect('/consulti');

  const [patient] = await query<{ id: string }>(
    `insert into patients (studio_id, cognome, nome, data_nascita, telefono)
     values ($1,$2,$3,$4,$5) returning id`,
    [session.studioId, cognome, nome, dataNascita, telefono]
  );
  const [ref] = await query<{ id: string }>(
    `insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale)
     values ($1,$2,$3,$4,$5::urgenza,'ricevuta'::referral_status,'consulto') returning id`,
    [session.studioId, patient.id, consulto.referring_doctor_id, consulto.domanda, urgenza]
  );
  await query(
    `insert into referral_status_history (referral_id, to_status, changed_by, nota)
     values ($1,'ricevuta'::referral_status,$2,$3)`,
    [ref.id, session.id, 'Creata da un consulto rapido']
  );

  // Gli allegati del consulto seguono la referral (stesso storage_key).
  await query(
    `insert into attachments (referral_id, filename, storage_key)
     select $1, filename, storage_key from consulto_attachments where consulto_id = $2`,
    [ref.id, id]
  );

  await query(
    `update consulti set stato = 'convertito', converted_referral_id = $3
      where id = $1 and studio_id = $2`,
    [id, session.studioId, ref.id]
  );

  revalidatePath('/consulti');
  redirect(`/referral/${ref.id}`);
}
