import 'server-only';
import { chiamaEsterno, confEsterno, estraiJson } from './esterno';
import { pianoAnonimizzazione, applicaPiano } from './anonimizza';

// Controllo della lettera dopo «Impagina come lettera» (9.9.2026, richiesta
// dell'utente: il secondo dei prompt mancanti). Avvocato e omissioni girano
// nella catena PRIMA che la lettera esista: la riscrittura in lettera non era
// verificata da nessun modello («valori di partenza» è nato lì). Qui, in
// entrambe le direzioni: frasi della lettera non sostenute dal testo di
// partenza e passaggi del testo di partenza spariti dalla lettera. Solo
// segnalazioni: la lettera non viene toccata. Testo pseudonimizzato.

export const PROMPT_VERIFICA_LETTERA = `Sei un revisore di lettere mediche in italiano. Confronta il TESTO DI PARTENZA (referto dettato, già corretto) con la LETTERA (lo stesso contenuto messo in bella copia).

Elenca DUE cose:
1. "non_supportate": frasi o pezzi di frase della LETTERA che nel testo di partenza non ci sono o dicono una cosa diversa: parole di contenuto aggiunte, valori cambiati, diagnosi, esami o raccomandazioni non presenti.
2. "omesse": passaggi del TESTO DI PARTENZA il cui contenuto clinico manca nella lettera: valori, farmaci, esami, date, qualificatori («diminuito», «lieve»), negazioni, lateralità, raccomandazioni.

Regole obbligatorie:
- Cita ESATTAMENTE come compare nel rispettivo testo (max 25 parole per voce).
- NON segnalare differenze di forma: punteggiatura, maiuscole, saluto d'apertura e di chiusura, firma, riformulazioni fedeli, ordine delle frasi, il blocco «Terapia:» aggiunto in fondo.
- Poche segnalazioni e fondate: nel dubbio, non segnalare. Se tutto corrisponde, liste vuote.
- I segnaposto come «Persona 1», «[Medico 2]», «[data 3]» sono normali.

Rispondi SOLO con un oggetto JSON valido:
{"non_supportate": [{"frase": "...", "motivo": "..."}], "omesse": [{"frase": "...", "motivo": "..."}]}

TESTO DI PARTENZA:
{originale}

LETTERA:
{lettera}`;

export type Segnalazione = { frase: string; motivo: string };
export type EsitoVerifica = { non_supportate: Segnalazione[]; omesse: Segnalazione[]; modello: string; at: string };

const sig = (s: string) => new Set((s.toLowerCase().match(/[a-zà-ÿ0-9][a-zà-ÿ0-9.,]*/g) ?? []).filter((w) => w.length >= 4 || /^\d/.test(w)));

// Guardie di codice (pure, testabili): citazione esatta nel testo giusto,
// almeno 3 parole significative, scartata se quelle parole stanno già per
// l'80% nell'altro testo, niente doppioni, al più 10 per lista.
export function filtraSegnalazioni(voci: unknown, dentro: string, contro: string): Segnalazione[] {
  if (!Array.isArray(voci)) return [];
  const nelContro = sig(contro);
  const out: Segnalazione[] = [];
  const viste = new Set<string>();
  for (const v of voci.slice(0, 30)) {
    if (!v || typeof v !== 'object') continue;
    const frase = String((v as any).frase ?? '').trim();
    const motivo = String((v as any).motivo ?? '').trim().slice(0, 200);
    if (frase.length < 8 || !dentro.includes(frase)) continue;
    const s = sig(frase);
    if (s.size < 3) continue;
    let comuni = 0; for (const w of s) if (nelContro.has(w)) comuni += 1;
    if (comuni / s.size >= 0.8) continue;
    const chiave = [...s].sort().join(' ');
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    out.push({ frase: frase.slice(0, 400), motivo });
  }
  return out.slice(0, 10);
}

const SEP = '\n\n=====LETTERA=====\n\n';

export async function verificaLettera(originale: string, lettera: string): Promise<EsitoVerifica | null> {
  const conf = confEsterno();
  if (!conf || !originale.trim() || !lettera.trim() || originale.includes(SEP.trim()) || lettera.includes(SEP.trim())) return null;
  // Pseudonimizzazione: un piano solo per i due testi, così i segnaposto
  // coincidono; i nomi rientrano prima delle guardie.
  const piano = await pianoAnonimizzazione(originale + SEP + lettera);
  const [anonOrig] = applicaPiano(originale, piano);
  const [anonLett] = applicaPiano(lettera, piano);
  const prompt = PROMPT_VERIFICA_LETTERA.replace('{originale}', anonOrig).replace('{lettera}', anonLett);
  const risposta = await chiamaEsterno(prompt, { json: true });
  const dati = estraiJson(risposta);
  if (!dati || typeof dati !== 'object') return null;
  const rip = (s: string) => { let t = s; for (const v of piano.voci) t = t.split(v.segnaposto).join(v.originale); return t; };
  const ripristina = (lista: unknown) => (Array.isArray(lista) ? lista.map((v: any) => ({ frase: rip(String(v?.frase ?? '')), motivo: rip(String(v?.motivo ?? '')) })) : []);
  return {
    non_supportate: filtraSegnalazioni(ripristina(dati.non_supportate), lettera, originale),
    omesse: filtraSegnalazioni(ripristina(dati.omesse), originale, lettera),
    modello: conf.modello,
    at: new Date().toISOString(),
  };
}
