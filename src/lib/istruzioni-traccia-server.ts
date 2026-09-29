import 'server-only';
import { query } from './db';
import { generaOllamaEsito } from './ollama';
import { catenaOccupata } from './esporta-grezze';
import { registraEvento } from './referti-eventi';
import { applica, inFrasi, leggiPiano, numerate, PROMPT_ISTRUZIONI } from './istruzioni-traccia';

// Seconda traccia con istruzioni, lato piattaforma (29.9.2026). All'arrivo
// la traccia resta da parte (`payload.istruzioni_traccia`, stato
// «da_interpretare») invece di finire in fondo al referto; a catena FERMA il
// modello locale ne fa un piano di modifiche e il codice lo applica
// (istruzioni-traccia.ts). Si vede e si annulla nella revisione. Nei log solo
// id abbreviati e numeri; il testo non esce mai dal Mac.

const MODELLO = process.env.ISTRUZIONI_LLM || process.env.REFERTI_LLM || 'hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS';

export type StatoIstruzioni = {
  stato: 'da_interpretare' | 'in_corso' | 'fatta' | 'nessuna' | 'fallita' | 'annullata' | 'in_fondo';
  testo: string;
  note: string[];
  arrivata_il: string;
  esiti?: { ok: boolean; descrizione: string; motivo?: string }[];
  non_capite?: string[];
  prima?: string | null;
  fatta_il?: string;
};

async function scaricaModello(): Promise<void> {
  try {
    await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODELLO, keep_alive: 0 }), signal: AbortSignal.timeout(30_000),
    });
  } catch { /* best effort */ }
}

async function salva(id: string, st: StatoIstruzioni, testoFinale?: string | null): Promise<void> {
  if (testoFinale !== undefined) {
    await query(`update referti_bozze set testo_finale = $2, payload = jsonb_set(payload, '{istruzioni_traccia}', $3::jsonb) where id = $1 and stato = 'bozza'`, [id, testoFinale, JSON.stringify(st)]);
  } else {
    await query(`update referti_bozze set payload = jsonb_set(payload, '{istruzioni_traccia}', $2::jsonb) where id = $1 and stato = 'bozza'`, [id, JSON.stringify(st)]);
  }
}

export async function interpreta(id: string): Promise<StatoIstruzioni['stato'] | null> {
  const [b] = await query<{ studio_id: string; stato: string; testo: string; ist: StatoIstruzioni | null }>(
    `select studio_id, stato, coalesce(testo_finale, payload->>'testo_corretto', '') as testo, payload->'istruzioni_traccia' as ist from referti_bozze where id = $1`, [id]);
  if (!b?.ist || b.stato !== 'bozza' || b.ist.stato !== 'da_interpretare') return null;
  const ist = b.ist;
  await salva(id, { ...ist, stato: 'in_corso' });
  const dettato = [ist.testo, ...(ist.note ?? [])].filter(Boolean).join('\n');
  const pezzi = inFrasi(b.testo);
  const prompt = PROMPT_ISTRUZIONI.replace('{referto}', numerate(pezzi)).replace('{istruzioni}', dettato);
  const t0 = Date.now();
  const r = await generaOllamaEsito(prompt, { json: true, modello: MODELLO, aPezzi: true, timeoutMs: 15 * 60_000 });
  if (!r.ok) {
    await salva(id, { ...ist, stato: 'fallita', fatta_il: new Date().toISOString() });
    console.error(`[istruzioni] ${id.slice(0, 8)}: modello non riuscito (${r.causa})`);
    return 'fallita';
  }
  const piano = leggiPiano(r.testo.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
  const esito = applica(b.testo, piano.modifiche, dettato);
  const fatte = esito.esiti.filter((e) => e.ok).length;
  const st: StatoIstruzioni = {
    ...ist, stato: fatte ? 'fatta' : 'nessuna', fatta_il: new Date().toISOString(),
    esiti: esito.esiti.map((e) => ({ ok: e.ok, descrizione: e.descrizione, motivo: e.motivo })), non_capite: piano.non_capite,
    prima: fatte ? b.testo : null,
  };
  await salva(id, st, fatte ? esito.testo : undefined);
  await registraEvento(b.studio_id, id, 'istruzioni_traccia', null, { modifiche: piano.modifiche.length, applicate: fatte, non_capite: piano.non_capite.length, secondi: Math.round((Date.now() - t0) / 1000) });
  console.log(`[istruzioni] ${id.slice(0, 8)}: ${fatte} di ${piano.modifiche.length} modifiche applicate, ${piano.non_capite.length} non capite, ${Math.round((Date.now() - t0) / 1000)} s`);
  return st.stato;
}

// Un giro: solo a catena ferma (il modello grande sulla GPU insieme a whisper
// fa cadere la catena), una bozza alla volta, poi il modello si scarica.
let inCorso = false;
export async function giroIstruzioni(): Promise<{ esito: 'occupata' | 'in_corso' | 'fatto'; fatte: number }> {
  if (inCorso) return { esito: 'in_corso', fatte: 0 };
  if (await catenaOccupata()) return { esito: 'occupata', fatte: 0 };
  inCorso = true;
  let fatte = 0;
  try {
    // Chi era rimasto «in_corso» per un riavvio torna in coda.
    await query(`update referti_bozze set payload = jsonb_set(payload, '{istruzioni_traccia,stato}', '"da_interpretare"') where payload->'istruzioni_traccia'->>'stato' = 'in_corso' and stato = 'bozza'`);
    for (;;) {
      if (await catenaOccupata()) break;
      const [x] = await query<{ id: string }>(`select id from referti_bozze where stato = 'bozza' and payload->'istruzioni_traccia'->>'stato' = 'da_interpretare' order by created_at limit 1`);
      if (!x) break;
      await interpreta(x.id);
      fatte++;
    }
  } finally {
    inCorso = false;
    if (fatte) await scaricaModello();
  }
  return { esito: 'fatto', fatte };
}

// Azioni della revisione.
export async function azioneIstruzioni(studioId: string, id: string, azione: string): Promise<{ ok: true } | { errore: string }> {
  const [b] = await query<{ stato: string; testo: string; ist: StatoIstruzioni | null }>(
    `select stato, coalesce(testo_finale, payload->>'testo_corretto', '') as testo, payload->'istruzioni_traccia' as ist from referti_bozze where id = $1 and studio_id = $2`, [id, studioId]);
  if (!b?.ist || b.stato !== 'bozza') return { errore: 'Niente da fare.' };
  const ist = b.ist;
  if (azione === 'annulla') {
    if (ist.stato !== 'fatta' || ist.prima == null) return { errore: 'Niente da annullare.' };
    await salva(id, { ...ist, stato: 'annullata' }, ist.prima);
    return { ok: true };
  }
  if (azione === 'in_fondo') {
    // Non erano istruzioni: il testo della traccia va in fondo, come prima.
    const base = ist.stato === 'fatta' && ist.prima != null ? ist.prima : b.testo;
    const aggiunta = [ist.testo, ...(ist.note ?? [])].filter(Boolean).join(' ');
    await salva(id, { ...ist, stato: 'in_fondo' }, `${base.trim()}\n\n${aggiunta}`.trim());
    return { ok: true };
  }
  if (azione === 'rifai') {
    const base = ist.stato === 'fatta' && ist.prima != null ? ist.prima : undefined;
    await salva(id, { ...ist, stato: 'da_interpretare', esiti: [], non_capite: [], prima: null }, base);
    void giroIstruzioni().catch(() => null);
    return { ok: true };
  }
  return { errore: 'azione' };
}
