'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';

// Azioni dei post-it di squadra sulla pagina Oggi: aggiungi e strappa.
// Recinto per studio come ovunque; il testo resta corto (sono foglietti).

export async function aggiungiNota(formData: FormData) {
  const session = await getSession();
  if (!session?.studioId) redirect('/login');
  const testo = String(formData.get('testo') ?? '').trim().slice(0, 200);
  if (testo) {
    await query(
      'insert into note_squadra (studio_id, testo, autore) values ($1, $2, $3)',
      [session.studioId, testo, session.email.split('@')[0]]
    );
  }
  redirect('/');
}

export async function eliminaNota(formData: FormData) {
  const session = await getSession();
  if (!session?.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (isUuid(id)) {
    await query('delete from note_squadra where id = $1 and studio_id = $2', [id, session.studioId]);
  }
  redirect('/');
}
