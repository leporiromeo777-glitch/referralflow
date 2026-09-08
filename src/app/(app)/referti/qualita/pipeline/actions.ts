'use server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

// Nota su un rilascio (§54): «nuovo whisper», «prompt correzione v8»…
export async function annotaRilascio(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId || session.role !== 'admin') redirect('/login');
  const id = Number(formData.get('id'));
  const nota = String(formData.get('nota') ?? '').trim().slice(0, 200);
  if (Number.isInteger(id) && id > 0) {
    await query('update audit.deployments set note = $3 where id = $1 and (studio_id = $2 or studio_id is null)', [id, session.studioId, nota || null]);
  }
  redirect('/referti/qualita/pipeline');
}
