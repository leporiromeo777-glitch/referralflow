import 'server-only';
import { relazioniIntatte } from './referti-misure-cliniche';
import { normalizzaDate } from './referti-lettera';

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
3. Sposta le frasi nella sezione giusta e RISCRIVILE IN BELLA COPIA dove serve: punteggiatura corretta, maiuscole a inizio frase, frasi scorrevoli e complete — senza mai cambiare il significato né aggiungere informazioni.
3b. Ripara i resti dei tagli fatti in revisione: apostrofi o virgolette rimasti orfani, articoli e congiunzioni appesi nel vuoto (es. «l'», «e», «con» senza la parola che seguiva), doppi spazi, segni doppi, frasi che iniziano a metà. Un frammento spezzato che non contiene NESSUNA informazione clinica può essere tolto; se contiene un dato, va ricucito nella frase più vicina.
4. Le diagnosi vanno numerate (1., 2., …), i dettagli di ognuna come elenco puntato «- …»; se il testo descrive la situazione attuale di una diagnosi, mettila su una riga che inizia con «- attuale:».
5. La sezione «Esami» raggruppa: esame clinico, ECG, ecocardiografia, ergometria/cicloergometria, laboratorio — ognuno in un paragrafo che inizia col nome dell'esame e la data tra parentesi SOLO se il testo la dice; se la data non c'è, non scrivere nulla al suo posto (mai «data non specificata» o simili).
5b. Ogni informazione va in UNA SOLA sezione: non ripetere le stesse frasi o gli stessi dati in più sezioni (per esempio le diagnosi NON vanno ricopiate nell'anamnesi). Se tutto il contenuto anamnestico è già nelle diagnosi, la sezione «Anamnesi attuale» si omette.
6. Il saluto iniziale (per esempio «Caro collega…») e la frase di apertura restano PRIMA della prima sezione; i saluti finali e la firma restano in fondo, DOPO «Procedere».
7. Rispondi SOLO con il testo riorganizzato, senza commenti né spiegazioni.

TESTO:
{testo}`;

// Formato «lettera» (dr. Moccetti, richiesta dell'utente 2026-09-07): niente
// sezioni — «Caro <medico>,», a capo, il corpo della lettera, a capo, il
// saluto. Stesse regole ferree: nulla di inventato, numeri identici.
const PROMPT_LETTERA = `Sei un assistente che mette in bella copia lettere mediche dettate a voce da un cardiologo a un collega. Riscrivi il TESTO qui sotto come LETTERA con ESATTAMENTE questa forma:

1. PRIMA RIGA: il saluto di apertura «Caro <titolo e nome del medico destinatario>,» (o «Cara …,» se il testo indica una dottoressa). Il destinatario è quello che il testo nomina (per esempio dopo «caro collega», «cara dottoressa Rossi», «al dottor Bianchi»); se il testo non nomina nessuno, scrivi «Caro collega,». Non inventare nomi.
2. Una riga vuota.
3. IL CORPO DELLA LETTERA: tutto il contenuto clinico dettato, in prosa scorrevole divisa in paragrafi sensati (motivo della visita, anamnesi, esami, valutazione, proposta), SEPARATI L'UNO DALL'ALTRO DA UNA RIGA VUOTA. Punteggiatura corretta, maiuscole a inizio frase, frasi complete — SENZA mai cambiare il significato né aggiungere informazioni. Niente titoli di sezione, niente elenchi puntati, niente numerazione.
4. Una riga vuota.
5. IL SALUTO FINALE: {chiusura}

Regole obbligatorie:
- NON inventare MAI nulla: niente diagnosi, valori, esami o frasi che non siano già nel testo.
- Conserva TUTTI i numeri ESATTAMENTE come sono scritti (valori, date, dosaggi, unità): non aggiungerne, non toglierne, non riformattarli.
- Le istruzioni rivolte alla segretaria («scrivi a…», «manda copia a…», «copia alla paziente») restano fuori dalla lettera; niente righe «Copia: …».
- Elimina le ripetizioni tipiche del parlato quando dicono la stessa cosa due volte di seguito (per esempio «ho eseguito una medicazione, limitandomi a una semplice medicazione» → «ho eseguito una semplice medicazione»), SENZA perdere alcuna informazione.
- Ripara i resti dei tagli fatti in revisione: apostrofi orfani, congiunzioni appese, doppi spazi, frasi che iniziano a metà. Un frammento senza NESSUNA informazione clinica può essere tolto; se contiene un dato, va ricucito nella frase più vicina.
- Rispondi SOLO con la lettera, senza commenti né spiegazioni.

TESTO:
{testo}`;

export type FormatoReferto = 'rapporto' | 'lettera';

// Dettagli della forma «lettera» dal profilo del medico e dal contesto:
// saluto fisso, righe di firma, blocco terapia da riprendere (dalla lettera
// precedente, quando il dettato dice che la terapia è invariata).
export type OpzioniLettera = {
  chiusura?: string;
  firma?: string[];
  terapia?: string[];
};

function promptPer(formato: FormatoReferto, opzioni: OpzioniLettera): string {
  if (formato !== 'lettera') return PROMPT;
  const chiusura = opzioni.chiusura?.trim()
    ? `scrivi ESATTAMENTE «${opzioni.chiusura.trim()}» e nient'altro (la firma viene aggiunta dopo: non scriverla).`
    : 'quello dettato (per esempio «Cordiali saluti» o «Con i migliori saluti») seguito dalla firma se dettata; se il testo non ha un saluto finale, scrivi «Cordiali saluti,» e basta.';
  return PROMPT_LETTERA.replace('{chiusura}', chiusura);
}

// Rifiniture di CODICE dopo il modello, nella forma lettera: il blocco
// «Terapia:» ripreso dalla lettera precedente prima del saluto (solo se il
// dettato dice che la terapia è invariata) e le righe di firma in fondo.
function rifinisciLettera(lettera: string, opzioni: OpzioniLettera): string {
  let righe = lettera.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const chiusura = opzioni.chiusura?.trim();
  let iSaluto = -1;
  if (chiusura) {
    iSaluto = righe.findIndex((r) => r.trim().toLowerCase() === chiusura.toLowerCase());
  }
  if (iSaluto === -1) {
    iSaluto = righe.findIndex((r) => /^(cordiali|con i migliori|distinti|un caro saluto)/i.test(r.trim()));
  }
  if (opzioni.terapia?.length) {
    const blocco = ['', 'Terapia:', ...opzioni.terapia, ''];
    if (iSaluto === -1) righe = [...righe, ...blocco];
    else righe = [...righe.slice(0, iSaluto), ...blocco, ...righe.slice(iSaluto)];
  }
  if (opzioni.firma?.length) {
    // Il modello a volte scrive comunque una firma dopo il saluto: via le
    // righe che sono già una riga di firma (o un nome con titolo), così la
    // firma del profilo non esce doppia.
    const norma = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const firmaNorm = new Set(opzioni.firma.map(norma));
    const fine = iSaluto === -1 ? righe.length : righe.findIndex((r, k) => k > iSaluto && /^(cordiali|con i migliori|distinti|un caro saluto)/i.test(r.trim()));
    const iChiusura = fine === -1 ? righe.length : fine;
    if (iChiusura < righe.length) {
      const dopo = righe.slice(iChiusura + 1).filter((r) => {
        const n = norma(r);
        return n && !firmaNorm.has(n) && !/^(dr|dott|prof)\b/.test(n) && !firmaNorm.has(norma(`Dr. med. ${r}`));
      });
      righe = [...righe.slice(0, iChiusura + 1), ...dopo];
    }
    righe = [...righe, '', ...opzioni.firma];
  }
  return righe.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function firmaNumerica(testo: string): string {
  // La numerazione d'elenco a inizio riga («1. », «2. »…) non conta: è il
  // formato stesso a chiederla, non è un valore clinico. Tutti gli altri
  // numeri devono restare identici — E ANCHE L'UNITÀ che li segue (2026-09-05):
  // «5 mg» → «5 mcg» lasciava il numero intatto e passava la guardia.
  // La firma ora è «numero+unità» (mg, mcg, g, ml, mmHg, bpm, %, cm, kg, ms…).
  const senzaElenchi = testo.replace(/^\s*\d{1,2}\.\s+/gm, '');
  const voci = senzaElenchi.match(/\d+(?:[.,]\d+)?(?:\s?(?:mcg|µg|mg|g|kg|ml|l|mmHg|bpm|%|cm|mm|m|ms|s|min|h|mmol\/l|ng\/l|u\/l|kg\/m²|kg\/m2)(?![\p{L}]))?/giu) ?? [];
  return voci.map((v) => v.toLowerCase().replace(/\s+/g, '')).sort().join('|');
}

export type EsitoStruttura =
  | { ok: true; testo: string }
  | { ok: false; motivo: 'numeri' | 'troppo_corto' | 'ai_non_risponde' };

export async function riorganizzaReferto(
  testo: string,
  avanzamento?: (percento: number) => void,
  formato: FormatoReferto = 'rapporto',
  opzioni: OpzioniLettera = {}
): Promise<EsitoStruttura> {
  // Forma lettera: le date «2 settembre 2026» diventano «02.09.2026» PRIMA
  // del modello (codice, deterministico): così la guardia sui numeri
  // confronta l'originale già normalizzato con la risposta.
  const originale = (formato === 'lettera' ? normalizzaDate(testo) : testo).slice(0, TESTO_MAX);
  let risposta = '';
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELLO,
        prompt: promptPer(formato, opzioni).replace('{testo}', originale),
        // Streaming: serve solo a misurare l'avanzamento (il testo
        // riorganizzato è lungo circa quanto l'originale, quindi i
        // caratteri già prodotti sono una percentuale onesta).
        stream: true,
        // 8192 e non 16384: sul Mac mini 24GB il 27b col contesto pieno
        // sconfina su CPU e manda in pressione la memoria dell'intera
        // macchina (visto dal vivo 2026-09-03); un referto sta in ~5k token.
        options: { temperature: 0, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!r.ok || !r.body) throw new Error(`ollama_http_${r.status}`);
    const lettore = r.body.getReader();
    const decoder = new TextDecoder();
    let resto = '';
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      resto += decoder.decode(value, { stream: true });
      const righe = resto.split('\n');
      resto = righe.pop() ?? '';
      for (const riga of righe) {
        if (!riga.trim()) continue;
        try {
          const pezzo = JSON.parse(riga);
          if (typeof pezzo?.response === 'string') risposta += pezzo.response;
        } catch { /* riga parziale: ignorata */ }
      }
      avanzamento?.(Math.min(96, Math.round(100 * (risposta.length / Math.max(originale.length, 1)))));
    }
    risposta = risposta.trim();
  } catch {
    return { ok: false, motivo: 'ai_non_risponde' };
  }
  if (!risposta) return { ok: false, motivo: 'ai_non_risponde' };

  // Rete di sicurezza §2.4: la riorganizzazione non deve toccare i numeri.
  if (firmaNumerica(risposta) !== firmaNumerica(originale)) {
    return { ok: false, motivo: 'numeri' };
  }
  // Lucchetto delle relazioni (Ricerca 18 §7): la firma è un multinsieme e
  // lascia passare due valori scambiati tra due concetti (FE 55 e FEVD 45 →
  // FE 45 e FEVD 55). Ogni misura del profilo deve avere gli stessi valori.
  if (!relazioniIntatte(originale, risposta)) {
    return { ok: false, motivo: 'numeri' };
  }
  // Un risultato molto più corto dell'originale = contenuto perso.
  if (risposta.length < originale.length * 0.6) {
    return { ok: false, motivo: 'troppo_corto' };
  }
  // Rifiniture di codice DOPO le guardie: terapia ripresa e firma sono
  // aggiunte deterministiche da fonti fidate, non parole del modello.
  if (formato === 'lettera') risposta = rifinisciLettera(risposta, opzioni);
  return { ok: true, testo: risposta };
}

