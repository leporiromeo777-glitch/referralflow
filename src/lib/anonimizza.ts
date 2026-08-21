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
// Due tempi, separati apposta: `pianoAnonimizzazione` costruisce UNA volta
// l'elenco delle sostituzioni (con l'AI), `applicaPiano` lo applica a
// qualsiasi frammento — al testo intero per l'anteprima, e paragrafo per
// paragrafo dentro il .docx originale (anonimizza-docx.ts), così logo,
// intestazione e impaginazione restano intatti.
//
// Modello: di default gemma3:12b, NON il 27b — sul Mac da 24 GB il 27b non
// convive con whisper sulla GPU (visto dal vivo il 2026-08-16): se un
// dettato è in trascrizione mentre qualcuno anonimizza, col 12b (~8 GB)
// non si pestano i piedi.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELLO = process.env.ANONIMIZZA_LLM || 'gemma3:12b';
export const MODELLO_ANONIMIZZA = MODELLO;
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
export type Piano = { voci: Sostituzione[] };
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

// Distanza di battitura (Levenshtein) con uscita anticipata oltre `max`.
function distanza(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let migliore = max + 1;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < migliore) migliore = cur[j];
    }
    if (migliore > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Parole comuni con l'iniziale spesso maiuscola nei referti: mai da toccare
// col confronto fuzzy, anche se somigliano a un cognome.
const PAROLE_COMUNI = new Set([
  'signor', 'signora', 'signore', 'dottor', 'dottore', 'dottoressa', 'gentile',
  'egregio', 'egregia', 'cordiali', 'distinti', 'saluti', 'collega', 'colleghi',
  'paziente', 'ospedale', 'clinica', 'studio', 'ambulatorio', 'terapia',
  'controllo', 'referto', 'visita', 'esame', 'quindi', 'inoltre', 'pertanto',
  'durante', 'presso', 'tramite', 'attuale', 'attualmente', 'lugano', 'ticino',
  'persona',
]);

// Voci che non devono MAI entrare nel piano: il testo dei segnaposto stessi.
// Senza questo filtro la controprova può segnalare la parola «Persona» dei
// segnaposto come nome residuo: nascerebbe la voce «Persona → «Persona N»»,
// che a ogni passata avvolge i segnaposto già presenti una volta di più
// (visto dal vivo su un referto reale: «««Persona 7» 7» 7»…).
function voceVietata(s: string): boolean {
  const bassa = s.trim().toLowerCase();
  return (
    bassa.length < 2 ||
    s.includes('«') || s.includes('»') || s.includes('[') || s.includes(']') ||
    /^persona(\s+\d+)?$/.test(bassa)
  );
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

// Rete di sicurezza deterministica, indipendente dal modello: formati
// svizzeri riconoscibili a colpo d'occhio.
const REGOLE: [RegExp, string][] = [
  [/\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/g, '[n. AVS]'],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]'],
  [/(?:\+41|0041)\s?\d{2}[\s./-]?\d{3}[\s./-]?\d{2}[\s./-]?\d{2}\b/g, '[telefono]'],
  [/\b0\d{2}[\s./-]\d{3}[\s./-]\d{2}[\s./-]\d{2}\b/g, '[telefono]'],
];

// Costruisce UNA volta l'elenco ordinato delle sostituzioni letterali.
// Le persone sono numerate nell'ordine in cui compaiono nel testo; per ogni
// nome vengono aggiunti anche i singoli pezzi («la signora Rossi» dopo
// «Maria Rossi») con lo STESSO segnaposto. Le voci restano nel piano anche
// se nel testo estratto non compaiono: dentro un .docx un nome può vivere
// solo nell'intestazione, che l'estrazione del testo non sempre vede.
export async function pianoAnonimizzazione(testoOriginale: string): Promise<Piano> {
  const testo = testoOriginale.slice(0, TESTO_MAX);

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

  const voci: Sostituzione[] = [];
  const minuscolo = testo.toLowerCase();
  const persone = estratti.persone
    .map((p) => ({ p, pos: minuscolo.indexOf(p.toLowerCase()) }))
    .sort((a, b) => (a.pos === -1 ? 1 : b.pos === -1 ? -1 : a.pos - b.pos))
    .map((x) => x.p);
  persone.forEach((nome, i) => {
    if (voceVietata(nome)) return;
    const seg = `«Persona ${i + 1}»`;
    voci.push({ originale: nome, segnaposto: seg });
    for (const pezzo of nome.split(/\s+/)) {
      if (pezzo.length >= 3 && !voceVietata(pezzo)) voci.push({ originale: pezzo, segnaposto: seg });
    }
  });

  // Varianti STORPIATE dei nomi trovati: whisper scrive lo stesso cognome in
  // modi leggermente diversi dentro lo stesso dettato — trovata una forma,
  // le quasi-uguali sfuggivano (visto dal vivo su un referto reale il
  // 2026-08-17: 5 nomi residui). Ogni parola del testo con l'iniziale
  // maiuscola viene confrontata coi pezzi dei nomi: a distanza di battitura
  // ≤1 (≤2 se lunga) eredita lo stesso segnaposto. Paletti: pezzi corti
  // esclusi, parole comuni escluse, e ogni sostituzione resta visibile
  // nell'elenco «cosa è stato sostituito».
  const tokenPersona: [string, string][] = [];
  persone.forEach((nome, i) => {
    for (const pezzo of nome.split(/\s+/)) {
      if (pezzo.length >= 5) tokenPersona.push([pezzo.toLowerCase(), `«Persona ${i + 1}»`]);
    }
  });
  if (tokenPersona.length > 0) {
    const giaCoperte = new Set(voci.map((v) => v.originale.toLowerCase()));
    const candidate = new Set<string>();
    for (const m of testo.matchAll(/\b\p{Lu}[\p{L}]{4,}\b/gu)) candidate.add(m[0]);
    for (const parola of candidate) {
      const bassa = parola.toLowerCase();
      if (giaCoperte.has(bassa) || PAROLE_COMUNI.has(bassa)) continue;
      for (const [pezzo, seg] of tokenPersona) {
        const max = pezzo.length >= 9 ? 2 : 1;
        if (distanza(bassa, pezzo, max) <= max) {
          voci.push({ originale: parola, segnaposto: seg });
          giaCoperte.add(bassa);
          break;
        }
      }
    }
  }
  const fissi: [keyof Estratto, string][] = [
    ['date_nascita', '[data di nascita]'],
    ['indirizzi', '[indirizzo]'],
    ['telefoni', '[telefono]'],
    ['email', '[email]'],
    ['codici', '[codice personale]'],
  ];
  for (const [chiave, seg] of fissi) {
    for (const voce of estratti[chiave]) {
      if (!voceVietata(voce)) voci.push({ originale: voce, segnaposto: seg });
    }
  }
  return { voci };
}

// Applica il piano (voci letterali + regole fisse) a un frammento qualsiasi.
// Restituisce il testo nuovo e le sostituzioni davvero avvenute qui.
export function applicaPiano(frammento: string, piano: Piano): [string, Sostituzione[]] {
  let testo = frammento;
  const effettive: Sostituzione[] = [];
  for (const { originale, segnaposto } of piano.voci) {
    const [nuovo, n] = sostituisci(testo, originale, segnaposto);
    if (n > 0) {
      testo = nuovo;
      effettive.push({ originale, segnaposto });
    }
  }
  for (const [pattern, seg] of REGOLE) {
    let n = 0;
    const nuovo = testo.replace(pattern, () => { n += 1; return seg; });
    if (n > 0) {
      testo = nuovo;
      effettive.push({ originale: `formato riconosciuto (${n}×)`, segnaposto: seg });
    }
  }
  return [testo, effettive];
}

const PROMPT_CONTROPROVA = `Questo testo è già stato anonimizzato: i dati identificativi sono stati sostituiti da segnaposto come «Persona 1» o [data di nascita]. Controlla se restano ANCORA nomi o cognomi di persone reali, anche storpiati o scritti male (NON i segnaposto, NON nomi di ospedali, istituti, farmaci o luoghi).
Rispondi SOLO con un oggetto JSON valido: {"nomi_rimasti": ["..."]}
Ogni voce deve essere una citazione ESATTA del testo. Se non resta nulla: {"nomi_rimasti": []}

TESTO:
{testo}`;

async function controprova(testoAnon: string): Promise<string[]> {
  try {
    const grezzo = await chiamaOllama(PROMPT_CONTROPROVA.replace('{testo}', testoAnon));
    const dati = JSON.parse(grezzo);
    const lista = Array.isArray(dati?.nomi_rimasti) ? dati.nomi_rimasti : [];
    return lista
      .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length >= 3)
      .map((x: string) => x.trim());
  } catch {
    return [];
  }
}

