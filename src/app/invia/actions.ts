'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { notifyStudio } from '@/lib/notify';
import { putFile } from '@/lib/storage';
import { isAllowedPublicUpload } from '@/lib/upload';
import { slotValido } from '@/lib/slot';

const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

// Referral dal modulo pubblico del sito web (senza token): il medico si presenta
// da solo. Se l'email non è in anagrafica, il medico viene registrato
// automaticamente (così la segreteria può poi mandargli i link personali).
export async function createWebsiteReferral(formData: FormData) {
  // Studio destinatario: risolto dallo slug (multi-studio). Senza studio valido
  // il modulo non accetta nulla.
  const slug = String(formData.get('studio_slug') ?? '').trim().slice(0, 80);
  const [studio] = await query<{ id: string }>(
    'select id from studios where slug = $1 and attivo',
    [slug]
  );
  if (!studio) redirect('/invia');
  const back = `/invia?s=${encodeURIComponent(slug)}`;

  // Honeypot anti-spam: campo invisibile che solo i bot compilano.
  if (String(formData.get('sito_web') ?? '') !== '') redirect(`${back}&ok=1`);

  const medicoNome = String(formData.get('medico_nome') ?? '').trim().slice(0, 120);
  const medicoStudio = String(formData.get('medico_studio') ?? '').trim().slice(0, 120) || null;
  const medicoEmail = String(formData.get('medico_email') ?? '').trim().toLowerCase().slice(0, 160);
  const medicoTelefono = String(formData.get('medico_telefono') ?? '').trim().slice(0, 40) || null;
  const cognome = String(formData.get('cognome') ?? '').trim().slice(0, 120);
  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);

  if (!medicoNome || !medicoEmail || !medicoEmail.includes('@')) redirect(`${back}&error=medico`);
  if (!cognome || !nome) redirect(`${back}&error=nome`);

  const dataNascita = String(formData.get('data_nascita') ?? '') || null;
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  const quesito = String(formData.get('quesito') ?? '').trim().slice(0, 2000) || null;
  const urgenzaRaw = String(formData.get('urgenza') ?? 'normale');
  const urgenza = ['urgente', 'normale', 'programmabile'].includes(urgenzaRaw) ? urgenzaRaw : 'normale';

  // Medico: aggancia per email nell'anagrafica dello studio, altrimenti crea la scheda.
  let [doc] = await query<{ id: string }>(
    'select id from referring_doctors where lower(email) = $1 and studio_id = $2',
    [medicoEmail, studio.id]
  );
  if (!doc) {
    [doc] = await query<{ id: string }>(
      `insert into referring_doctors (studio_id, nome, studio, email, telefono)
       values ($1,$2,$3,$4,$5) returning id`,
      [studio.id, medicoNome, medicoStudio, medicoEmail, medicoTelefono]
    );
  }

  const [patient] = await query<{ id: string }>(
    `insert into patients (studio_id, cognome, nome, data_nascita, telefono)
     values ($1,$2,$3,$4,$5) returning id`,
    [studio.id, cognome, nome, dataNascita, telefono]
  );
  const slotScelto = await slotValido(studio.id, String(formData.get('slot_proposto') ?? ''));

  const [ref] = await query<{ id: string }>(
    `insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale, slot_proposto)
     values ($1,$2,$3,$4,$5::urgenza,'ricevuta'::referral_status,'sito',$6) returning id`,
    [studio.id, patient.id, doc.id, quesito, urgenza, slotScelto]
  );
  await query(
    `insert into referral_status_history (referral_id, to_status, nota)
     values ($1,'ricevuta'::referral_status,$2)`,
    [ref.id, `Inviata dal modulo del sito web (${medicoNome})`]
  );

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

  await notifyStudio(studio.id, medicoNome, urgenza);
  redirect(`${back}&ok=1`);
}
