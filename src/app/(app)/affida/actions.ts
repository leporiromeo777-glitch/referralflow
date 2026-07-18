'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { putFile } from '@/lib/storage';
import { logDocumento, isUuid } from '@/lib/cartella';
import { notifyAffidoEsterno } from '@/lib/notify';
import { isAllowedPublicUpload } from '@/lib/upload';

const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

// Aggiunge o toglie uno studio dagli «studi amici» (i preferiti dello studio).
export async function togglePartner(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const partnerId = String(formData.get('partner_id') ?? '');
  if (!partnerId || partnerId === session.studioId) redirect('/affida');

  const [esiste] = await query<{ ok: boolean }>(
    'select true as ok from studio_partners where studio_id = $1 and partner_studio_id = $2',
    [session.studioId, partnerId]
  );
  if (esiste) {
    await query(
      'delete from studio_partners where studio_id = $1 and partner_studio_id = $2',
      [session.studioId, partnerId]
    );
  } else {
    // Solo studi reali della piattaforma.
    await query(
      `insert into studio_partners (studio_id, partner_studio_id)
       select $1, id from studios where id = $2
       on conflict do nothing`,
      [session.studioId, partnerId]
    );
  }
  revalidatePath('/affida');
}

// Aggiunge uno studio esterno alla rubrica (contatti fuori piattaforma).
export async function saveExternalStudio(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);
  const specialita = String(formData.get('specialita') ?? '').trim().slice(0, 200) || null;
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 160);
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  if (!nome || !email || !email.includes('@')) redirect('/affida?err=esterno');

  await query(
    `insert into external_studios (studio_id, nome, specialita, email, telefono)
     values ($1, $2, $3, $4, $5)`,
    [session.studioId, nome, specialita, email, telefono]
  );
  revalidatePath('/affida');
  redirect('/affida');
}

// Toglie (disattiva) uno studio esterno dalla rubrica: lo storico resta.
export async function toggleExternalStudio(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const id = String(formData.get('id') ?? '');
  if (id) {
    await query(
      'update external_studios set attivo = not attivo where id = $1 and studio_id = $2',
      [id, session.studioId]
    );
  }
  revalidatePath('/affida');
}

// Dall'annuario alla rubrica: quando uno studio vuole affidare un paziente a un
// medico registrato sulla piattaforma, la voce di rubrica si crea da sola dal
// suo profilo e si passa direttamente al form d'invio col link sicuro.
export async function affidaDaAnnuario(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico' || session.role === 'inviante') redirect('/');

  const userId = String(formData.get('user_id') ?? '');
  const [prof] = await query<{
    email: string; nome: string; studio: string | null;
    specialita: string | null; telefono: string | null;
  }>(
    `select u.email, ip.nome, ip.studio, ip.specialita, ip.telefono
       from inviante_profiles ip
       join users u on u.id = ip.user_id
      where ip.user_id = $1 and ip.visibile = true and u.attivo = true`,
    [userId]
  );
  if (!prof) redirect('/affida?err=esterno_mancante');

  // Se c'è un paziente già scelto, accompagna il passaggio al form d'invio.
  const paz = String(formData.get('paz') ?? '');

  // Se è già in rubrica (stessa email), riusa la voce.
  let [ext] = await query<{ id: string }>(
    `select id from external_studios
      where studio_id = $1 and lower(email) = lower($2)`,
    [session.studioId, prof.email]
  );
  if (!ext) {
    [ext] = await query<{ id: string }>(
      `insert into external_studios (studio_id, nome, specialita, email, telefono)
       values ($1, $2, $3, lower($4), $5) returning id`,
      [
        session.studioId,
        prof.studio ? `${prof.nome} · ${prof.studio}` : prof.nome,
        prof.specialita,
        prof.email,
        prof.telefono,
      ]
    );
  } else {
    // Riattiva la voce se era stata disattivata.
    await query('update external_studios set attivo = true where id = $1', [ext.id]);
  }
  redirect(`/affida/esterno?e=${ext.id}${paz ? `&paz=${paz}` : ''}`);
}

