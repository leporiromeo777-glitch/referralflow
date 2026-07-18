'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { putFile } from '@/lib/storage';
import { logDocumento, CATEGORIE } from '@/lib/cartella';
import { notifyReferrer, notifyOriginStudio } from '@/lib/notify';
import { sendSms } from '@/lib/sms';
import { NEXT_STATUS } from '@/lib/status';
import { isAllowedInternalUpload, MAX_UPLOAD_SIZE } from '@/lib/upload';

export async function advanceStatus(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('id'));
  const to = String(formData.get('to'));
  const nota = String(formData.get('nota') ?? '').trim() || null;
  const appuntamento = String(formData.get('appuntamento_at') ?? '') || null;

  const [cur] = await query<{ status: string }>(
    'select status from referrals where id = $1 and studio_id = $2',
    [id, session.studioId]
  );
  if (!cur) redirect('/');

  // Accetta solo la transizione successiva prevista dalla macchina degli stati.
  if (NEXT_STATUS[cur.status] !== to) redirect(`/referral/${id}`);

  // La prenotazione richiede la data e l'ora dell'appuntamento.
  if (to === 'prenotata' && !appuntamento) redirect(`/referral/${id}?err=appuntamento`);

  // La chiusura richiede la decisione sul follow-up: non da rivedere,
  // oppure da rivedere tra 6/12 mesi o un numero di mesi a scelta.
  // La scadenza si calcola dall'ultima visita registrata.
  if (to === 'chiusa') {
    const scelta = String(formData.get('follow_up') ?? '');
    let mesi: number | null = null;
    if (scelta === '6') mesi = 6;
    else if (scelta === '12') mesi = 12;
    else if (scelta === 'altro') {
      const n = parseInt(String(formData.get('follow_up_mesi') ?? ''), 10);
      if (!Number.isInteger(n) || n < 1 || n > 120) redirect(`/referral/${id}?err=followup`);
      mesi = n;
    } else if (scelta !== 'no') {
      redirect(`/referral/${id}?err=followup`);
    }
    if (mesi !== null) {
      await query(
        `update referrals
            set follow_up_months = $2,
                follow_up_due = (coalesce(
                  (select max(changed_at) from referral_status_history
                    where referral_id = $1 and to_status = 'vista'),
                  appuntamento_at,
                  now()
                ) + make_interval(months => $2))::date
          where id = $1`,
        [id, mesi]
      );
    }
  }

  // L'esito al medico inviante richiede il referto allegato: si può caricare
  // direttamente da questo form, oppure deve già essere tra gli allegati.
  if (to === 'referto_inviato') {
    const file = formData.get('referto') as File | null;
    if (file && file.size > 0) {
      if (file.size > MAX_UPLOAD_SIZE || !isAllowedInternalUpload(file)) {
        redirect(`/referral/${id}?err=file_referto`);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const key = await putFile(buffer, file.type || 'application/octet-stream', ext);
      await query(
        'insert into attachments (referral_id, filename, storage_key) values ($1,$2,$3)',
        [id, file.name, key]
      );
    }
    const [att] = await query<{ n: number }>(
      'select count(*)::int as n from attachments where referral_id = $1',
      [id]
    );
    if (!att || att.n === 0) redirect(`/referral/${id}?err=referto`);
  }

  await query(
    `update referrals
       set status = $1::referral_status,
           appuntamento_at = coalesce($2, appuntamento_at),
           updated_at = now()
     where id = $3`,
    [to, appuntamento, id]
  );

  await query(
    `insert into referral_status_history (referral_id, from_status, to_status, changed_by, nota)
     values ($1, $2::referral_status, $3::referral_status, $4, $5)`,
    [id, cur.status, to, session.id, nota]
  );

  const tipoNotifica: Record<string, string> = {
    da_prenotare: 'ricevuta',
    prenotata: 'prenotata',
    referto_inviato: 'esito',
  };
  if (tipoNotifica[to]) {
    // Prova l'invio reale (avviso neutro, senza dati clinici); in ogni caso
    // la notifica resta registrata con il canale effettivo.
    const canale = await notifyReferrer(id, tipoNotifica[to]);
    await query(
      `insert into notifications (referral_id, tipo, canale) values ($1,$2,$3)`,
      [id, tipoNotifica[to], canale]
    );
  }

  // Collaborazione con «Inviati»: se il paziente è stato affidato da un altro
  // studio della piattaforma, quello studio riceve l'aggiornamento del percorso.
  await notifyOriginStudio(id, to);

  revalidatePath(`/referral/${id}`);
  revalidatePath('/');
}