// Anonimizzazione con CONTROPROVA (aggiunta dopo il caso reale del
// 2026-08-17: la correzione AI della pipeline riscrive i nomi storpiati in
// forme nuove, che la prima passata non riconosce più): dopo le sostituzioni
// il modello rilegge il RISULTATO e segnala i nomi ancora presenti; ognuno
// viene agganciato — se somiglia a una persona già nota — al suo segnaposto,
// altrimenti a una «Persona» nuova, e si ricontrolla. Al massimo due giri.
// Restituisce anche il piano finale: serve al percorso .docx per riscrivere
// il documento originale con TUTTE le voci, controprova compresa.
export async function anonimizzaConPiano(
  testoOriginale: string
): Promise<{ piano: Piano; esito: EsitoAnonimizza }> {
  const originale = testoOriginale.slice(0, TESTO_MAX);
  const piano = await pianoAnonimizzazione(originale);
  let [testo, sostituzioni] = applicaPiano(originale, piano);
  let prossima =
    new Set(piano.voci.filter((v) => v.segnaposto.startsWith('«Persona')).map((v) => v.segnaposto)).size + 1;

  for (let giro = 0; giro < 2; giro++) {
    const rimasti = await controprova(testo);
    const presenti = rimasti.filter(
      (n) => !voceVietata(n) && testo.toLowerCase().includes(n.toLowerCase())
    );
    if (presenti.length === 0) break;
    for (const nome of presenti) {
      // Variante di una persona già nota? Stesso segnaposto. Altrimenti nuova.
      let seg: string | null = null;
      for (const v of piano.voci) {
        if (!v.segnaposto.startsWith('«Persona')) continue;
        for (const pezzoNoto of v.originale.split(/\s+/)) {
          if (pezzoNoto.length < 5) continue;
          const max = pezzoNoto.length >= 9 ? 2 : 1;
          for (const pezzoNuovo of nome.split(/\s+/)) {
            if (distanza(pezzoNuovo.toLowerCase(), pezzoNoto.toLowerCase(), max) <= max) {
              seg = v.segnaposto;
              break;
            }
          }
          if (seg) break;
        }
        if (seg) break;
      }
      if (!seg) {
        seg = `«Persona ${prossima}»`;
        prossima += 1;
      }
      piano.voci.push({ originale: nome, segnaposto: seg });
      for (const pezzo of nome.split(/\s+/)) {
        if (pezzo.length >= 3 && !voceVietata(pezzo)) {
          piano.voci.push({ originale: pezzo, segnaposto: seg });
        }
      }
    }
    const [nuovo, effettive] = applicaPiano(testo, piano);
    testo = nuovo;
    sostituzioni = sostituzioni.concat(effettive);
  }

  return { piano, esito: { testo, sostituzioni, modello: MODELLO } };
}

export async function anonimizza(testoOriginale: string): Promise<EsitoAnonimizza> {
  return (await anonimizzaConPiano(testoOriginale)).esito;
}
