'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { deleteFile } from '@/lib/storage';
import { trovaPaziente } from '@/lib/referti-allegati';
import { registraEvento, impronta } from '@/lib/referti-eventi';
import { confermaBozzaCore } from '@/lib/referti-conferma';

const MAX_SUGGERIMENTI = 30;

// Conferma o scarto di una bozza di referto: l'unico modo in cui una bozza
// cambia stato è una persona che preme un bottone (SPEC §2.5). Il payload
// originale della pipeline non si tocca mai: le correzioni finiscono in
// testo_finale / campi_confermati.

const MAX_TESTO = 200_000;

// «Inserisci nel referto» (2026-09-07, richiesta dell'utente mentre rivede):
// salva il testo com'è nell'ultimo passo della revisione guidata SENZA
// confermare la bozza. Le modifiche entrano nel referto (testo in cima,
// Word, PDF, punto di partenza di fusione e riorganizzazione) e la revisione
// può continuare più tardi. Solo sulle bozze aperte; evento registrato.
export async function salvaTesto(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');
  const testo = String(formData.get('testo') ?? '').slice(0, MAX_TESTO);
  if (!testo.trim()) redirect(`/referti/${id}?err=testo`);
  await query(
    `update referti_bozze set testo_finale = $3
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, testo]
  );
  await registraEvento(session.studioId, id, 'testo_salvato', session.id, {
    impronta_testo: impronta(testo), caratteri: testo.length,
  });
  revalidatePath(`/referti/${id}`);
  redirect(`/referti/${id}?ok=salvato`);
}

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
    if (k.startsWith('campo__') && typeof v === 'string') campi[k.slice('campo__'.length)] = v;
  });
  const num = (k: string) => { const v = Number(formData.get(k)); return Number.isFinite(v) ? v : null; };
  // Il cuore (gate, stato, audit, misura, suggerimenti, evento) sta in
  // src/lib/referti-conferma.ts, condiviso con l'interfaccia nuova.
  const esito = await confermaBozzaCore({
    studioId: session.studioId, userId: session.id, ruoloUtente: session.role, id, testo, campi,
    tele: {
      tempo_revisione_s: num('tempo_revisione_s'), flag_totali: num('flag_totali'), flag_accettati_senza_riascolto: num('flag_accettati_senza_riascolto'),
      flag_critici_totali: num('flag_critici_totali'), flag_critici_chiusi: num('flag_critici_chiusi'),
      revisione_iniziata_at: String(formData.get('revisione_iniziata_at') ?? ''), livello_verifica: String(formData.get('livello_verifica') ?? ''),
      presa_atto: formData.get('override_critici') === '1', origine: 'piattaforma',
    },
  });
  if (!esito.ok) redirect(esito.errore === 'critici' ? `/referti/${id}?err=critici` : esito.errore === 'testo' ? `/referti/${id}?err=testo` : `/referti/${id}`);
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
  await registraEvento(session.studioId, id, 'fusione_richiesta', session.id, { impronta_lettera: impronta(lettera), caratteri: lettera.length });
  revalidatePath(`/referti/${id}`);
  redirect(`/referti/${id}?ok=fusione_richiesta`);
}

export async function applicaFusione(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');
  const [b] = await query<{ testo: string | null; identita: string | null; conflitti: number }>(
    `select payload->'fusione'->>'testo_fuso' as testo,
            payload->'fusione'->'identita'->>'esito' as identita,
            coalesce((payload->'fusione'->>'conflitti_temporali')::int, 0) as conflitti
       from referti_bozze where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId]
  );
  if (!b?.testo) redirect(`/referti/${id}?err=fusione_assente`);
  // Guardia d'identità (Ricerca 18 §3): HARD STOP, nessun override.
  if (b.identita === 'diversa') redirect(`/referti/${id}?err=fusione_identita`);
  // Gate temporale (Ricerca 18 §9): il valore precedente ha vinto su una
  // misura dettata oggi → si applica solo con presa d'atto esplicita.
  const presaAttoTemporale = formData.get('override_temporale') === '1';
  if (Number(b.conflitti) > 0 && !presaAttoTemporale) redirect(`/referti/${id}?err=fusione_conflitti`);
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
  await registraEvento(session.studioId, id, 'fusione_applicata', session.id, {
    impronta_testo: impronta(b.testo), conflitti_temporali: Number(b.conflitti) || 0, presa_atto: presaAttoTemporale,
  });
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
  await registraEvento(session.studioId, id, 'ripristino', session.id);

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
    // Eventuale audio di riascolto dei file del dittafono (cache accanto all'originale).
    await deleteFile(`${a.storage_key}.m4a`);
    await deleteFile(`${a.storage_key}.wav`);
  }
  await registraEvento(session.studioId, id, 'eliminazione', session.id, { audio: audio.length });
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
  await registraEvento(session.studioId, id, 'scarto', session.id);

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

  const [b] = await query<{ testo_finale: string | null; payload: any; campi_confermati: Record<string, unknown> | null }>(
    `select testo_finale, payload, campi_confermati from referti_bozze
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
  const { opzioniRiorganizzazione } = await import('@/lib/referti-formato');
  const { formato, opzioni } = await opzioniRiorganizzazione(session.studioId, id, b.payload, b.campi_confermati, testo);
  const esito = await riorganizzaReferto(testo, undefined, formato, opzioni);
  if (!esito.ok) redirect(`/referti/${id}?err=struttura_${esito.motivo}`);

  await query(
    `update referti_bozze set testo_finale = $3
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId, esito.testo]
  );
  await registraEvento(session.studioId, id, 'riorganizzazione', session.id, { impronta_testo: impronta(esito.testo) });
  revalidatePath(`/referti/${id}`);
  redirect(`/referti/${id}?ok=strutturato`);
}


