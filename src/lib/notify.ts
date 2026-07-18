import 'server-only';
import nodemailer from 'nodemailer';
import { query } from './db';

// Avviso neutro al medico inviante quando la sua referral avanza.
// Vincolo nLPD: la mail NON contiene dati clinici né il nome del paziente,
// solo l'invito a consultare il portale riservato. Configurando l'SMTP del
// gateway HIN, l'avviso viaggia sulla rete sicura.

const OGGETTO: Record<string, string> = {
  ricevuta: 'Referral presa in carico',
  prenotata: 'Aggiornamento su un suo invio',
  esito: 'Referto disponibile per un suo invio',
};

type DocRow = {
  nome: string;
  email: string | null;
  token: string;
  token_valido: boolean;
  studio_nome: string;
};

function transporter() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

// Invio semplice riutilizzabile (cron: watchdog, report). Testi sempre neutri.
export async function sendPlain(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.SMTP_HOST || !to) return false;
  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to,
      subject,
      text,
    });
    return true;
  } catch (e: any) {
    console.error('Invio email fallito:', e?.message || e);
    return false;
  }
}

// Avviso interno al titolare della piattaforma (SUPPORT_EMAIL): nuovi studi
// attivati, nuovi invianti registrati. Mai dati di pazienti.
export async function notifySupporto(subject: string, text: string): Promise<void> {
  const to = process.env.SUPPORT_EMAIL || process.env.STUDIO_NOTIFY_EMAIL || '';
  if (to) await sendPlain(to, subject, text);
}

// Avvisa la segreteria dello studio destinatario che è arrivata una nuova richiesta.
// Testo neutro nLPD: solo mittente e urgenza, mai dati del paziente.
// L'indirizzo è quello dello studio (studios.notify_email), con fallback sull'env.
export async function notifyStudio(studioId: string, medicoNome: string, urgenza: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const base = process.env.APP_BASE_URL;
  const [studio] = await query<{ notify_email: string | null }>(
    'select notify_email from studios where id = $1',
    [studioId]
  );
  const to = studio?.notify_email || process.env.STUDIO_NOTIFY_EMAIL;
  if (!host || !to) return;

  const testo = [
    `È arrivata una nuova richiesta di visita.`,
    '',
    `Medico inviante: ${medicoNome}`,
    `Urgenza indicata: ${urgenza}`,
    '',
    base ? `Aprila in ReferralFlow: ${base.replace(/\/$/, '')}/` : '',
    `Questo messaggio non contiene dati del paziente.`,
  ].join('\n');

  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to,
      subject: urgenza === 'urgente' ? 'Nuova richiesta URGENTE in arrivo' : 'Nuova richiesta in arrivo',
      text: testo,
    });
  } catch (e: any) {
    console.error('Avviso segreteria fallito:', e?.message || e);
  }
}

// Il paziente ha toccato «chiama per disdire» dal link del promemoria: avvisa
// la segreteria che sta arrivando la telefonata e che la disdetta va confermata
// dalla scheda della referral. Testo neutro nLPD: solo data/ora, nessun dato.
export async function notifyDisdettaSegnalata(referralId: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const base = process.env.APP_BASE_URL;

  const [row] = await query<{ appuntamento: string | null; notify_email: string | null }>(
    `select to_char(r.appuntamento_at, 'DD.MM.YYYY HH24:MI') as appuntamento,
            s.notify_email
       from referrals r
       join studios s on s.id = r.studio_id
      where r.id = $1`,
    [referralId]
  );
  const to = row?.notify_email || process.env.STUDIO_NOTIFY_EMAIL;
  if (!row || !host || !to) return;

  const testo = [
    `Un paziente ha segnalato che deve disdire l'appuntamento${row.appuntamento ? ` del ${row.appuntamento}` : ''} e sta chiamando lo studio.`,
    `Dopo la telefonata, confermi (o annulli) la disdetta dalla scheda della referral.`,
    `Alla conferma, lo slot comparirà nella scheda «Disdette» della Coda per richiamare il prossimo paziente.`,
    '',
    base ? `${base.replace(/\/$/, '')}/referral/${referralId}` : '',
    `Questo messaggio non contiene dati del paziente.`,
  ].filter(Boolean).join('\n');

  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to,
      subject: 'Disdetta segnalata da un paziente — da confermare',
      text: testo,
    });
  } catch (e: any) {
    console.error('Avviso disdetta fallito:', e?.message || e);
  }
}

// Aggiornamento allo studio mittente per un paziente affidato tramite la
// piattaforma (pagina «Inviati»). Testo neutro: solo il nuovo passo del percorso.
const PASSO_INVIATI: Record<string, string> = {
  prenotata: 'appuntamento fissato',
  referto_inviato: 'referto inviato',
  chiusa: 'percorso concluso',
};

export async function notifyOriginStudio(referralId: string, toStatus: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const base = process.env.APP_BASE_URL;
  const passo = PASSO_INVIATI[toStatus];
  if (!passo) return;

  const [row] = await query<{ dest_nome: string; origin_email: string | null }>(
    `select sd.nome as dest_nome, so.notify_email as origin_email
       from referrals r
       join studios sd on sd.id = r.studio_id
       join studios so on so.id = r.origin_studio_id
      where r.id = $1 and r.origin_studio_id is not null`,
    [referralId]
  );
  if (!row || !host || !row.origin_email) return;

  const testo = [
    `C'è un aggiornamento su un paziente che avete affidato a: ${row.dest_nome}.`,
    `Nuovo passo: ${passo}.`,
    '',
    base ? `Dettagli nella pagina Inviati: ${base.replace(/\/$/, '')}/inviati` : '',
    `Questo messaggio non contiene dati del paziente.`,
  ].filter(Boolean).join('\n');

  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to: row.origin_email,
      subject: 'Aggiornamento su un paziente affidato',
      text: testo,
    });
  } catch (e: any) {
    console.error('Avviso studio mittente fallito:', e?.message || e);
  }
}

