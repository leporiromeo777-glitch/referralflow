'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { notifyStudio } from '@/lib/notify';
import { putFile } from '@/lib/storage';
import { isAllowedPublicUpload } from '@/lib/upload';
import { slotValido } from '@/lib/slot';

const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

export async function createPublicReferral(formData: FormData) {
  const token = String(formData.get('token'));
  const [doc] = await query<{ id: string; nome: string; studio_id: string }>(
    'select id, nome, studio_id from referring_doctors where token = $1 and token_expires_at > now()',
    [token]
  );
  if (!doc) redirect('/');

  const cognome = String(formData.get('cognome') ?? '').trim();
  const nome = String(formData.get('nome') ?? '').trim();
  if (!cognome || !nome) redirect(`/invia/${token}?error=nome`);

  const dataNascita = String(formData.get('data_nascita') ?? '') || null;
  const telefono = String(formData.get('telefono') ?? '').trim() || null;
  const quesito = String(formData.get('quesito') ?? '').trim() || null;
  const urgenza = String(formData.get('urgenza') ?? 'normale');

  // Slot indicativo scelto dall'inviante: riverificato lato server (deve essere
  // uno di quelli realmente proposti per lo studio).
  const slotScelto = await slotValido(doc.studio_id, String(formData.get('slot_proposto') ?? ''));

  const [patient] = await query<{ id: string }>(
    `insert into patients (studio_id, cognome, nome, data_nascita, telefono)
     values ($1,$2,$3,$4,$5) returning id`,
    [doc.studio_id, cognome, nome, dataNascita, telefono]
  );
  const [ref] = await query<{ id: string }>(
    `insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale, slot_proposto)
     values ($1,$2,$3,$4,$5::urgenza,'ricevuta'::referral_status,'form',$6) returning id`,
    [doc.studio_id, patient.id, doc.id, quesito, urgenza, slotScelto]
  );
  await query(
    `insert into referral_status_history (referral_id, to_status, nota)
     values ($1,'ricevuta'::referral_status,$2)`,
    [ref.id, 'Inviata dal medico di base']
  );

  // Allegati facoltativi del medico inviante (limiti anti-abuso: rotta pubblica).
  const files = formData.getAll('allegati').filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  for (const file of files.slice(0, MAX_FILES)) {
    if (file.size > MAX_FILE || !isAllowedPublicUpload(file)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const key = await putFile(buffer, file.type || 'application/octet-stream', ext);
    await query(
      'insert into attachments (referral_id, filename, storage_key) values ($1,$2,$3)',
      [ref.id, file.name, key]
    );
  }

  // Avvisa la segreteria (testo neutro, nessun dato paziente). Non bloccante.
  await notifyStudio(doc.studio_id, doc.nome, urgenza);

  redirect(`/invia/${token}?ok=1`);
}