// Confronto cieco (2026-09-06): la preferenza del medico tra la bozza di
// produzione (a) e quella «ombra» (b), rimappata dall'ordine casuale mostrato.
export async function decidiConfronto(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const a = String(formData.get('bozza_a') ?? '');
  const b = String(formData.get('bozza_b') ?? '');
  if (!isUuid(a) || !isUuid(b)) redirect('/referti/confronto');
  const inverti = String(formData.get('inverti') ?? '0') === '1';
  const mostrata = String(formData.get('scelta') ?? '');
  let scelta: 'a' | 'b' | 'pari';
  if (mostrata === 'pari') scelta = 'pari';
  else if (mostrata === '1') scelta = inverti ? 'b' : 'a';
  else if (mostrata === '2') scelta = inverti ? 'a' : 'b';
  else redirect('/referti/confronto');
  const motivo = String(formData.get('motivo') ?? '').trim().slice(0, 200) || null;
  await query(
    `insert into referti_confronti (studio_id, bozza_a, bozza_b, scelta, motivo, deciso_da, deciso_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (bozza_a, bozza_b) do update
       set scelta = excluded.scelta, motivo = excluded.motivo, deciso_da = excluded.deciso_da, deciso_at = now()`,
    [session.studioId, a, b, scelta, motivo, session.id]
  );
  await registraEvento(session.studioId, a, 'confronto_deciso', session.id, { scelta, ombra: b });
  revalidatePath('/referti/confronto');
  redirect('/referti/confronto?ok=deciso');
}


// Richiamo proposto dal referto («controllo tra sei mesi»): imposta il
// follow-up sull'ultima referral del paziente nello studio. Solo su clic.
export async function creaRichiamoDaReferto(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/referti');
  const mesi = parseInt(String(formData.get('mesi') ?? ''), 10);
  if (!Number.isInteger(mesi) || mesi < 1 || mesi > 120) redirect(`/referti/${id}?err=richiamo`);
  const [b] = await query<{ nome: string | null }>(
    `select coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente') as nome
       from referti_bozze where id = $1 and studio_id = $2`,
    [id, session.studioId]
  );
  const patientId = await trovaPaziente(session.studioId, b?.nome ?? null);
  if (!patientId) redirect(`/referti/${id}?err=richiamo_paziente`);
  const [ref] = await query<{ id: string }>(
    `select id from referrals where studio_id = $1 and patient_id = $2
      order by created_at desc limit 1`,
    [session.studioId, patientId]
  );
  if (!ref) redirect(`/referti/${id}?err=richiamo_paziente`);
  await query(
    `update referrals
        set follow_up_months = $2,
            follow_up_due = (coalesce(
              (select max(changed_at) from referral_status_history
                where referral_id = $1 and to_status = 'vista'),
              appuntamento_at,
              now()
            ) + make_interval(months => $2))::date,
            follow_up_done_at = null
      where id = $1 and studio_id = $3`,
    [ref.id, mesi, session.studioId]
  );
  await query(
    `update referti_bozze
        set payload = jsonb_set(payload, '{richiamo}', $3::jsonb)
      where id = $1 and studio_id = $2`,
    [id, session.studioId, JSON.stringify({ mesi, referral_id: ref.id, creato_at: new Date().toISOString(), da: session.id })]
  );
  await registraEvento(session.studioId, id, 'richiamo_creato', session.id, { mesi, referral: ref.id });
  revalidatePath(`/referti/${id}`);
  revalidatePath('/richiami');
  redirect(`/referti/${id}?ok=richiamo`);
}
