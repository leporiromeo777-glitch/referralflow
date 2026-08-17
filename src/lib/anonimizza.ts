import 'server-only';

// Anonimizzazione locale dei documenti (pagina /anonimizza).
//
// Vincolo nLPD: il documento con i dati veri NON esce mai da questo computer.
// L'analisi la fa il modello AI locale via Ollama (stesso motore della
// pipeline referti); la SOSTITUZIONE la fa questo codice, alla lettera —
// l'AI individua i dati identificativi ma non riscrive mai il testo, così il
// contenuto clinico non può essere alterato (stessa filosofia della pipeline
// di trascrizione). Niente scritture su DB, niente testo nei log.
//
// Modello: di default gemma3:12b, NON il 27b — sul Mac da 24 GB il 27b non
// convive con whisper sulla GPU (visto dal vivo il 2026-08-16): se un
// dettato è in trascrizione mentre qualcuno anonimizza, col 12b (~8 GB)
// non si pestano i piedi.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELLO = process.env.ANONIMIZZA_LLM || 'gemma3:12b';
const TIMEOUT_MS = 240_000;
const TENTATIVI = 2;
// Un blocco per chiamata: testi lunghi vengono spezzati sui paragrafi per
// stare nel contesto del modello; le sostituzioni si applicano poi al testo
// intero.
const BLOCCO_MAX = 6000;
export const TESTO_MAX = 100_000;

const PROMPT = `Sei un assistente per l'anonimizzazione di documenti medici in italiano. Nel testo qui sotto individua ESCLUSIVAMENTE i dati che identificano delle persone:
- nomi e cognomi di persone (pazienti, familiari, medici, chiunque);
- date di nascita (SOLO di nascita: le date di esami, visite e referti NON vanno toccate);
- indirizzi di casa (via e numero, città di residenza);
- numeri di telefono;
- indirizzi email;
- numeri personali (AVS, tessera assicurato, numero di cartella).

NON segnalare: date di esami o visite, valori e misure cliniche, farmaci, diagnosi, nomi di ospedali, cliniche o reparti.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"persone": ["Nome Cognome"], "date_nascita": [], "indirizzi": [], "telefoni": [], "email": [], "codici": []}
Ogni voce deve essere una citazione ESATTA del testo, parola per parola. Se una categoria è vuota, lascia la lista vuota.

TESTO:
{testo}`;

type Estratto = {
  persone: string[];
  date_nascita: string[];
  indirizzi: string[];
  telefoni: string[];
  email: string[];
  codici: string[];
};

export type Sostituzione = { originale: string; segnaposto: string };
export type EsitoAnonimizza = {
  testo: string;
  sostituzioni: Sostituzione[];
  modello: string;
};

async function chiamaOllama(prompt: string): Promise<string> {
  let ultimoErrore: unknown = null;
  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo++) {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODELLO,
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0, num_ctx: 8192 },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`ollama_http_${r.status}`);
      const dati = await r.json();
      const testo = typeof dati?.response === 'string' ? dati.response : '';
      if (testo.trim()) return testo;
      throw new Error('ollama_risposta_vuota');
    } catch (e) {
      ultimoErrore = e;
      if (tentativo < TENTATIVI) await new Promise((res) => setTimeout(res, 3000));
    }
  }
  throw ultimoErrore instanceof Error ? ultimoErrore : new Error('ollama_non_raggiungibile');
}

function estraiJson(grezzo: string): Estratto {
  const lista = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length >= 2).map((x) => x.trim())
      : [];
  let dati: any = {};
  try {
    dati = JSON.parse(grezzo);
  } catch {
    // JSON rotto: meglio nessuna voce (le difese regex restano) che
    // un'eccezione a metà documento.
  }
  return {
    persone: lista(dati.persone),
    date_nascita: lista(dati.date_nascita),
    indirizzi: lista(dati.indirizzi),
    telefoni: lista(dati.telefoni),
    email: lista(dati.email),
    codici: lista(dati.codici),
  };
}

