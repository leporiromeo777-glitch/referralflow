'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Rigenera il token dei link pubblici di un medico inviante.
// I vecchi link smettono di funzionare subito: vanno ricondivisi.
export async function rotateToken(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');

  const id = String(formData.get('id') || '');
  if (id) {
    await query(
      `update referring_doctors
          set token = encode(gen_random_bytes(18), 'hex'),
              token_expires_at = now() + interval '180 days'
        where id = $1 and studio_id = $2`,
      [id, session.studioId]
    );
    revalidatePath(`/medici/${id}`);
  }
  revalidatePath('/medici');
}
