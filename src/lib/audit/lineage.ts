import 'server-only';
import { createHash } from 'crypto';
import { query } from '../db';
import { registraPrompt } from './prompt';

// Lineage del referto (§3-§10, §43-§45): dal payload della catena nascono
// una corsa, le sue tappe e gli artefatti (immutabili, con impronta e
// genitori). Tutto è idempotente su (studio, file_id, attempt).

export function sha256(testo: string): string {
  return createHash('sha256').update(testo ?? '').digest('hex');
}
const nParole = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;

type Tappa = { tappa: string; attore: string; secondi: number; [k: string]: unknown };

// Tappa della catena → tipo, produttore, modello. La catena dice in
// `versione_catena` quali modelli erano in servizio e nel `manifesto` per
// quali tappe ha usato il modello esterno («trasporti»).
function descriviTappa(t: Tappa, vc: Record<string, string>, trasporti: Record<string, string>) {
  const nome = String(t.tappa);
  const attore = String(t.attore ?? 'codice');
  const ai = attore !== 'codice';
  let modello: string | null = null; let provider: string | null = null;
  if (nome === 'trascrizione_a') { modello = vc.asr_a ?? 'whisper'; provider = 'local'; }
  else if (nome === 'trascrizione_b') { modello = attore === 'voxtral' ? (vc.asr_b ?? 'voxtral') : (vc.asr_a ?? 'whisper'); provider = 'local'; }
  else if (ai) {
    const tr = trasporti[nome] ?? (t.trasporto as string | undefined) ?? '';
    if (tr === 'esterno' || tr === 'cloud') { modello = vc.esterno ?? 'esterno'; provider = 'cloud'; }
    else { modello = nome === 'anonimizzazione' ? (vc.anonimizzatore ?? vc.llm_locale ?? 'ollama') : (vc.llm_locale ?? 'ollama'); provider = 'local'; }
  }
  const tipo: Record<string, string> = {
    dittafono: 'audio_decoding', integrita_audio: 'audio_integrity', preprocessing: 'audio_preprocessing',
    trascrizione_a: 'speech_to_text', trascrizione_b: 'speech_to_text', deloop: 'transcript_cleanup',
    dizionario: 'dictionary', confronto: 'engine_comparison', arbitro: 'engine_arbitration',
    correzione: 'linguistic_correction', verificatore: 'clinical_validation', avvocato: 'clinical_validation',
    ispezione: 'clinical_validation', estrazione: 'field_extraction', bella_copia: 'linguistic_correction',
    stile: 'style_memory', doppioni: 'duplicate_removal', struttura: 'report_structuring', ricucitura: 'transcript_cleanup',
    promozione_testimone: 'engine_promotion',
  };
  return { nome, tipo: tipo[nome] ?? nome, producer: (ai ? 'AI' : 'SYSTEM') as 'AI' | 'SYSTEM', modello, provider };
}

// Quale versione intermedia esce da quale tappa (il testo pieno sta in
// `versioni`; grezzo_a è `testo_grezzo`, il finale è `testo_corretto`).
const USCITE: Record<string, string[]> = {
  trascrizione_a: ['grezzo_a', 'grezzo_a_recuperato'], trascrizione_b: ['grezzo_b'],
  dizionario: ['dopo_dizionario'], arbitro: ['dopo_arbitro'], confronto: ['dopo_arbitro'],
  correzione: ['dopo_correzione'], bella_copia: ['dopo_bella_copia'], struttura: ['testo_strutturato'],
};
const GENITORI: Record<string, string[]> = {
  grezzo_a: ['audio'], grezzo_a_recuperato: ['audio'], grezzo_b: ['audio'],
  dopo_dizionario: ['grezzo_a_recuperato', 'grezzo_a'], dopo_arbitro: ['dopo_dizionario', 'grezzo_b'],
  dopo_correzione: ['dopo_arbitro', 'dopo_dizionario'], dopo_bella_copia: ['dopo_correzione'],
  catena_finale: ['dopo_bella_copia', 'dopo_correzione', 'dopo_arbitro', 'dopo_dizionario', 'grezzo_a'],
  testo_strutturato: ['catena_finale'],
};

