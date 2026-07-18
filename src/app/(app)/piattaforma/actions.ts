'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Solo il titolare della piattaforma (PLATFORM_OWNER_EMAIL) può agire da qui.
async function richiedeTitolare() {
  const session = await getSession();
  const owner = (process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
  if (!session || !owner || session.email.toLowerCase() !== owner) redirect('/');
  return session;
}

// Accende/spegne uno studio: spento, i suoi utenti non possono più accedere
// e non compare tra gli studi della piattaforma in «Affida paziente».
export async function toggleStudio(formData: FormData) {
  const session = await richiedeTitolare();
  const id = String(formData.get('studio_id') ?? '');
  // Mai spegnere il proprio studio: ci si chiuderebbe fuori.
  if (id && id !== session.studioId) {
    await query('update studios set attivo = not attivo where id = $1', [id]);
  }
  revalidatePath('/piattaforma');
  revalidatePath(`/piattaforma/${id}`);
}

const PIANI = ['pilota', 'prova', 'attivo', 'sospeso'];

// Cambia piano/scadenza prova di uno studio (gestione manuale finché non c'è
// Stripe: «attivo» = paga via fattura, la proroga sposta trial_until).
export async function aggiornaPiano(formData: FormData) {
  await richiedeTitolare();
  const id = String(formData.get('studio_id') ?? '');
  const piano = String(formData.get('abbonamento') ?? '');
  const trialRaw = String(formData.get('trial_until') ?? '').trim();
  if (!id || !PIANI.includes(piano)) redirect('/piattaforma');

  // La data di scadenza ha senso solo per la prova; formato yyyy-mm-dd dal <input type=date>.
  const trial = piano === 'prova' && /^\d{4}-\d{2}-\d{2}$/.test(trialRaw) ? trialRaw : null;
  await query(
    `update studios set abbonamento = $2,
            trial_until = case when $2 = 'prova' then coalesce($3::date, trial_until) else trial_until end
      where id = $1`,
    [id, piano, trial]
  );
  revalidatePath('/piattaforma');
  revalidatePath(`/piattaforma/${id}`);
}
