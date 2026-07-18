'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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