// Sposta l'appuntamento di una referral prenotata (es. dopo una disdetta):
// nuova data, risposta del paziente azzerata, promemoria riarmato.
export async function updateAppointment(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('id'));
  const appuntamento = String(formData.get('appuntamento_at') ?? '');
  if (!appuntamento) redirect(`/referral/${id}`);

  const [cur] = await query<{ status: string }>(
    'select status from referrals where id = $1 and studio_id = $2',
    [id, session.studioId]
  );
  if (!cur || cur.status !== 'prenotata') redirect(`/referral/${id}`);

  await query(
    `update referrals
        set appuntamento_at = $2, appt_response = null, appt_response_at = null,
            reminder_sent_at = null, updated_at = now()
      where id = $1`,
    [id, appuntamento]
  );
  await query(
    `insert into referral_status_history (referral_id, from_status, to_status, changed_by, nota)
     values ($1, 'prenotata'::referral_status, 'prenotata'::referral_status, $2, 'Appuntamento spostato')`,
    [id, session.id]
  );

  revalidatePath(`/referral/${id}`);
  revalidatePath('/');
}

// La segreteria conferma la disdetta segnalata dal paziente (dopo la telefonata):
// da qui lo slot compare nella Lista d'attesa per essere riassegnato.
export async function confermaDisdetta(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const id = String(formData.get('id'));
  const [cur] = await query<{ appt_response: string | null }>(
    `select appt_response from referrals
      where id = $1 and studio_id = $2 and status = 'prenotata'`,
    [id, session.studioId]
  );
  if (!cur || cur.appt_response !== 'disdetta_da_confermare') redirect(`/referral/${id}`);

  await query(
    `update referrals set appt_response = 'disdetto', appt_response_at = now(), updated_at = now()
      where id = $1`,
    [id]
  );
  await query(
    `insert into referral_status_history (referral_id, from_status, to_status, changed_by, nota)
     values ($1, 'prenotata'::referral_status, 'prenotata'::referral_status, $2,
             'Disdetta confermata dalla segreteria')`,
    [id, session.id]
  );
  revalidatePath(`/referral/${id}`);
  revalidatePath('/');
}

// Falso allarme: la segnalazione di disdetta viene annullata, l'appuntamento resta.
export async function annullaSegnalazioneDisdetta(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const id = String(formData.get('id'));
  await query(
    `update referrals set appt_response = null, appt_response_at = null, updated_at = now()
      where id = $1 and studio_id = $2 and appt_response = 'disdetta_da_confermare'`,
    [id, session.studioId]
  );
  await query(
    `insert into referral_status_history (referral_id, from_status, to_status, changed_by, nota)
     values ($1, 'prenotata'::referral_status, 'prenotata'::referral_status, $2,
             'Segnalazione di disdetta annullata (appuntamento confermato a voce)')`,
    [id, session.id]
  );
  revalidatePath(`/referral/${id}`);
  revalidatePath('/');
}

// Assegna (o rimuove) la preparazione alla visita per questa referral.
// Solo segreteria/admin: il medico non gestisce la coda.
export async function assegnaPreparazione(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const id = String(formData.get('id'));
  const prepId = String(formData.get('preparazione_id') ?? '') || null;

  // La preparazione (se indicata) deve appartenere allo studio.
  if (prepId) {
    const [ok] = await query<{ id: string }>(
      'select id from preparazioni where id = $1 and studio_id = $2',
      [prepId, session.studioId]
    );
    if (!ok) redirect(`/referral/${id}`);
  }

  await query(
    `update referrals set preparazione_id = $2, preparazione_sent_at = null
      where id = $1 and studio_id = $3`,
    [id, prepId, session.studioId]
  );
  revalidatePath(`/referral/${id}`);
}

