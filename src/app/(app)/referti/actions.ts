'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';

// Conferma o scarto di una bozza di referto: l'unico modo in cui una bozza
// cambia stato è una persona che preme un bottone (SPEC §2.5). Il payload
// originale della pipeline non si tocca mai: le correzioni finiscono in
// testo_finale / campi_confermati.

const MAX_TESTO = 200_000;

export async function confermaBozza(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');

  const testo = String(formData.get('testo') ?? '').slice(0, MAX_TESTO);
  if (!testo.trim()) redirect(`/referti/${id}?err=testo`);

  // I campi estratti arrivano come campo__<chiave>: si riconfermano tutti,
  // eventualmente corretti a mano. Solo i campi presenti nel form.
  const campi: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (k.startsWith('campo__') && typeof v === 'string') {
      campi[k.slice('campo__'.length).slice(0, 80)] = v.trim().slice(0, 2000);
    }
  });

  await query(
    `update referti_bozze
        set stato = 'confermata', testo_finale = $3, campi_confermati = $4,
            reviewed_by = $5, reviewed_at = now()
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, testo, JSON.stringify(campi), session.id]
  );

  revalidatePath('/referti');
  redirect(`/referti/${id}?ok=confermata`);
}

export async function scartaBozza(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');

  await query(
    `update referti_bozze
        set stato = 'scartata', reviewed_by = $3, reviewed_at = now()
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, session.id]
  );

  revalidatePath('/referti');
  redirect('/referti');
}
