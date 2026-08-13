'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { estraiSostituzioni } from '@/lib/referti-learn';

const MAX_SUGGERIMENTI = 30;

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

  const [row] = await query<{ ai_text: string | null }>(
    `update referti_bozze
        set stato = 'confermata', testo_finale = $3, campi_confermati = $4,
            reviewed_by = $5, reviewed_at = now()
      where id = $1 and studio_id = $2 and stato = 'bozza'
      returning payload ->> 'testo_corretto' as ai_text`,
    [id, session.studioId, testo, JSON.stringify(campi), session.id]
  );

  // Impara dalla correzione: se la persona ha cambiato delle parole, le
  // sostituzioni ricorrenti diventano suggerimenti per il dizionario della
  // trascrizione. Non deve mai far fallire la conferma, e mai loggare testo.
  if (row?.ai_text && row.ai_text !== testo) {
    try {
      const sost = estraiSostituzioni(row.ai_text, testo).slice(0, MAX_SUGGERIMENTI);
      for (const s of sost) {
        await query(
          `insert into referti_suggerimenti (studio_id, da, a)
           values ($1, $2, $3)
           on conflict (studio_id, da, a) do update
             set conteggio = referti_suggerimenti.conteggio + 1,
                 updated_at = now(), ignorato = false`,
          [session.studioId, s.da, s.a]
        );
      }
    } catch (e: any) {
      console.error('Estrazione suggerimenti referto fallita:', e?.message || e);
    }
  }

  revalidatePath('/referti');
  redirect(`/referti/${id}?ok=confermata`);
}

// Riporta tra le «da rivedere» una bozza cestinata per sbaglio («Scarta» si
// confonde facilmente con «Scarica»: dev'esserci sempre la via del ritorno).
export async function ripristinaBozza(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');

  await query(
    `update referti_bozze
        set stato = 'bozza', reviewed_by = null, reviewed_at = null
      where id = $1 and studio_id = $2 and stato = 'scartata'`,
    [id, session.studioId]
  );

  revalidatePath('/referti');
  redirect(`/referti/${id}`);
}

// Nasconde un suggerimento del dizionario (non utile o già gestito a voce).
export async function ignoraSuggerimento(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (isUuid(id)) {
    await query(
      'update referti_suggerimenti set ignorato = true where id = $1 and studio_id = $2',
      [id, session.studioId]
    );
  }
  revalidatePath('/referti');
  redirect('/referti');
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
