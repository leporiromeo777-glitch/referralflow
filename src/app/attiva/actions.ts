'use server';

import { randomInt } from 'crypto';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { query } from '@/lib/db';
import { hashPassword, createSession } from '@/lib/auth';
import { sendPlain, notifySupporto } from '@/lib/notify';
import { TERMS_VERSION } from '@/lib/terms';

// IP reale del client dietro Caddy (X-Forwarded-For); in dev l'header manca.
function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'dev-locale';
}

// Attivazione self-service dello studio: modulo → codice via email → studio
// completo con il primo admin, già loggato. Il codice all'email indicata è la
// prova d'identità (stesso pattern della registrazione invianti).
// Se all'email risultano affidi esterni pendenti, diventano referral vere
// nella nuova coda: chi arriva da un link d'affido trova il paziente già lì.

// ————— Passo 1: dati dello studio → codice via email —————
export async function iniziaAttivazione(formData: FormData) {
  // Honeypot anti-spam (campo invisibile: solo i bot lo compilano).
  if (String(formData.get('sito_web') ?? '') !== '') redirect('/attiva?ok=1');

  const nome = String(formData.get('studio') ?? '').trim().slice(0, 120);
  const titolare = String(formData.get('titolare') ?? '').trim().slice(0, 120);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 160);
  const specialita = String(formData.get('specialita') ?? '').trim().slice(0, 200) || null;
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  // Il titolare è obbligatorio: l'account che nasce è il SUO (sarà lui, in
  // futuro, l'intestatario dell'abbonamento).
  if (!nome || !titolare || !email || !email.includes('@')) redirect('/attiva?err=dati');

  // Email già registrata sulla piattaforma? Deve solo accedere.
  const [esiste] = await query<{ id: string }>(
    'select id from users where email = lower($1)', [email]
  );
  if (esiste) redirect('/attiva?err=esiste');

  // Una sola richiesta attiva per email.
  await query('delete from studio_activations where lower(email) = lower($1)', [email]);
  const code = String(randomInt(100000, 1000000));
  const [att] = await query<{ id: string }>(
    `insert into studio_activations (nome, titolare, email, specialita, telefono, code)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [nome, titolare, email, specialita, telefono, code]
  );

  const inviata = await sendPlain(
    email,
    'ReferralFlow — il codice per attivare il vostro studio',
    [
      `Gentile ${titolare},`,
      '',
      `il codice per attivare il vostro studio su ReferralFlow è: ${code}`,
      `Vale 15 minuti. Se non avete richiesto voi questo codice, ignorate questa email.`,
    ].join('\n')
  );
  if (!inviata) redirect('/attiva?err=email');

  redirect(`/attiva?step=codice&a=${att.id}`);
}

// ————— Passo 2: codice + password → studio + admin, login immediato —————
export async function completaAttivazione(formData: FormData) {
  const id = String(formData.get('a') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!id) redirect('/attiva');

  const [att] = await query<{
    id: string; nome: string; titolare: string | null; email: string;
    specialita: string | null; telefono: string | null;
  }>(
    `select id, nome, titolare, email, specialita, telefono from studio_activations
      where id = $1 and code = $2 and used_at is null and expires_at > now()`,
    [id, code]
  );
  if (!att) redirect(`/attiva?step=codice&a=${id}&err=codice`);
  if (password.length < 8) redirect(`/attiva?step=codice&a=${id}&err=password`);
  // Accettazione obbligatoria di condizioni + contratto trattamento dati.
  const accetto = String(formData.get('accetto') ?? '') === '1';
  if (!accetto) redirect(`/attiva?step=codice&a=${id}&err=termini`);

  // Ricontrollo (potrebbe essersi registrato nel frattempo).
  const [esiste] = await query<{ id: string }>(
    'select id from users where email = lower($1)', [att.email]
  );
  if (esiste) redirect('/attiva?err=esiste');

  await query('update studio_activations set used_at = now() where id = $1', [att.id]);

  // Lo studio, con slug leggibile e unico. Self-service = prova di 60 giorni
  // (nessun blocco automatico alla scadenza: gestione da /piattaforma).
  const slug = await slugLibero(att.nome);
  const [studio] = await query<{ id: string; nome: string }>(
    `insert into studios
       (nome, slug, notify_email, telefono, specialita, created_via,
        titolare, abbonamento, trial_until)
     values ($1, $2, lower($3), $4, $5, 'self-service',
             $6, 'prova', current_date + 60)
     returning id, nome`,
    [att.nome, slug, att.email, att.telefono, att.specialita, att.titolare]
  );

  // Il primo accesso: amministratore (potrà creare i colleghi da Impostazioni).
  const [user] = await query<{ id: string; email: string }>(
    `insert into users (studio_id, email, password_hash, role)
     values ($1, lower($2), $3, 'admin'::user_role) returning id, email`,
    [studio.id, att.email, await hashPassword(password)]
  );

  // Registro dell'accettazione (prova: chi, quando, versione, IP). Resta anche
  // se studio/utente vengono cancellati (FK on delete set null).
  await query(
    `insert into terms_acceptances (studio_id, user_id, email, terms_version, ip)
     values ($1, $2, lower($3), $4, $5)`,
    [studio.id, user.id, att.email, TERMS_VERSION, clientIp()]
  );

  // Gli affidi esterni pendenti indirizzati a questa email diventano referral
  // vere nella nuova coda: il paziente è già lì al primo accesso.
  const convertiti = await convertiAffidiPendenti(studio.id, att.email);

  await notifySupporto(
    `ReferralFlow — nuovo studio attivato: ${studio.nome}`,
    [
      `Uno studio si è attivato in autonomia (self-service):`,
      '',
      `Studio: ${studio.nome}`,
      `Slug: ${slug}`,
      `Medico titolare: ${att.titolare || '—'}`,
      `Email admin: ${att.email}`,
      `Telefono: ${att.telefono || '—'}`,
      `Specialità: ${att.specialita || '—'}`,
      `Piano: prova gratuita di 60 giorni`,
      `Affidi pendenti convertiti nella sua coda: ${convertiti}`,
      '',
      `Gestione: /piattaforma`,
    ].join('\n')
  );

  await createSession({
    id: user.id,
    email: user.email,
    role: 'admin',
    studioId: studio.id,
    studioNome: studio.nome,
  });
  redirect('/coda?benvenuto=1');
}

// Slug leggibile dal nome, unico sulla piattaforma (studio-rossi, studio-rossi-2…).
async function slugLibero(nome: string): Promise<string> {
  const base = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'studio';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [occupato] = await query<{ id: string }>(
      'select id from studios where slug = $1', [slug]
    );
    if (!occupato) return slug;
  }
  // Estremo: suffisso casuale.
  return `${base}-${randomInt(1000, 10000)}`;
}

// Converte in referral vere gli affidi esterni pendenti indirizzati all'email
// dello studio appena attivato (da qualsiasi studio mittente). Gli allegati
// puntano agli stessi file già caricati. Il mittente viene avvisato con una
// email neutra e ritrova il paziente tra gli «Inviati» di piattaforma.
async function convertiAffidiPendenti(studioId: string, email: string): Promise<number> {
  // Sia i pendenti sia quelli già accettati dal link (il paziente va comunque
  // in coda); i rifiutati restano fuori.
  const pendenti = await query<{
    id: string; origin_id: string; cognome: string; nome: string;
    data_nascita: string | null; telefono: string | null;
    quesito: string | null; urgenza: string; appuntamento_at: string | null;
  }>(
    `select er.id, er.studio_id as origin_id, er.cognome, er.nome,
            er.data_nascita::text, er.telefono, er.quesito, er.urgenza::text,
            er.appuntamento_at::text
       from external_referrals er
       join external_studios es on es.id = er.external_studio_id
      where lower(es.email) = lower($1)
        and er.stato in ('inviato', 'preso_in_carico')
        and er.converted_referral_id is null`,
    [email]
  );

  const mittenti = new Set<string>();
  for (const aff of pendenti) {
    const [paziente] = await query<{ id: string }>(
      `insert into patients (studio_id, cognome, nome, data_nascita, telefono)
       values ($1, $2, $3, $4, $5) returning id`,
      [studioId, aff.cognome, aff.nome, aff.data_nascita, aff.telefono]
    );
    const [ref] = await query<{ id: string }>(
      `insert into referrals (studio_id, origin_studio_id, patient_id, quesito,
                              urgenza, canale, appuntamento_at)
       values ($1, $2, $3, $4, $5::urgenza, 'piattaforma', $6) returning id`,
      [studioId, aff.origin_id, paziente.id, aff.quesito, aff.urgenza, aff.appuntamento_at]
    );
    await query(
      `insert into referral_status_history (referral_id, to_status, nota)
       values ($1, 'ricevuta', 'Affido ricevuto via link: convertito all''attivazione dello studio')`,
      [ref.id]
    );
    // Gli allegati puntano agli stessi file (nessuna copia).
    await query(
      `insert into attachments (referral_id, filename, storage_key)
       select $1, filename, storage_key from external_attachments
        where external_referral_id = $2`,
      [ref.id, aff.id]
    );
    await query(
      'update external_referrals set converted_referral_id = $2 where id = $1',
      [aff.id, ref.id]
    );
    mittenti.add(aff.origin_id);
  }

  // Un avviso neutro per ogni studio mittente: l'affido ora si segue in piattaforma.
  const base = process.env.APP_BASE_URL;
  for (const originId of Array.from(mittenti)) {
    const [row] = await query<{ notify_email: string | null; dest: string }>(
      `select so.notify_email, sd.nome as dest
         from studios so, studios sd
        where so.id = $1 and sd.id = $2`,
      [originId, studioId]
    );
    if (row?.notify_email) {
      await sendPlain(
        row.notify_email,
        'Uno studio a cui avete affidato pazienti è ora su ReferralFlow',
        [
          `${row.dest} ha attivato il proprio studio su ReferralFlow.`,
          `Gli affidi che gli avevate inviato via link sono ora nella sua coda:`,
          `li seguite in tempo reale dalla pagina Inviati, come per gli altri studi.`,
          '',
          base ? `${base.replace(/\/$/, '')}/inviati` : '',
          `Questo messaggio non contiene dati del paziente.`,
        ].filter(Boolean).join('\n')
      );
    }
  }

  return pendenti.length;
}

// ————— In alternativa: essere ricontattati (modulo di contatto) —————
export async function richiediAttivazione(formData: FormData) {
  // Honeypot anti-spam.
  if (String(formData.get('sito_web') ?? '') !== '') redirect('/attiva?ok=1');

  const studio = String(formData.get('studio') ?? '').trim().slice(0, 120);
  const referente = String(formData.get('referente') ?? '').trim().slice(0, 120);
  const email = String(formData.get('email') ?? '').trim().slice(0, 160);
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40);
  const specialita = String(formData.get('specialita') ?? '').trim().slice(0, 200);
  const messaggio = String(formData.get('messaggio') ?? '').trim().slice(0, 1000);
  if (!studio || !email || !email.includes('@')) redirect('/attiva?error=1');

  await notifySupporto(
    `ReferralFlow — richiesta attivazione studio: ${studio}`,
    [
      `Nuova richiesta di essere ricontattati per attivare uno studio:`,
      '',
      `Studio: ${studio}`,
      `Specialità: ${specialita || '—'}`,
      `Referente: ${referente || '—'}`,
      `Email: ${email}`,
      `Telefono: ${telefono || '—'}`,
      messaggio ? `Messaggio: ${messaggio}` : '',
    ].filter(Boolean).join('\n')
  );
  redirect('/attiva?ok=1');
}
