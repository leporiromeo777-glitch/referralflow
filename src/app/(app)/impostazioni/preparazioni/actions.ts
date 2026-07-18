'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Libreria delle preparazioni alla visita, gestita dall'amministratore dello studio.

async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');
  return session;
}

export async function savePreparazione(formData: FormData) {
  const session = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);
  const testo = String(formData.get('testo') ?? '').trim().slice(0, 1000);
  if (!nome || !testo) redirect('/impostazioni/preparazioni?err=campi');

  if (id) {
    await query(
      'update preparazioni set nome = $1, testo = $2 where id = $3 and studio_id = $4',
      [nome, testo, id, session.studioId]
    );
  } else {
    await query(
      'insert into preparazioni (studio_id, nome, testo) values ($1, $2, $3)',
      [session.studioId, nome, testo]
    );
  }
  revalidatePath('/impostazioni/preparazioni');
}

export async function togglePreparazione(formData: FormData) {
  const session = await requireAdmin();

  const id = String(formData.get('id') ?? '');
  if (id) {
    await query(
      'update preparazioni set attiva = not attiva where id = $1 and studio_id = $2',
      [id, session.studioId]
    );
  }
  revalidatePath('/impostazioni/preparazioni');
}
