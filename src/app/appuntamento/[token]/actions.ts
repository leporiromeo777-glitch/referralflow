'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { notifyDisdettaSegnalata } from '@/lib/notify';

// Conferma del paziente al promemoria. La disdetta NON avviene più da qui:
// il paziente segnala e chiama lo studio; è la segreteria che conferma.
export async function rispondiAppuntamento(formData: FormData) {
  const token = String(formData.get('token') || '');
  const risposta = String(formData.get('risposta') || '');
  if (!token || risposta !== 'confermato') redirect('/');

  const [ref] = await query<{ id: string }>(
    `select id from referrals
      where appt_token = $1 and status = 'prenotata' and appuntamento_at > now()`,
    [token]
  );
  if (!ref) redirect(`/appuntamento/${token}`);

  await query(
    `update referrals set appt_response = 'confermato', appt_response_at = now() where id = $1`,
    [ref.id]
  );
  redirect(`/appuntamento/${token}?ok=1`);
}

// Il paziente tocca «chiama per disdire»: si registra la segnalazione
// (da confermare da parte della segreteria) mentre parte la telefonata.
// Idempotente: più tocchi non cambiano nulla; non sovrascrive stati già decisi.
export async function segnalaDisdetta(token: string) {
  if (!token) return;

  const [ref] = await query<{ id: string }>(
    `select id from referrals
      where appt_token = $1 and status = 'prenotata' and appuntamento_at > now()
        and (appt_response is null or appt_response = 'confermato')`,
    [token]
  );
  if (!ref) return;

  await query(
    `update referrals set appt_response = 'disdetta_da_confermare', appt_response_at = now()
      where id = $1`,
    [ref.id]
  );
  await query(
    `insert into notifications (referral_id, tipo, canale) values ($1, 'disdetta_segnalata', 'paziente')`,
    [ref.id]
  );
  // Avvisa la segreteria: il paziente sta chiamando per disdire, serve la conferma.
  await notifyDisdettaSegnalata(ref.id);
}

// Questionario pre-visita: il paziente compila una breve anamnesi dal
// promemoria. Si salva sulla referral (jsonb) e si può aggiornare fino alla
// visita. Nessun dato in URL o log: solo l'esito «salvato».
const MAX_CAMPO = 2000;

export async function salvaQuestionario(formData: FormData) {
  const token = String(formData.get('token') || '');
  if (!token) redirect('/');

  const [ref] = await query<{ id: string }>(
    `select id from referrals
      where appt_token = $1 and status = 'prenotata' and appuntamento_at > now()`,
    [token]
  );
  if (!ref) redirect(`/appuntamento/${token}`);

  const campo = (n: string) => String(formData.get(n) ?? '').trim().slice(0, MAX_CAMPO);
  const questionario = {
    motivo: campo('motivo'),
    farmaci: campo('farmaci'),
    allergie: campo('allergie'),
    note: campo('note'),
  };

  await query(
    `update referrals set questionario = $2, questionario_at = now() where id = $1`,
    [ref.id, JSON.stringify(questionario)]
  );
  redirect(`/appuntamento/${token}?quest=ok`);
}
