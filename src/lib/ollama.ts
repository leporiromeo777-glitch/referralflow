import 'server-only';

// AI locale dello studio: ReferralFlow gira sul Mac mini accanto a Ollama
// (lo stesso che corregge i referti), quindi l'app può usarlo direttamente —
// i dati non lasciano mai il computer. Tutte le funzioni che passano da qui
// si spengono con garbo se Ollama non è raggiungibile.

const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:12b';

// Ping leggero con memoria breve: le pagine lo chiamano a ogni render.
let ultimoEsito: { attivo: boolean; quando: number } | null = null;

export async function ollamaAttivo(): Promise<boolean> {
  if (ultimoEsito && Date.now() - ultimoEsito.quando < 30_000) return ultimoEsito.attivo;
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    ultimoEsito = { attivo: r.ok, quando: Date.now() };
  } catch {
    ultimoEsito = { attivo: false, quando: Date.now() };
  }
  return ultimoEsito.attivo;
}

export type OpzioniOllama = {
  json?: boolean;
  // Immagini in base64 (gemma3 legge anche le foto: serve alla cattura locale).
  immagini?: string[];
  timeoutMs?: number;
};

// Una generazione secca (temperature 0), testo in → testo out. Null su errore:
// chi chiama decide il messaggio per l'utente, mai contenuti nei log.
export async function generaOllama(prompt: string, opzioni: OpzioniOllama = {}): Promise<string | null> {
  const corpo: Record<string, unknown> = {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    options: { temperature: 0 },
  };
  if (opzioni.json) corpo.format = 'json';
  if (opzioni.immagini?.length) corpo.images = opzioni.immagini;

  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(opzioni.timeoutMs ?? 180_000),
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const dati = await r.json();
    const testo = typeof dati?.response === 'string' ? dati.response.trim() : '';
    return testo || null;
  } catch (e: any) {
    console.error('AI locale non raggiungibile o in errore:', e?.name ?? 'errore');
    return null;
  }
}
