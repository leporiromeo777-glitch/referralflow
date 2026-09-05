'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { estraiSostituzioni } from '@/lib/referti-learn';
import { deleteFile } from '@/lib/storage';
import { misuraRevisione } from '@/lib/referti-misura';

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

  // Misura della revisione: quanto la persona ha corretto la catena.
  // Best-effort, mai bloccante, solo numeri.
  if (row?.ai_text) {
    try {
      const m = misuraRevisione(row.ai_text, testo);
      await query(
        `update referti_bozze
            set payload = jsonb_set(payload, '{revisione}', $3::jsonb)
          where id = $1 and studio_id = $2`,
        [id, session.studioId, JSON.stringify(m)]
      );
    } catch (e: any) {
      console.error('Misura revisione fallita:', e?.message || e);
    }
  }

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
// Lettera incrementale: la persona incolla (o accetta) la lettera precedente
// del paziente e chiede alla pipeline di fonderla col dettato. La richiesta
// vive nel payload (fusione.stato in_attesa → in_lavorazione → fatta/fallita);
// il risultato è una proposta, applicata solo con «Applica».
export async function richiediFusione(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');
  const lettera = String(formData.get('lettera') ?? '').trim().slice(0, MAX_TESTO);
  if (lettera.length < 200) redirect(`/referti/${id}?err=lettera_corta`);

  const richiesta = {
    stato: 'in_attesa',
    lettera_precedente: lettera,
    richiesta_at: new Date().toISOString(),
    richiesta_da: session.id,
  };
  // Solo sulle bozze aperte: un referto confermato non cambia più testo.
  await query(
    `update referti_bozze
        set payload = jsonb_set(payload, '{fusione}', $3::jsonb)
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, JSON.stringify(richiesta)]
  );
  revalidatePath(`/referti/${id}`);
  redirect(`/referti/${id}?ok=fusione_richiesta`);
}

export async function applicaFusione(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');
  const [b] = await query<{ testo: string | null }>(
    `select payload->'fusione'->>'testo_fuso' as testo
       from referti_bozze where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId]
  );
  if (!b?.testo) redirect(`/referti/${id}?err=fusione_assente`);
  // La versione attuale resta nel payload: il ripristino è sempre possibile.
  // Il «testo prima della fusione» si salva UNA volta sola (è il dettato di
  // oggi): applicando due fusioni di seguito non va sovrascritto con la
  // lettera fusa. Solo su bozze aperte.
  await query(
    `update referti_bozze
        set payload = jsonb_set(payload, '{testo_prima_della_fusione}',
              coalesce(payload->'testo_prima_della_fusione', to_jsonb(coalesce(testo_finale, payload->>'testo_corretto')))),
            testo_finale = $3
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, b.testo]
  );
  revalidatePath(`/referti/${id}`);
  redirect(`/referti/${id}?ok=fusione_applicata`);
}

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

// Eliminazione DEFINITIVA di una bozza scartata: sparisce la bozza, l'audio
// collegato e il file dallo storage. Irreversibile, e per questo possibile
// solo sulle bozze già scartate (mai su bozze aperte o confermate).
export async function eliminaBozza(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');

  const [bozza] = await query<{ id: string }>(
    `select id from referti_bozze
      where id = $1 and studio_id = $2 and stato = 'scartata'`,
    [id, session.studioId]
  );
  if (!bozza) redirect('/referti');

  // Prima i file audio nello storage, poi le righe (best-effort sui file:
  // un file già assente non blocca l'eliminazione).
  const audio = await query<{ id: string; storage_key: string }>(
    'select id, storage_key from referti_audio where bozza_id = $1 and studio_id = $2',
    [id, session.studioId]
  );
  for (const a of audio) {
    await deleteFile(a.storage_key);
  }
  await query('delete from referti_audio where bozza_id = $1 and studio_id = $2', [id, session.studioId]);
  await query(
    "delete from referti_bozze where id = $1 and studio_id = $2 and stato = 'scartata'",
    [id, session.studioId]
  );

  revalidatePath('/referti');
  redirect('/referti?ok=eliminata');
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

// Riorganizzazione AI nel formato standard dello studio (proposta, mai
// conferma): il testo riorganizzato finisce in testo_finale della bozza —
// la casella «Testo da confermare» lo mostra e la persona lo rivede come
// sempre. Il payload della pipeline resta intatto; solo su stato 'bozza'.
export async function riorganizzaBozza(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');

  const [b] = await query<{ testo_finale: string | null; payload: any }>(
    `select testo_finale, payload from referti_bozze
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId]
  );
  if (!b) redirect(`/referti/${id}`);

  // Parte dal testo COME LO VEDE l'utente nella casella (correzioni non
  // ancora confermate comprese); in mancanza, da quanto salvato.
  const testo = (
    String(formData.get('testo') ?? '').trim() ||
    ((b.testo_finale ?? b.payload?.testo_corretto ?? '') as string).trim()
  ).slice(0, MAX_TESTO);
  if (!testo) redirect(`/referti/${id}?err=testo`);

  const { riorganizzaReferto } = await import('@/lib/referto-struttura');
  const esito = await riorganizzaReferto(testo);
  if (!esito.ok) redirect(`/referti/${id}?err=struttura_${esito.motivo}`);

  await query(
    `update referti_bozze set testo_finale = $3
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, esito.testo]
  );
  revalidatePath(`/referti/${id}`);
  redirect(`/referti/${id}?ok=strutturato`);
}