// ——— Lavori in corso (barra di avanzamento del bottone) ———
// Registro in memoria: l'app di produzione è un unico processo Node sul
// Mac dello studio, quindi basta una Map. Un lavoro per bozza alla volta:
// ripremere il bottone NON accoda una seconda generazione (lezione del
// 2026-09-03: due 27b in coda mandano il Mac in pressione di memoria).

export type StatoLavoro = {
  stato: 'lavora' | 'fatto' | 'errore';
  percento: number;
  motivo?: 'numeri' | 'troppo_corto' | 'ai_non_risponde';
};

const lavori = new Map<string, StatoLavoro>();

export function statoRiorganizzazione(bozzaId: string): StatoLavoro | null {
  return lavori.get(bozzaId) ?? null;
}

export function avviaRiorganizzazione(
  bozzaId: string,
  testo: string,
  salva: (testo: string) => Promise<void>,
  formato: FormatoReferto = 'rapporto',
  opzioni: OpzioniLettera = {}
): boolean {
  const gia = lavori.get(bozzaId);
  if (gia?.stato === 'lavora') return false;
  lavori.set(bozzaId, { stato: 'lavora', percento: 1 });
  void (async () => {
    const esito = await riorganizzaReferto(testo, (percento) => {
      const l = lavori.get(bozzaId);
      if (l?.stato === 'lavora') l.percento = Math.max(l.percento, percento);
    }, formato, opzioni);
    if (esito.ok) {
      try {
        await salva(esito.testo);
        lavori.set(bozzaId, { stato: 'fatto', percento: 100 });
      } catch {
        lavori.set(bozzaId, { stato: 'errore', percento: 100, motivo: 'ai_non_risponde' });
      }
    } else {
      lavori.set(bozzaId, { stato: 'errore', percento: 100, motivo: esito.motivo });
    }
    // Il registro si ripulisce da solo: l'esito resta leggibile 10 minuti.
    setTimeout(() => lavori.delete(bozzaId), 600_000).unref?.();
  })();
  return true;
}
