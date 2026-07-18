'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { syncFeed } from '@/lib/agenda-sync';

// Sincronizza tutti i feed attivi.
export async function syncNow() {
  const session = await getSession();
  if (!session) redirect('/login');

  const feeds = await query<{ id: string }>(
    'select id from agenda_feeds where attivo = true and studio_id = $1',
    [session.studioId]
  );
  for (const f of feeds) {
    await syncFeed(f.id);
  }
  revalidatePath('/programma');
}

// Estrae la parte "medico" dal titolo togliendo il nome paziente e i separatori.
function doctorToken(titolo: string, paziente: string | null): string {
  let s = titolo || '';
  if (paziente) s = s.split(paziente).join(' ');
  s = s.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[—–|;,-]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Segna una visita del programma come completata. Il medico decide il follow-up:
// non da rivedere, oppure da rivedere tra 6/12/N mesi (scadenza dalla data della visita).
// Se l'appuntamento è collegato a una referral: il follow-up viene copiato sulla referral
// (comparirà nei Richiami) e, se la referral era "prenotata", avanza a "vista".
export async function completaAppuntamento(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('appointment_id') || '');
  const scelta = String(formData.get('follow_up') ?? '');
  if (!id) redirect('/programma');

  let mesi: number | null = null;
  if (scelta === '6') mesi = 6;
  else if (scelta === '12') mesi = 12;
  else if (scelta === 'altro') {
    const n = parseInt(String(formData.get('follow_up_mesi') ?? ''), 10);
    if (!Number.isInteger(n) || n < 1 || n > 120) redirect('/programma?err=followup');
    mesi = n;
  } else if (scelta !== 'no') {
    redirect('/programma?err=followup');
  }

  const [appt] = await query<{ starts_at: string; referral_id: string | null; ref_status: string | null }>(
    `select a.starts_at, a.referral_id, r.status as ref_status
       from appointments a
       left join referrals r on r.id = a.referral_id
      where a.id = $1 and a.studio_id = $2`,
    [id, session.studioId]
  );
  if (!appt) redirect('/programma');

  // Registra il completamento e la decisione sull'appuntamento.
  await query(
    `update appointments
        set completed_at = now(),
            follow_up_months = $2,
            follow_up_due = case when $2::int is null then null
                                 else (starts_at + make_interval(months => $2))::date end
      where id = $1`,
    [id, mesi]
  );

  if (appt.referral_id) {
    // Copia la decisione sulla referral (fonte unica per i Richiami).
    await query(
      `update referrals
          set follow_up_months = $2,
              follow_up_due = case when $2::int is null then null
                                   else ($3::timestamptz + make_interval(months => $2))::date end
        where id = $1`,
      [appt.referral_id, mesi, appt.starts_at]
    );
    // La visita fatta = paziente visto.
    if (appt.ref_status === 'prenotata') {
      await query(
        `update referrals set status = 'vista'::referral_status, updated_at = now() where id = $1`,
        [appt.referral_id]
      );
      await query(
        `insert into referral_status_history (referral_id, from_status, to_status, changed_by, nota)
         values ($1, 'prenotata'::referral_status, 'vista'::referral_status, $2, 'Completata dal programma del giorno')`,
        [appt.referral_id, session.id]
      );
    }
  }

  revalidatePath('/programma');
  revalidatePath('/richiami');
  revalidatePath('/');
}

// Annulla il completamento (errore di click): torna "da fare", follow-up azzerato.
export async function annullaCompletamento(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('appointment_id') || '');
  if (id) {
    await query(
      `update appointments
          set completed_at = null, follow_up_months = null, follow_up_due = null
        where id = $1 and studio_id = $2`,
      [id, session.studioId]
    );
  }
  revalidatePath('/programma');
}

// Assegna un medico a un appuntamento; opzionalmente "impara" un alias per le volte future.
export async function assignProvider(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const appointmentId = String(formData.get('appointment_id') || '');
  const providerId = String(formData.get('provider_id') || '');
  const remember = formData.get('remember') === 'on';
  if (!appointmentId || !providerId) redirect('/programma');

  // Appuntamento e medico devono appartenere allo studio della sessione.
  await query(
    `update appointments set provider_id = $1
      where id = $2 and studio_id = $3
        and exists (select 1 from providers where id = $1 and studio_id = $3)`,
    [providerId, appointmentId, session.studioId]
  );

  if (remember) {
    const [appt] = await query<{ titolo: string | null; paziente_nome: string | null }>(
      'select titolo, paziente_nome from appointments where id = $1 and studio_id = $2',
      [appointmentId, session.studioId]
    );
    const alias = appt ? doctorToken(appt.titolo || '', appt.paziente_nome) : '';
    if (alias && alias.length >= 2) {
      // Aggiunge l'alias solo se non già presente.
      await query(
        `update providers
            set aliases = array_append(aliases, $1)
          where id = $2 and studio_id = $3 and not ($1 = any(aliases))`,
        [alias, providerId, session.studioId]
      );
    }
  }

  revalidatePath('/programma');
}
