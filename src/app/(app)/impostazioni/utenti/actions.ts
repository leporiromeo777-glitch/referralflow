'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession, hashPassword, dimenticaRiscontro } from '@/lib/auth';
import { nomeAccesso } from '@/lib/nome-accesso';

const RUOLI_VALIDI = ['segretaria', 'medico', 'admin'];

// Solo l'amministratore dello studio gestisce gli accessi dei colleghi.
async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin' && session.role !== 'tecnico') redirect('/');
  return session;
}

export async function createUser(formData: FormData) {
  const session = await requireAdmin();

  const email = nomeAccesso(formData.get('email')) ?? '';      // un'e-mail o un nome semplice (20.10.2026)
  const password = String(formData.get('password') ?? '');
  let ruolo = String(formData.get('ruolo') ?? 'segretaria');
  if (!RUOLI_VALIDI.includes(ruolo)) ruolo = 'segretaria';

  if (!email) redirect('/impostazioni/utenti?err=email');
  if (password.length < 8) redirect('/impostazioni/utenti?err=password');

  // L'email è unica su tutta la piattaforma.
  const [esiste] = await query<{ id: string }>('select id from users where email = $1', [email]);
  if (esiste) redirect('/impostazioni/utenti?err=esiste');

  await query(
    `insert into users (studio_id, email, password_hash, role)
     values ($1, $2, $3, $4::user_role)`,
    [session.studioId, email, await hashPassword(password), ruolo]
  );
  revalidatePath('/impostazioni/utenti');
  redirect('/impostazioni/utenti?ok=creato');
}

export async function resetPassword(formData: FormData) {
  const session = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!id) redirect('/impostazioni/utenti');
  if (password.length < 8) redirect('/impostazioni/utenti?err=password');

  await query(
    'update users set password_hash = $1 where id = $2 and studio_id = $3',
    [await hashPassword(password), id, session.studioId]
  );
  revalidatePath('/impostazioni/utenti');
  redirect('/impostazioni/utenti?ok=password');
}

// Disattiva/riattiva (mai eliminare: l'utente resta nell'audit della cronologia).
export async function toggleUser(formData: FormData) {
  const session = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  // Non ci si può disattivare da soli (si resterebbe chiusi fuori).
  if (id && id !== session.id) {
    await query(
      'update users set attivo = not attivo where id = $1 and studio_id = $2',
      [id, session.studioId]
    );
      dimenticaRiscontro(id);      // disattivato: fuori subito, non fra quindici secondi
  }
  revalidatePath('/impostazioni/utenti');
}
