'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { putFile } from '@/lib/storage';
import { isAllowedImage, MAX_AVATAR_SIZE } from '@/lib/upload';

// Aggiorna il profilo dell'inviante (annuario della piattaforma).
export async function aggiornaProfilo(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'inviante') redirect('/');

  const studio = String(formData.get('studio') ?? '').trim().slice(0, 120) || null;
  const specialita = String(formData.get('specialita') ?? '').trim().slice(0, 200) || null;
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40) || null;
  const visibile = formData.get('visibile') === 'on';

  // Foto profilo facoltativa: se caricata e valida, sostituisce quella attuale.
  const foto = formData.get('foto') as File | null;
  let avatarKey: string | null = null;
  if (foto && foto.size > 0 && foto.size <= MAX_AVATAR_SIZE && isAllowedImage(foto)) {
    const ext = foto.name.includes('.') ? foto.name.slice(foto.name.lastIndexOf('.')) : '';
    const buffer = Buffer.from(await foto.arrayBuffer());
    avatarKey = await putFile(buffer, foto.type || 'image/jpeg', ext);
  }

  if (avatarKey) {
    await query(
      `update inviante_profiles
          set studio = $2, specialita = $3, telefono = $4, visibile = $5, avatar_key = $6
        where user_id = $1`,
      [session.id, studio, specialita, telefono, visibile, avatarKey]
    );
  } else {
    await query(
      `update inviante_profiles
          set studio = $2, specialita = $3, telefono = $4, visibile = $5
        where user_id = $1`,
      [session.id, studio, specialita, telefono, visibile]
    );
  }
  revalidatePath('/invii');
}
