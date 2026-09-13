import 'server-only';

// AI locale dello studio: ReferralFlow gira sul Mac mini accanto a Ollama
// (lo stesso che corregge i referti), quindi l'app può usarlo direttamente —
// i dati non lasciano mai il computer. Tutte le funzioni che passano da qui
// si spengono con garbo se Ollama non è raggiungibile.
//
// 13.9.2026: prima un guasto qui era INVISIBILE (`return null` secco), quindi
// «l'assistente non risponde» poteva voler dire cinque cose diverse. Ora ogni
// fallimento ha una causa tipizzata, che le route mostrano all'utente e
// scrivono nel log del server. Nei log finiscono solo nomi di modello, stati
// HTTP e millisecondi: mai il prompt, mai la risposta, mai dati clinici.

const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:12b';

// Il ping stava a 1500 ms: troppo stretto. Mentre la catena referti tiene la
// GPU occupata Ollama risponde anche in qualche secondo, e un ping scaduto
// faceva SPARIRE il riquadro dell'assistente senza dire niente a nessuno.
const PING_MS = Number(process.env.OLLAMA_PING_MS ?? 6000);
// Un 27b freddo si carica da disco in 1-3 minuti, e la catena lo sfratta
// apposta (`keep_alive: 0`) prima di whisper: la PRIMA domanda dopo un dettato
// parte quindi sempre a modello freddo. 90 s non bastavano.
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 240_000);

export const configurazioneOllama = { url: OLLAMA_URL, modello: OLLAMA_MODEL, pingMs: PING_MS, timeoutMs: TIMEOUT_MS };

export type CausaOllama =
  | 'spento'          // connessione rifiutata: Ollama non è in ascolto su OLLAMA_URL
  | 'ping_lento'      // in ascolto ma non ha risposto al ping entro PING_MS
  | 'modello_assente' // Ollama c'è, ma OLLAMA_MODEL non è stato scaricato
  | 'timeout'         // generazione oltre il tempo massimo (spesso: modello freddo)
  | 'http'            // altro errore HTTP di Ollama
  | 'risposta_vuota';

export const SPIEGAZIONE: Record<CausaOllama, string> = {
  spento: 'AI locale spenta: avvia Ollama sul Mac dello studio.',
  ping_lento: 'L\'AI locale non ha risposto in tempo: probabilmente sta lavorando per la catena dei referti. Riprova tra poco.',
  modello_assente: 'Il modello configurato non è installato in Ollama: scaricalo con «ollama pull».',
  timeout: 'Il modello locale sta ancora caricando (la prima domanda dopo un dettato è la più lenta). Riprova tra un minuto.',
  http: 'L\'AI locale ha risposto con un errore.',
  risposta_vuota: 'L\'AI locale ha risposto senza contenuto.',
};

// Ping leggero con memoria breve: le pagine lo chiamano a ogni render.
// Un esito positivo vale 30 s; uno NEGATIVO solo 5, così un singolo momento di
// carico non nasconde l'assistente per mezzo minuto.
let ultimoEsito: { attivo: boolean; quando: number; causa?: CausaOllama } | null = null;

function causaDiRete(e: any): CausaOllama {
  const nome = e?.name ?? '';
  if (nome === 'TimeoutError' || nome === 'AbortError') return 'ping_lento';
  return 'spento';
}

export async function ollamaAttivo(): Promise<boolean> {
  const valido = ultimoEsito && Date.now() - ultimoEsito.quando < (ultimoEsito.attivo ? 30_000 : 5_000);
  if (valido) return ultimoEsito!.attivo;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(PING_MS), cache: 'no-store' });
    ultimoEsito = { attivo: r.ok, quando: Date.now(), causa: r.ok ? undefined : 'http' };
    if (!r.ok) console.error(`[ai-locale] ping /api/tags ha risposto ${r.status}`);
  } catch (e: any) {
    const causa = causaDiRete(e);
    ultimoEsito = { attivo: false, quando: Date.now(), causa };
    console.error(`[ai-locale] ping fallito su ${OLLAMA_URL}: ${causa} (${e?.name ?? 'errore'})`);
  }
  return ultimoEsito.attivo;
}

