'use server';

import { randomInt } from 'crypto';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { hashPassword, createSession } from '@/lib/auth';
import { sendPlain, notifySupporto, notifyConsultoStudio } from '@/lib/notify';
import { putFile } from '@/lib/storage';
import { isAllowedPublicUpload, MAX_UPLOAD_SIZE } from '@/lib/upload';

// Consulto rapido: domanda scritta dello specialista senza aprire una referral.
// Il token del portale identifica medico e studio; limiti anti-abuso perché la
// rotta è pubblica (come i moduli d'invio).
const MAX_CONSULTO_FILES = 3;

export async function inviaConsulto(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const [doc] = await query<{ id: string; nome: string; studio_id: string }>(
    `select id, nome, studio_id from referring_doctors
      where token = $1 and token_expires_at > now()`,
    [token]
  );
  if (!doc) redirect('/');

  const domanda = String(formData.get('domanda') ?? '').trim();
  if (!domanda) redirect(`/portale/${token}?consulto=vuoto`);
  if (domanda.length > 4000) redirect(`/portale/${token}?consulto=lungo`);

  const [consulto] = await query<{ id: string }>(
    `insert into consulti (studio_id, referring_doctor_id, domanda)
     values ($1, $2, $3) returning id`,
    [doc.studio_id, doc.id, domanda]
  );

  const files = formData.getAll('allegati').filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  for (const file of files.slice(0, MAX_CONSULTO_FILES)) {
    if (file.size > MAX_UPLOAD_SIZE || !isAllowedPublicUpload(file)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const key = await putFile(buffer, file.type || 'application/octet-stream', ext);
    await query(
      'insert into consulto_attachments (consulto_id, filename, storage_key) values ($1,$2,$3)',
      [consulto.id, file.name, key]
    );
  }

  // Avviso neutro alla segreteria (mai la domanda in email). Non bloccante.
  await notifyConsultoStudio(doc.studio_id, doc.nome);

  redirect(`/portale/${token}?consulto=ok`);
}

// Registrazione self-service del medico inviante dal suo portale.
// Il token del portale è la garanzia (glielo ha dato uno studio che lo conosce);
// il codice inviato all'email in anagrafica prova che l'email è sua.

// Passo 1: chiede il codice di verifica via email.
export async function richiediCodice(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const [doc] = await query<{ id: string; nome: string; email: string | null }>(
    `select id, nome, email from referring_doctors
      where token = $1 and token_expires_at > now()`,
    [token]
  );
  if (!doc) redirect('/');
  if (!doc.email) redirect(`/portale/${token}?reg=noemail`);

  // Email già registrata? Allora deve solo accedere.
  const [esiste] = await query<{ id: string }>(
    'select id from users where email = lower($1)',
    [doc.email]
  );
  if (esiste) redirect(`/portale/${token}?reg=esiste`);

  // Un solo codice attivo per medico.
  await query('delete from login_verifications where referring_doctor_id = $1', [doc.id]);
  const code = String(randomInt(100000, 1000000));
  await query(
    `insert into login_verifications (referring_doctor_id, email, code)
     values ($1, lower($2), $3)`,
    [doc.id, doc.email, code]
  );

  const inviata = await sendPlain(
    doc.email,
    'ReferralFlow — il suo codice di verifica',
    [
      `Gentile ${doc.nome},`,
      '',
      `il suo codice per creare l'accesso a ReferralFlow è: ${code}`,
      `Vale 15 minuti. Se non ha richiesto lei questo codice, ignori questa email.`,
    ].join('\n')
  );
  if (!inviata) redirect(`/portale/${token}?reg=errore`);

  redirect(`/portale/${token}?reg=inviato`);
}

// Passo 2: verifica il codice e crea l'account inviante.
export async function completaRegistrazione(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const [doc] = await query<{
    id: string; nome: string; studio: string | null;
    email: string | null; telefono: string | null;
  }>(
    `select id, nome, studio, email, telefono from referring_doctors
      where token = $1 and token_expires_at > now()`,
    [token]
  );
  if (!doc || !doc.email) redirect('/');
  if (password.length < 8) redirect(`/portale/${token}?reg=password`);

  const [ver] = await query<{ id: string }>(
    `select id from login_verifications
      where referring_doctor_id = $1 and code = $2
        and used_at is null and expires_at > now()`,
    [doc.id, code]
  );
  if (!ver) redirect(`/portale/${token}?reg=codice`);

  await query('update login_verifications set used_at = now() where id = $1', [ver.id]);

  const [user] = await query<{ id: string; email: string }>(
    `insert into users (studio_id, email, password_hash, role)
     values (null, lower($1), $2, 'inviante'::user_role)
     on conflict (email) do nothing
     returning id, email`,
    [doc.email, await hashPassword(password)]
  );
  if (!user) redirect(`/portale/${token}?reg=esiste`);

  // Profilo per l'annuario, precompilato dall'anagrafica.
  await query(
    `insert into inviante_profiles (user_id, nome, studio, telefono)
     values ($1, $2, $3, $4)`,
    [user.id, doc.nome, doc.studio, doc.telefono]
  );

  // Avviso al titolare della piattaforma: il funnel sta funzionando.
  await notifySupporto(
    `ReferralFlow — nuovo medico inviante registrato: ${doc.nome}`,
    [
      `Un medico inviante ha creato il suo accesso dal portale:`,
      '',
      `Nome: ${doc.nome}`,
      `Studio: ${doc.studio || '—'}`,
      `Email: ${doc.email}`,
      '',
      `È visibile nell'annuario di «Affida paziente» e in /piattaforma.`,
    ].join('\n')
  );

  await createSession({
    id: user.id,
    email: user.email,
    role: 'inviante',
    studioId: '',
    studioNome: '',
  });
  redirect('/invii?benvenuto=1');
}
