'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import { query } from '@/lib/db';
import { getSession, createSession } from '@/lib/auth';

// L'admin aggiorna i dati del proprio studio (nome, specialità, telefono,
// email notifiche). Lo slug non si tocca: è nei link già condivisi.
export async function updateStudio(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');

  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);
  const specialita = String(formData.get('specialita') ?? '').trim().slice(0, 200) || null;
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  const notifyEmail = String(formData.get('notify_email') ?? '').trim().toLowerCase().slice(0, 160) || null;
  if (!nome) redirect('/impostazioni/studio?err=nome');
  if (notifyEmail && !notifyEmail.includes('@')) redirect('/impostazioni/studio?err=email');

  await query(
    `update studios set nome = $2, specialita = $3, telefono = $4, notify_email = $5
      where id = $1`,
    [session.studioId, nome, specialita, telefono, notifyEmail]
  );

  // Il nome dello studio vive anche nella sessione (topbar): riallineala.
  if (nome !== session.studioNome) {
    await createSession({ ...session, studioNome: nome });
  }

  revalidatePath('/impostazioni/studio');
  redirect('/impostazioni/studio?ok=1');
}

// ─── Token per l'endpoint bozze referto (pipeline di trascrizione locale) ───
// Il token è una credenziale: in tabella sta solo l'hash sha256, il chiaro si
// mostra UNA volta sola dopo la generazione (cookie flash di 2 minuti, mai in
// URL né nei log — stessa regola dell'URL del feed iCal). Rigenerare il token
// invalida il precedente sul Mac mini.
const TOKEN_FLASH_COOKIE = 'rf_referti_token';

export async function generaRefertiToken() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');

  const token = 'rfb_' + randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  await query(
    `update studios set referti_token_hash = $2, referti_token_set_at = now()
      where id = $1`,
    [session.studioId, hash]
  );

  cookies().set(TOKEN_FLASH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/impostazioni/studio',
    maxAge: 120,
  });

  revalidatePath('/impostazioni/studio');
  redirect('/impostazioni/studio');
}

export async function revocaRefertiToken() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');

  await query(
    `update studios set referti_token_hash = null, referti_token_set_at = null
      where id = $1`,
    [session.studioId]
  );

  revalidatePath('/impostazioni/studio');
  redirect('/impostazioni/studio');
}