// Spezza il testo in blocchi ≤ BLOCCO_MAX preferendo i confini di paragrafo,
// poi di riga: le citazioni del modello devono restare intere.
function blocchi(testo: string): string[] {
  if (testo.length <= BLOCCO_MAX) return [testo];
  const out: string[] = [];
  let resto = testo;
  while (resto.length > BLOCCO_MAX) {
    let taglio = resto.lastIndexOf('\n\n', BLOCCO_MAX);
    if (taglio < BLOCCO_MAX / 2) taglio = resto.lastIndexOf('\n', BLOCCO_MAX);
    if (taglio < BLOCCO_MAX / 2) taglio = resto.lastIndexOf('. ', BLOCCO_MAX);
    if (taglio < BLOCCO_MAX / 2) taglio = BLOCCO_MAX;
    out.push(resto.slice(0, taglio + 1));
    resto = resto.slice(taglio + 1);
  }
  if (resto.trim()) out.push(resto);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sostituisce tutte le occorrenze (case-insensitive, a confine di parola) e
// registra quante ne ha trovate.
function sostituisci(testo: string, originale: string, segnaposto: string): [string, number] {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(originale)}(?![\\p{L}\\p{N}])`, 'giu');
  let n = 0;
  const nuovo = testo.replace(pattern, () => {
    n += 1;
    return segnaposto;
  });
  return [nuovo, n];
}

export async function anonimizza(testoOriginale: string): Promise<EsitoAnonimizza> {
  let testo = testoOriginale.slice(0, TESTO_MAX);

  // 1) Il modello locale individua i dati identificativi, blocco per blocco.
  const estratti: Estratto = {
    persone: [], date_nascita: [], indirizzi: [], telefoni: [], email: [], codici: [],
  };
  for (const blocco of blocchi(testo)) {
    const grezzo = await chiamaOllama(PROMPT.replace('{testo}', blocco));
    const e = estraiJson(grezzo);
    (Object.keys(estratti) as (keyof Estratto)[]).forEach((k) => {
      for (const voce of e[k]) if (!estratti[k].includes(voce)) estratti[k].push(voce);
    });
  }

  const sostituzioni: Sostituzione[] = [];
  const applica = (voci: string[], segnaposto: string | ((i: number) => string)) => {
    voci.forEach((voce, i) => {
      const seg = typeof segnaposto === 'function' ? segnaposto(i) : segnaposto;
      const [nuovo, n] = sostituisci(testo, voce, seg);
      if (n > 0) {
        testo = nuovo;
        sostituzioni.push({ originale: voce, segnaposto: seg });
      }
    });
  };

  // 2) Le persone per prime, numerate nell'ordine in cui compaiono nel testo.
  const persone = estratti.persone
    .map((p) => ({ p, pos: testo.toLowerCase().indexOf(p.toLowerCase()) }))
    .filter((x) => x.pos !== -1)
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.p);
  persone.forEach((nome, i) => {
    const seg = `«Persona ${i + 1}»`;
    const [nuovo, n] = sostituisci(testo, nome, seg);
    if (n > 0) {
      testo = nuovo;
      sostituzioni.push({ originale: nome, segnaposto: seg });
    }
    // Anche i pezzi del nome da soli («la signora Rossi» dopo «Maria Rossi»):
    // stesso segnaposto, così la persona resta riconoscibile come «la stessa».
    for (const pezzo of nome.split(/\s+/)) {
      if (pezzo.length < 3) continue;
      const [nuovo2, n2] = sostituisci(testo, pezzo, seg);
      if (n2 > 0) {
        testo = nuovo2;
        sostituzioni.push({ originale: pezzo, segnaposto: seg });
      }
    }
  });

  applica(estratti.date_nascita, '[data di nascita]');
  applica(estratti.indirizzi, '[indirizzo]');
  applica(estratti.telefoni, '[telefono]');
  applica(estratti.email, '[email]');
  applica(estratti.codici, '[codice personale]');

  // 3) Rete di sicurezza deterministica, indipendente dal modello: formati
  // svizzeri riconoscibili a colpo d'occhio.
  const regole: [RegExp, string][] = [
    [/\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/g, '[n. AVS]'],
    [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]'],
    [/(?:\+41|0041)\s?\d{2}[\s./-]?\d{3}[\s./-]?\d{2}[\s./-]?\d{2}\b/g, '[telefono]'],
    [/\b0\d{2}[\s./-]\d{3}[\s./-]\d{2}[\s./-]\d{2}\b/g, '[telefono]'],
  ];
  for (const [pattern, seg] of regole) {
    let n = 0;
    const nuovo = testo.replace(pattern, () => { n += 1; return seg; });
    if (n > 0) {
      testo = nuovo;
      sostituzioni.push({ originale: `formato riconosciuto (${n}×)`, segnaposto: seg });
    }
  }

  return { testo, sostituzioni, modello: MODELLO };
}
