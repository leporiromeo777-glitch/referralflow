'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logDocumento, isUuid } from '@/lib/cartella';
import { notifyStudio } from '@/lib/notify';

// Affida un paziente a un altro studio della piattaforma: la referral nasce
// nella coda dello studio destinatario, con origin_studio_id = studio mittente
// per il monitoraggio nella pagina «Inviati».
export async function inviaAdAltroStudio(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'medico') redirect('/programma');

  const targetId = String(formData.get('studio_id') ?? '');
  const cognome = String(formData.get('cognome') ?? '').trim().slice(0, 120);
  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);
  if (!cognome || !nome) redirect('/inviati/nuova?err=nome');

  // Il destinatario deve esistere e non essere lo studio stesso.
  const [target] = await query<{ id: string; nome: string }>(
    'select id, nome from studios where id = $1 and id <> $2 and attivo',
    [targetId, session.studioId]
  );
  if (!target) redirect('/inviati/nuova?err=studio');

  const dataNascita = String(formData.get('data_nascita') ?? '') || null;
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  const quesito = String(formData.get('quesito') ?? '').trim().slice(0, 2000) || null;
  const urgenzaRaw = String(formData.get('urgenza') ?? 'normale');
  const urgenza = ['urgente', 'normale', 'programmabile'].includes(urgenzaRaw) ? urgenzaRaw : 'normale';

  // Documenti dalla cartella del paziente (se l'invio parte da una referral):
  // solo documenti del paziente indicato e dello studio mittente, e solo con
  // la conferma del consenso del paziente (art. 321 CP / art. 20 LSan TI).
  const pazId = String(formData.get('paz') ?? '');
  const docIds = formData.getAll('doc_ids').map(String).filter(isUuid);
  const consenso = String(formData.get('consenso') ?? '') === '1';
  let documenti: { id: string; filename: string; storage_key: string }[] = [];
  if (docIds.length > 0 && isUuid(pazId)) {
    if (!consenso) {
      redirect(`/inviati/nuova?studio=${targetId}&paz=${pazId}&err=consenso`);
    }
    documenti = await query<{ id: string; filename: string; storage_key: string }>(
      `select id, filename, storage_key from patient_documents
        where id = any($1::uuid[]) and patient_id = $2 and studio_id = $3`,
      [docIds, pazId, session.studioId]
    );
  }

  const [patient] = await query<{ id: string }>(
    `insert into patients (studio_id, cognome, nome, data_nascita, telefono)
     values ($1,$2,$3,$4,$5) returning id`,
    [target.id, cognome, nome, dataNascita, telefono]
  );
  const [ref] = await query<{ id: string }>(
    `insert into referrals (studio_id, origin_studio_id, patient_id, quesito, urgenza,
                            status, canale, consenso_trasmissione)
     values ($1,$2,$3,$4,$5::urgenza,'ricevuta'::referral_status,'piattaforma',$6) returning id`,
    [target.id, session.studioId, patient.id, quesito, urgenza,
     documenti.length > 0 ? new Date().toISOString() : null]
  );
  await query(
    `insert into referral_status_history (referral_id, to_status, changed_by, nota)
     values ($1,'ricevuta'::referral_status,$2,$3)`,
    [ref.id, session.id, `Affidata da ${session.studioNome} tramite la piattaforma`]
  );

  // I documenti selezionati diventano allegati della referral nello studio
  // destinatario (stesso file, nessuna copia); ogni invio finisce nel registro.
  for (const doc of documenti) {
    await query(
      'insert into attachments (referral_id, filename, storage_key) values ($1,$2,$3)',
      [ref.id, doc.filename, doc.storage_key]
    );
    await logDocumento(doc.id, 'invio', {
      studioId: session.studioId,
      userId: session.id,
      dettaglio: `affidato a ${target.nome} (piattaforma), con consenso del paziente`,
    });
  }

  // Avvisa la segreteria dello studio destinatario (testo neutro nLPD).
  await notifyStudio(target.id, session.studioNome, urgenza);

  redirect('/inviati?ok=1');
}