// Affida un paziente a uno studio esterno: crea l'affido con token, salva gli
// allegati e invia l'email neutra col link sicuro. Senza SMTP non si invia
// (il link non arriverebbe mai allo studio esterno).
export async function inviaAdEsterno(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const extId = String(formData.get('external_studio_id') ?? '');
  const cognome = String(formData.get('cognome') ?? '').trim().slice(0, 120);
  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);
  if (!cognome || !nome) redirect(`/affida/esterno?e=${extId}&err=nome`);

  // Il contatto deve essere nella rubrica di questo studio.
  const [ext] = await query<{ id: string }>(
    'select id from external_studios where id = $1 and studio_id = $2 and attivo = true',
    [extId, session.studioId]
  );
  if (!ext) redirect('/affida?err=esterno_mancante');

  const dataNascita = String(formData.get('data_nascita') ?? '') || null;
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  const quesito = String(formData.get('quesito') ?? '').trim().slice(0, 2000) || null;
  const urgenzaRaw = String(formData.get('urgenza') ?? 'normale');
  const urgenza = ['urgente', 'normale', 'programmabile'].includes(urgenzaRaw) ? urgenzaRaw : 'normale';

  // Documenti dalla cartella del paziente: solo con la conferma del consenso
  // del paziente (art. 321 CP / art. 20 LSan TI), documentata con data e ora.
  const pazId = String(formData.get('paz') ?? '');
  const docIds = formData.getAll('doc_ids').map(String).filter(isUuid);
  const consenso = String(formData.get('consenso') ?? '') === '1';
  let documenti: { id: string; filename: string; storage_key: string }[] = [];
  if (docIds.length > 0 && isUuid(pazId)) {
    if (!consenso) {
      redirect(`/affida/esterno?e=${extId}&paz=${pazId}&err=consenso`);
    }
    documenti = await query<{ id: string; filename: string; storage_key: string }>(
      `select id, filename, storage_key from patient_documents
        where id = any($1::uuid[]) and patient_id = $2 and studio_id = $3`,
      [docIds, pazId, session.studioId]
    );
  }

  const [aff] = await query<{ id: string }>(
    `insert into external_referrals
       (studio_id, external_studio_id, cognome, nome, data_nascita, telefono,
        quesito, urgenza, consenso_trasmissione)
     values ($1,$2,$3,$4,$5,$6,$7,$8::urgenza,$9) returning id`,
    [session.studioId, ext.id, cognome, nome, dataNascita, telefono, quesito, urgenza,
     documenti.length > 0 ? new Date().toISOString() : null]
  );

  const files = formData.getAll('allegati').filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  for (const file of files.slice(0, MAX_FILES)) {
    if (file.size > MAX_FILE || !isAllowedPublicUpload(file)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext2 = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const key = await putFile(buffer, file.type || 'application/octet-stream', ext2);
    await query(
      'insert into external_attachments (external_referral_id, filename, storage_key) values ($1,$2,$3)',
      [aff.id, file.name, key]
    );
  }

  // Documenti della cartella → allegati dell'affido (stesso file, nessuna
  // copia); ogni invio finisce nel registro accessi.
  for (const doc of documenti) {
    await query(
      'insert into external_attachments (external_referral_id, filename, storage_key) values ($1,$2,$3)',
      [aff.id, doc.filename, doc.storage_key]
    );
    await logDocumento(doc.id, 'invio', {
      studioId: session.studioId,
      userId: session.id,
      dettaglio: `affido esterno con link sicuro, con consenso del paziente`,
    });
  }

  const inviata = await notifyAffidoEsterno(aff.id);
  if (!inviata) {
    // Niente email = lo studio esterno non riceverà mai il link: annulla tutto.
    await query('delete from external_referrals where id = $1', [aff.id]);
    redirect(`/affida/esterno?e=${extId}&err=email`);
  }

  revalidatePath('/inviati');
  redirect('/inviati?ok=esterno');
}