// Perché l'ultimo ping è andato male: serve alle route per dire qualcosa di
// utile invece di «non disponibile».
export function ultimaCausaOllama(): CausaOllama | null {
  return ultimoEsito && !ultimoEsito.attivo ? (ultimoEsito.causa ?? 'spento') : null;
}

// I modelli davvero installati. Null se Ollama non risponde.
export async function modelliInstallati(): Promise<string[] | null> {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(PING_MS), cache: 'no-store' });
    if (!r.ok) return null;
    const dati = await r.json();
    return Array.isArray(dati?.models) ? dati.models.map((m: any) => String(m?.name ?? '')).filter(Boolean) : [];
  } catch {
    return null;
  }
}

export type OpzioniOllama = {
  /** modello diverso da OLLAMA_MODEL (es. il bot del prototipo usa il 12b: risponde in secondi) */
  modello?: string;
  json?: boolean;
  // Immagini in base64 (gemma3 legge anche le foto: serve alla cattura locale).
  immagini?: string[];
  timeoutMs?: number;
  modello?: string;
};

export type EsitoOllama =
  | { ok: true; testo: string; ms: number }
  | { ok: false; causa: CausaOllama; dettaglio: string; ms: number };

// Una generazione secca (temperature 0), testo in → esito parlante.
// Il `dettaglio` è sempre roba tecnica (stato HTTP, messaggio d'errore di
// Ollama, nome del modello): non contiene mai il prompt né la risposta.
export async function generaOllamaEsito(prompt: string, opzioni: OpzioniOllama = {}): Promise<EsitoOllama> {
  const modello = opzioni.modello ?? OLLAMA_MODEL;
  const corpo: Record<string, unknown> = {
    model: modello,
    prompt,
    stream: false,
    options: { temperature: 0 },
  };
  if (opzioni.json) corpo.format = 'json';
  if (opzioni.immagini?.length) corpo.images = opzioni.immagini;

  const inizio = Date.now();
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(opzioni.timeoutMs ?? TIMEOUT_MS),
      cache: 'no-store',
    });
    const ms = Date.now() - inizio;
    if (!r.ok) {
      // Ollama spiega il guasto in chiaro: {"error":"model \"x\" not found..."}
      const testoErrore = await r.text().catch(() => '');
      let messaggio = testoErrore.slice(0, 300);
      try { messaggio = String(JSON.parse(testoErrore)?.error ?? messaggio); } catch { /* non JSON */ }
      const assente = r.status === 404 || /not found|no such model|try pulling/i.test(messaggio);
      const causa: CausaOllama = assente ? 'modello_assente' : 'http';
      const dettaglio = assente ? `modello «${modello}» non installato in Ollama` : `HTTP ${r.status}: ${messaggio}`;
      console.error(`[ai-locale] generazione fallita (${causa}) modello=${modello} ${dettaglio} in ${ms}ms`);
      return { ok: false, causa, dettaglio, ms };
    }
    const dati = await r.json();
    const testo = typeof dati?.response === 'string' ? dati.response.trim() : '';
    if (!testo) {
      console.error(`[ai-locale] risposta vuota modello=${modello} in ${ms}ms`);
      return { ok: false, causa: 'risposta_vuota', dettaglio: 'campo response vuoto', ms };
    }
    return { ok: true, testo, ms };
  } catch (e: any) {
    const ms = Date.now() - inizio;
    const nome = e?.name ?? 'errore';
    const causa: CausaOllama = nome === 'TimeoutError' || nome === 'AbortError' ? 'timeout' : 'spento';
    const dettaglio = causa === 'timeout' ? `scaduto dopo ${ms}ms (modello «${modello}» probabilmente freddo)` : `${OLLAMA_URL} irraggiungibile (${nome})`;
    console.error(`[ai-locale] generazione fallita (${causa}) modello=${modello} ${dettaglio}`);
    return { ok: false, causa, dettaglio, ms };
  }
}

// Firma storica, per chi non ha bisogno della causa (cattura impegnativa,
// anonimizzazione, confronti): testo o null.
export async function generaOllama(prompt: string, opzioni: OpzioniOllama = {}): Promise<string | null> {
  const esito = await generaOllamaEsito(prompt, opzioni);
  return esito.ok ? esito.testo : null;
}
