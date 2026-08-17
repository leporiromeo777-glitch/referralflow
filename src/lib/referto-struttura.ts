import 'server-only';

// Riorganizzazione del referto dettato nel formato standard dello studio
// (bottone nel dettaglio referto). Il modello AI LOCALE (Ollama) rimappa il
// testo nelle sezioni del rapporto-tipo fornito dal medico il 2026-08-17:
// Diagnosi principali/secondarie numerate, Comorbidità, Anamnesi attuale,
// Terapia domiciliare, Esami, Valutazione, Procedere.
//
// Paletti (stessa filosofia della pipeline referti):
// - il risultato è SEMPRE una proposta che la persona rivede: mai confermato
//   da solo;
// - firma numerica: se anche un solo numero cambia, appare o sparisce, la
//   proposta viene RIFIUTATA dal codice (i numeri sono il contenuto clinico
//   più delicato);
// - guardia sulla lunghezza: un testo che esce troppo corto significa
//   contenuto perso → rifiutato.
// Niente contenuti clinici nei log.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Il 27b, non il 12b: nel collaudo il 12b duplicava i contenuti tra le
// sezioni (veto sui numeri) anche con le regole esplicite; il 27b esce
// pulito al primo colpo. È più lento (1-3 min) ma il bottone è su richiesta.
const MODELLO = process.env.REFERTO_STRUTTURA_LLM || 'gemma3:27b';
const TIMEOUT_MS = 420_000;
const TESTO_MAX = 40_000;

const PROMPT = `Sei un assistente che riorganizza referti cardiologici dettati a voce. Riscrivi il TESTO qui sotto facendolo aderire ESATTAMENTE a questa struttura, con questi titoli di sezione (solo quelli per cui il testo ha davvero contenuto, in quest'ordine):

Diagnosi principali
Diagnosi secondarie
Comorbidità
Anamnesi attuale
Terapia domiciliare
Esami
Valutazione
Procedere

Regole obbligatorie:
1. NON inventare MAI nulla: niente diagnosi, valori, esami o frasi che non siano già nel testo. Se una sezione non ha contenuto, NON scrivere nemmeno il titolo.
2. Conserva TUTTI i numeri ESATTAMENTE come sono scritti (valori, date, dosaggi): non aggiungerne, non toglierne, non riformattarli.
3. Sposta le frasi nella sezione giusta senza riscriverle: ritocchi minimi solo dove serve per la scorrevolezza dopo lo spostamento.
4. Le diagnosi vanno numerate (1., 2., …), i dettagli di ognuna come elenco puntato «- …»; se il testo descrive la situazione attuale di una diagnosi, mettila su una riga che inizia con «- attuale:».
5. La sezione «Esami» raggruppa: esame clinico, ECG, ecocardiografia, ergometria/cicloergometria, laboratorio — ognuno in un paragrafo che inizia col nome dell'esame e la data tra parentesi SOLO se il testo la dice; se la data non c'è, non scrivere nulla al suo posto (mai «data non specificata» o simili).
5b. Ogni informazione va in UNA SOLA sezione: non ripetere le stesse frasi o gli stessi dati in più sezioni (per esempio le diagnosi NON vanno ricopiate nell'anamnesi). Se tutto il contenuto anamnestico è già nelle diagnosi, la sezione «Anamnesi attuale» si omette.
6. Il saluto iniziale (per esempio «Caro collega…») e la frase di apertura restano PRIMA della prima sezione; i saluti finali e la firma restano in fondo, DOPO «Procedere».
7. Rispondi SOLO con il testo riorganizzato, senza commenti né spiegazioni.

TESTO:
{testo}`;

function firmaNumerica(testo: string): string {
  // La numerazione d'elenco a inizio riga («1. », «2. »…) non conta: è il
  // formato stesso a chiederla, non è un valore clinico. Tutti gli altri
  // numeri devono restare identici.
  const senzaElenchi = testo.replace(/^\s*\d{1,2}\.\s+/gm, '');
  return (senzaElenchi.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join('|');
}

export type EsitoStruttura =
  | { ok: true; testo: string }
  | { ok: false; motivo: 'numeri' | 'troppo_corto' | 'ai_non_risponde' };

export async function riorganizzaReferto(testo: string): Promise<EsitoStruttura> {
  const originale = testo.slice(0, TESTO_MAX);
  let risposta = '';
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELLO,
        prompt: PROMPT.replace('{testo}', originale),
        stream: false,
        options: { temperature: 0, num_ctx: 16384 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`ollama_http_${r.status}`);
    const dati = await r.json();
    risposta = typeof dati?.response === 'string' ? dati.response.trim() : '';
  } catch {
    return { ok: false, motivo: 'ai_non_risponde' };
  }
  if (!risposta) return { ok: false, motivo: 'ai_non_risponde' };

  // Rete di sicurezza §2.4: la riorganizzazione non deve toccare i numeri.
  if (firmaNumerica(risposta) !== firmaNumerica(originale)) {
    return { ok: false, motivo: 'numeri' };
  }
  // Un risultato molto più corto dell'originale = contenuto perso.
  if (risposta.length < originale.length * 0.6) {
    return { ok: false, motivo: 'troppo_corto' };
  }
  return { ok: true, testo: risposta };
}