export async function registraCorsa(
  studioId: string, bozzaId: string, payload: any,
  opz: { audioStorage?: string | null; completatoIl?: string | null } = {}
): Promise<number | null> {
  const fileId = String(payload?.file_id ?? '');
  if (!fileId) return null;
  const vc: Record<string, string> = payload?.versione_catena && typeof payload.versione_catena === 'object' ? payload.versione_catena : {};
  const storia: Tappa[] = Array.isArray(payload?.storia) ? payload.storia.filter((t: any) => t && typeof t.tappa === 'string') : [];
  const versioni: Record<string, string> = payload?.versioni && typeof payload.versioni === 'object' ? payload.versioni : {};
  const trasporti: Record<string, string> = payload?.manifesto?.trasporti ?? {};
  const [{ n }] = await query<{ n: number }>(
    'select count(*)::int as n from audit.pipeline_runs where studio_id = $1 and file_id = $2', [studioId, fileId]);
  const attempt = n + 1;
  // Una corsa già registrata per questa bozza non si duplica (retry del POST).
  const [gia] = await query<{ id: number }>(
    'select id from audit.pipeline_runs where bozza_id = $1 and status = $2 limit 1', [bozzaId, 'SUCCESS']);
  if (gia) return gia.id;
  const fine = opz.completatoIl ?? (typeof payload?.timestamp === 'string' ? payload.timestamp : null);
  const totaleS = storia.length ? Math.max(...storia.map((t) => Number(t.secondi) || 0)) : 0;
  const fineMs = fine ? new Date(fine).getTime() : Date.now();
  const inizioIso = new Date(fineMs - totaleS * 1000).toISOString();
  const config = {
    modelli: { asr_a: vc.asr_a, asr_b: vc.asr_b, llm_locale: vc.llm_locale, esterno: vc.esterno, anonimizzatore: vc.anonimizzatore },
    prompt: vc.prompt, dizionario: vc.dizionario, vocabolario: vc.vocabolario, guardie: vc.guardie, profilo: vc.profilo,
    manifesto: payload?.manifesto ?? null, medico: payload?.medico?.id ?? null, ombra: payload?.ombra === true,
  };
  const [run] = await query<{ id: number }>(
    `insert into audit.pipeline_runs (studio_id, bozza_id, file_id, attempt, pipeline_version, status, started_at, completed_at, duration_ms, config)
       values ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7, $8, $9)
       on conflict (studio_id, file_id, attempt) do nothing
       returning id`,
    [studioId, bozzaId, fileId, attempt, vc.pipeline ?? null, inizioIso, new Date(fineMs).toISOString(), Math.round(totaleS * 1000), JSON.stringify(config)]
  );
  if (!run) return null;
  const runId = run.id;
  await registraRilascio(studioId, 'pipeline', vc.pipeline, inizioIso);
  const promptId = vc.prompt ? (await registraPrompt('catena', null, vc.prompt.padEnd(64, '0'))).id : null;

  // Artefatti: prima l'audio (impronta = file_id, che È l'hash del contenuto).
  const ids: Record<string, number> = {};
  let versionNo = 0;
  const nuovo = async (label: string, kind: 'audio' | 'text' | 'json', producer: 'AI' | 'SYSTEM', testo: string | null, ref: string | null, hash: string, creato: string) => {
    versionNo += 1;
    const [a] = await query<{ id: number }>(
      `insert into audit.artifacts (studio_id, run_id, bozza_id, version_no, kind, label, producer_type, content_text, storage_ref, content_hash, bytes, words, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [studioId, runId, bozzaId, versionNo, kind, label, producer, testo, ref, hash, testo ? Buffer.byteLength(testo) : null, testo ? nParole(testo) : null, creato]
    );
    ids[label] = a.id;
    for (const g of GENITORI[label] ?? []) {
      if (ids[g]) { await query('insert into audit.artifact_parents (artifact_id, parent_artifact_id) values ($1, $2) on conflict do nothing', [a.id, ids[g]]); break; }
    }
    return a.id;
  };
  await nuovo('audio', 'audio', 'SYSTEM', null, opz.audioStorage ?? null, fileId, inizioIso);
  if (typeof payload?.testo_grezzo === 'string') versioni.grezzo_a = payload.testo_grezzo;

  // Tappe in ordine, con l'artefatto d'uscita dove la catena l'ha conservato.
  let precedenteS = 0; let ordine = 0; let ultimoTesto = ids.audio;
  for (const t of storia) {
    ordine += 1;
    const d = descriviTappa(t, vc, trasporti);
    const s = Number(t.secondi) || 0;
    const startIso = new Date(fineMs - (totaleS - precedenteS) * 1000).toISOString();
    const endIso = new Date(fineMs - (totaleS - s) * 1000).toISOString();
    let output: number | null = null;
    for (const label of USCITE[d.nome] ?? []) {
      const testo = versioni[label];
      if (typeof testo === 'string' && testo.trim() && !ids[label]) {
        output = await nuovo(label, 'text', d.producer, testo, null, sha256(testo), endIso);
      }
    }
    const meta = Object.fromEntries(Object.entries(t).filter(([k, v]) => !['tappa', 'attore', 'secondi'].includes(k) && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')));
    await query(
      `insert into audit.pipeline_steps (run_id, bozza_id, step_order, step_type, step_name, producer_type, model_provider, model_name, prompt_version_id, status, started_at, completed_at, duration_ms, input_artifact_id, output_artifact_id, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUCCESS', $10, $11, $12, $13, $14, $15)`,
      [runId, bozzaId, ordine, d.tipo, d.nome, d.producer, d.provider, d.modello, d.producer === 'AI' ? promptId : null,
       startIso, endIso, Math.max(0, Math.round((s - precedenteS) * 1000)), ultimoTesto, output, JSON.stringify(meta)]
    );
    if (output) ultimoTesto = output;
    precedenteS = Math.max(precedenteS, s);
  }
  // L'output finale della catena: è l'ultimo artefatto AI, base del diff umano.
  if (typeof payload?.testo_corretto === 'string' && payload.testo_corretto.trim()) {
    const fin = await nuovo('catena_finale', 'text', 'AI', payload.testo_corretto, null, sha256(payload.testo_corretto), new Date(fineMs).toISOString());
    ordine += 1;
    await query(
      `insert into audit.pipeline_steps (run_id, bozza_id, step_order, step_type, step_name, producer_type, model_provider, model_name, prompt_version_id, status, started_at, completed_at, duration_ms, input_artifact_id, output_artifact_id, metadata)
         values ($1, $2, $3, 'final_ai_output', 'consegna', 'SYSTEM', null, null, null, 'SUCCESS', $4, $4, 0, $5, $6, '{}')`,
      [runId, bozzaId, ordine, new Date(fineMs).toISOString(), ultimoTesto, fin]
    );
    if (typeof payload?.testo_strutturato === 'string' && payload.testo_strutturato.trim()) {
      await nuovo('testo_strutturato', 'text', 'AI', payload.testo_strutturato, null, sha256(payload.testo_strutturato), new Date(fineMs).toISOString());
    }
  }
  return runId;
}

// Corsa FALLITA (§43): resta visibile con fase, tipo d'errore, tentativo.
export async function registraCorsaFallita(studioId: string, corpo: any): Promise<void> {
  const fileId = String(corpo?.file_id ?? '');
  if (!fileId) return;
  const [{ n }] = await query<{ n: number }>(
    'select count(*)::int as n from audit.pipeline_runs where studio_id = $1 and file_id = $2', [studioId, fileId]);
  const vc = corpo?.versione_catena ?? {};
  await query(
    `insert into audit.pipeline_runs (studio_id, file_id, attempt, pipeline_version, status, started_at, completed_at, error_type, error_message, failed_step, config)
       values ($1, $2, $3, $4, 'FAILED', $5, now(), $6, $7, $8, $9)
       on conflict (studio_id, file_id, attempt) do nothing`,
    [studioId, fileId, n + 1, vc.pipeline ?? null, corpo?.iniziata_il ?? null,
     String(corpo?.tipo ?? 'errore').slice(0, 80), String(corpo?.messaggio ?? '').slice(0, 300), String(corpo?.fase ?? '').slice(0, 80),
     JSON.stringify({ modelli: { asr_a: vc.asr_a, asr_b: vc.asr_b, llm_locale: vc.llm_locale, esterno: vc.esterno }, prompt: vc.prompt })]
  );
}

// Rilascio (§54): la prima comparsa di una versione crea la linea verticale.
export async function registraRilascio(studioId: string | null, kind: 'pipeline' | 'app' | 'prompt' | 'model', version: string | null | undefined, quando?: string): Promise<void> {
  if (!version) return;
  await query(
    `insert into audit.deployments (studio_id, kind, version, released_at)
       values ($1, $2, $3, coalesce($4::timestamptz, now()))
       on conflict (studio_id, kind, version) do nothing`,
    [studioId, kind, version.slice(0, 80), quando ?? null]
  );
}

// Nuovo artefatto fuori dalla catena (tappa AI dell'app o versione umana):
// numero di versione progressivo nel referto, genitori espliciti.
export async function nuovoArtefatto(
  studioId: string, bozzaId: string, label: string, producer: 'AI' | 'SYSTEM' | 'SECRETARY' | 'DOCTOR',
  testo: string, genitori: number[] = [], runId: number | null = null, quando?: string | null
): Promise<number> {
  const [{ v }] = await query<{ v: number }>(
    'select coalesce(max(version_no), 0)::int as v from audit.artifacts where bozza_id = $1', [bozzaId]);
  const [a] = await query<{ id: number }>(
    `insert into audit.artifacts (studio_id, run_id, bozza_id, version_no, kind, label, producer_type, content_text, content_hash, bytes, words, created_at)
       values ($1, $2, $3, $4, 'text', $5, $6, $7, $8, $9, $10, coalesce($11::timestamptz, now())) returning id`,
    [studioId, runId, bozzaId, v + 1, label, producer, testo, sha256(testo), Buffer.byteLength(testo), nParole(testo), quando ?? null]
  );
  for (const g of genitori) await query('insert into audit.artifact_parents (artifact_id, parent_artifact_id) values ($1, $2) on conflict do nothing', [a.id, g]);
  return a.id;
}

// L'ultimo output AI del referto: la base del confronto con la persona.
export async function ultimoArtefattoAI(bozzaId: string): Promise<{ id: number; testo: string; run_id: number | null } | null> {
  const [a] = await query<{ id: number; content_text: string; run_id: number | null }>(
    `select id, content_text, run_id from audit.artifacts
      where bozza_id = $1 and producer_type = 'AI' and kind = 'text' and content_text is not null
      order by version_no desc limit 1`, [bozzaId]);
  return a ? { id: a.id, testo: a.content_text, run_id: a.run_id } : null;
}

// Tappa AI eseguita dall'app (per esempio «Impagina come lettera»): tappa +
// artefatti di ingresso e uscita, con il prompt registrato col suo testo.
export async function registraPassoApp(opz: {
  studioId: string; bozzaId: string; nome: string; tipo: string; modello: string; provider?: string;
  promptNome: string; promptTesto: string; ingresso: string; uscita: string | null;
  inizio: number; stato: 'SUCCESS' | 'FAILED'; errore?: string; producerIngresso?: 'SECRETARY' | 'DOCTOR' | 'SYSTEM'; metadata?: Record<string, unknown>;
}): Promise<void> {
  const prompt = await registraPrompt(opz.promptNome, opz.promptTesto);
  const base = await ultimoArtefattoAI(opz.bozzaId);
  const ingressoId = await nuovoArtefatto(opz.studioId, opz.bozzaId, `ingresso_${opz.nome}`, opz.producerIngresso ?? 'SYSTEM', opz.ingresso, base ? [base.id] : [], base?.run_id ?? null);
  const uscitaId = opz.uscita ? await nuovoArtefatto(opz.studioId, opz.bozzaId, opz.nome, 'AI', opz.uscita, [ingressoId], base?.run_id ?? null) : null;
  const [{ o }] = await query<{ o: number }>('select coalesce(max(step_order), 0)::int as o from audit.pipeline_steps where bozza_id = $1', [opz.bozzaId]);
  await query(
    `insert into audit.pipeline_steps (run_id, bozza_id, step_order, step_type, step_name, producer_type, model_provider, model_name, prompt_version_id, status, error_type, started_at, completed_at, duration_ms, input_artifact_id, output_artifact_id, metadata)
       values ($1, $2, $3, $4, $5, 'AI', $6, $7, $8, $9, $10, $11, now(), $12, $13, $14, $15)`,
    [base?.run_id ?? null, opz.bozzaId, o + 1, opz.tipo, opz.nome, opz.provider ?? 'local', opz.modello, prompt.id, opz.stato, opz.errore ?? null,
     new Date(opz.inizio).toISOString(), Math.max(0, Date.now() - opz.inizio), ingressoId, uscitaId, JSON.stringify(opz.metadata ?? {})]
  );
}