// Invio a uno studio esterno (non sulla piattaforma): email neutra col link
// sicuro per vedere i dettagli e rispondere. Nessun dato clinico nella mail.
// Ritorna true se l'email è partita (senza SMTP l'affido non ha senso: il link
// non arriverebbe mai allo studio esterno).
export async function notifyAffidoEsterno(externalReferralId: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const base = process.env.APP_BASE_URL;

  const [row] = await query<{
    token: string; email: string; ext_nome: string; mittente: string;
    mittente_telefono: string | null;
  }>(
    `select er.token, es.email, es.nome as ext_nome, s.nome as mittente,
            s.telefono as mittente_telefono
       from external_referrals er
       join external_studios es on es.id = er.external_studio_id
       join studios s on s.id = er.studio_id
      where er.id = $1`,
    [externalReferralId]
  );
  if (!row || !host || !base) return false;

  const link = `${base.replace(/\/$/, '')}/affido/${row.token}`;
  const testo = [
    `Gentile ${row.ext_nome},`,
    '',
    `${row.mittente} desidera affidarvi un paziente.`,
    `Aprite il link riservato per i dettagli e per rispondere (un clic, senza registrazione):`,
    link,
    '',
    `Il link non richiede credenziali, password né pagamenti: mostra solo i dettagli`,
    `dell'invio e due pulsanti per rispondere.`,
    row.mittente_telefono
      ? `Per qualsiasi verifica potete chiamare direttamente lo studio: ${row.mittente_telefono}.`
      : `Per qualsiasi verifica potete contattare direttamente lo studio mittente.`,
    '',
    `Questo messaggio non contiene dati del paziente. Il link scade automaticamente.`,
  ].join('\n');

  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to: row.email,
      subject: `${row.mittente} vuole affidarvi un paziente`,
      text: testo,
    });
    return true;
  } catch (e: any) {
    console.error('Invio affido esterno fallito:', e?.message || e);
    return false;
  }
}

// Lo studio esterno ha risposto dal link: avvisa lo studio mittente.
export async function notifyRispostaAffido(externalReferralId: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const base = process.env.APP_BASE_URL;

  const [row] = await query<{
    stato: string; ext_nome: string; notify_email: string | null;
  }>(
    `select er.stato, es.nome as ext_nome, s.notify_email
       from external_referrals er
       join external_studios es on es.id = er.external_studio_id
       join studios s on s.id = er.studio_id
      where er.id = $1`,
    [externalReferralId]
  );
  const to = row?.notify_email || process.env.STUDIO_NOTIFY_EMAIL;
  if (!row || !host || !to) return;

  const esito = row.stato === 'preso_in_carico'
    ? 'ha preso in carico il paziente'
    : 'non può prendere in carico il paziente';
  const testo = [
    `${row.ext_nome} ${esito}.`,
    '',
    base ? `Dettagli nella pagina Inviati: ${base.replace(/\/$/, '')}/inviati` : '',
    `Questo messaggio non contiene dati del paziente.`,
  ].filter(Boolean).join('\n');

  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to,
      subject: row.stato === 'preso_in_carico'
        ? 'Affido accettato da uno studio esterno'
        : 'Affido non accettato da uno studio esterno',
      text: testo,
    });
  } catch (e: any) {
    console.error('Avviso risposta affido fallito:', e?.message || e);
  }
}

// Ritorna il canale effettivo della notifica: 'email' se inviata, 'portale'
// se solo registrata (SMTP non configurato, medico senza email, o errore).
export async function notifyReferrer(referralId: string, tipo: string): Promise<string> {
  const host = process.env.SMTP_HOST;
  const base = process.env.APP_BASE_URL;

  const [doc] = await query<DocRow>(
    `select d.nome, d.email, d.token, (d.token_expires_at > now()) as token_valido,
            s.nome as studio_nome
       from referrals r
       join referring_doctors d on d.id = r.referring_doctor_id
       join studios s on s.id = r.studio_id
      where r.id = $1`,
    [referralId]
  );
  if (!doc || !doc.email || !host || !base) return 'portale';

  const link = doc.token_valido ? `${base.replace(/\/$/, '')}/portale/${doc.token}` : null;
  const testo = [
    `Gentile ${doc.nome},`,
    '',
    `c'è un aggiornamento su una referral da lei inviata a: ${doc.studio_nome}.`,
    link
      ? `Può consultare i dettagli nel suo portale riservato:\n${link}`
      : `Il suo link al portale è scaduto: contatti la segreteria dello studio per riceverne uno nuovo.`,
    '',
    `Questo messaggio non contiene dati clinici. Non risponda a questa email.`,
  ].join('\n');

  try {
    await transporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@referralflow.ch',
      to: doc.email,
      subject: OGGETTO[tipo] ?? 'Aggiornamento su un suo invio',
      text: testo,
    });
    return 'email';
  } catch (e: any) {
    // Niente dati sensibili nel log: solo il motivo tecnico.
    console.error('Invio notifica fallito:', e?.message || e);
    return 'portale';
  }
}