// Invia al paziente la preparazione assegnata (SMS neutro). Se l'SMS non è
// ancora attivo resta registrata, come per i promemoria.
export async function inviaPreparazione(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const id = String(formData.get('id'));
  const [row] = await query<{ telefono: string | null; studio_nome: string; testo: string | null }>(
    `select p.telefono, s.nome as studio_nome, pr.testo
       from referrals r
       join patients p on p.id = r.patient_id
       join studios s on s.id = r.studio_id
       left join preparazioni pr on pr.id = r.preparazione_id
      where r.id = $1 and r.studio_id = $2`,
    [id, session.studioId]
  );
  if (!row || !row.testo) redirect(`/referral/${id}?err=prep_manca`);
  if (!row.telefono || row.telefono.trim().length === 0) redirect(`/referral/${id}?err=prep_tel`);

  const testo = `${row.studio_nome}: preparazione per il suo appuntamento. ${row.testo}`;
  const esito = await sendSms(row.telefono.trim(), testo);
  if (esito === 'errore') redirect(`/referral/${id}?err=prep_invio`);

  await query('update referrals set preparazione_sent_at = now() where id = $1', [id]);
  await query(
    `insert into notifications (referral_id, tipo, canale) values ($1, 'preparazione', $2)`,
    [id, esito]
  );
  revalidatePath(`/referral/${id}`);
}

export async function uploadAttachment(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('id'));
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) redirect(`/referral/${id}`);
  if (file.size > MAX_UPLOAD_SIZE || !isAllowedInternalUpload(file)) {
    redirect(`/referral/${id}?err=file_allegato`);
  }

  const [own] = await query<{ id: string }>(
    'select id from referrals where id = $1 and studio_id = $2',
    [id, session.studioId]
  );
  if (!own) redirect('/');

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const key = await putFile(buffer, file.type || 'application/octet-stream', ext);

  await query(
    'insert into attachments (referral_id, filename, storage_key) values ($1,$2,$3)',
    [id, file.name, key]
  );
  revalidatePath(`/referral/${id}`);
}

// Carica un documento nella cartella del paziente (Fase 14): il documento
// resta legato al paziente oltre la singola referral, e il caricamento
// finisce nel registro accessi.
export async function uploadPatientDocument(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const referralId = String(formData.get('referral_id'));
  const patientId = String(formData.get('patient_id'));
  const categoriaRaw = String(formData.get('categoria') ?? 'altro');
  const categoria = categoriaRaw in CATEGORIE ? categoriaRaw : 'altro';
  const nota = String(formData.get('nota') ?? '').trim().slice(0, 200) || null;

  // Da telefono si possono fotografare più pagine e caricarle insieme: il
  // campo «file» arriva quindi più volte. Categoria e nota valgono per tutti.
  const files = formData
    .getAll('file')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(`/referral/${referralId}`);
  for (const f of files) {
    if (f.size > MAX_UPLOAD_SIZE || !isAllowedInternalUpload(f)) {
      redirect(`/referral/${referralId}?err=file_cartella`);
    }
  }

  // Il paziente deve appartenere allo studio della sessione.
  const [own] = await query<{ id: string }>(
    'select id from patients where id = $1 and studio_id = $2',
    [patientId, session.studioId]
  );
  if (!own) redirect('/');

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const key = await putFile(buffer, file.type || 'application/octet-stream', ext);

    const [doc] = await query<{ id: string }>(
      `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [session.studioId, patientId, file.name, key, categoria, nota, session.id]
    );
    await logDocumento(doc.id, 'caricamento', {
      studioId: session.studioId,
      userId: session.id,
    });
  }

  revalidatePath(`/referral/${referralId}`);
}
