import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { generaOllama, ollamaAttivo } from './ollama';

// Cattura AI dell'impegnativa: legge una foto o un PDF della richiesta del
// medico di base ed estrae i campi anagrafici e clinici per PRECOMPILARE il
// modulo d'invio. Non salva nulla, non decide nulla: l'inviante rivede e
// corregge ogni campo prima di inviare.
//
// VINCOLO nLPD: la funzione manda un documento clinico a un servizio esterno
// (API Anthropic, fuori dalla Svizzera). Per questo è SPENTA se manca la
// variabile ANTHROPIC_API_KEY: senza chiave la funzione non esiste nel modulo.
// Accenderla in produzione richiede la stessa validazione legale di Stripe
// (contratto di trattamento dati con il subfornitore, informativa aggiornata).

export function catturaAttiva(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Motore disponibile per la cattura: 'cloud' (API Anthropic, richiede la
// validazione legale), 'locale' (Ollama sul Mac dello studio: il documento
// non esce dal computer — niente contratti con terzi), o null (spenta).
export type MotoreCattura = 'cloud' | 'locale' | null;

export async function motoreCattura(): Promise<MotoreCattura> {
  if (catturaAttiva()) return 'cloud';
  if (await ollamaAttivo()) return 'locale';
  return null;
}

const CampiSchema = z.object({
  cognome: z.string().describe('Cognome del paziente, stringa vuota se non presente'),
  nome: z.string().describe('Nome del paziente, stringa vuota se non presente'),
  data_nascita: z
    .string()
    .describe('Data di nascita del paziente in formato AAAA-MM-GG, stringa vuota se assente'),
  telefono: z.string().describe('Telefono del paziente, stringa vuota se assente'),
  quesito: z
    .string()
    .describe('Quesito clinico o motivo della richiesta, riassunto fedele; stringa vuota se assente'),
  urgenza: z
    .enum(['urgente', 'normale', 'programmabile'])
    .describe('Urgenza indicata o desumibile; "normale" se non chiaro'),
});

export type CampiImpegnativa = z.infer<typeof CampiSchema>;

const MIME_OK: Record<string, 'application/pdf' | 'image/jpeg' | 'image/png'> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
};

const PROMPT = [
  "Sei l'assistente della segreteria di uno studio medico specialistico.",
  "Ti do l'immagine o il PDF di un'impegnativa (richiesta di visita) scritta dal medico di base.",
  'Estrai SOLO i dati che leggi con certezza. Non inventare nulla: se un campo non è',
  'presente o è illeggibile, lascialo come stringa vuota.',
  'Per la data di nascita usa il formato AAAA-MM-GG.',
  'Il quesito clinico deve essere un riassunto fedele del motivo della richiesta, in italiano.',
  'Non aggiungere diagnosi o interpretazioni tue: riporta solo ciò che è scritto.',
].join(' ');

// Variante locale: gemma3 (Ollama sul Mac) legge la FOTO dell'impegnativa e
// risponde in JSON con le stesse chiavi. Solo immagini: i PDF li legge solo il
// motore cloud. Difensiva: JSON rotto o campi strani → null, si compila a mano.
async function estraiImpegnativaLocale(
  buffer: Buffer,
  media: string
): Promise<CampiImpegnativa | null> {
  if (media === 'application/pdf') return null;
  const prompt = [
    PROMPT,
    '',
    'Rispondi SOLO con un oggetto JSON valido con esattamente queste chiavi:',
    '{"cognome": "", "nome": "", "data_nascita": "", "telefono": "", "quesito": "", "urgenza": "normale"}',
    'urgenza deve essere una tra: urgente, normale, programmabile.',
  ].join('\n');
  const uscita = await generaOllama(prompt, {
    json: true,
    immagini: [buffer.toString('base64')],
    timeoutMs: 120_000,
  });
  if (!uscita) return null;
  try {
    const grezzo = JSON.parse(uscita);
    const candidato = {
      cognome: String(grezzo?.cognome ?? '').slice(0, 120),
      nome: String(grezzo?.nome ?? '').slice(0, 120),
      data_nascita: String(grezzo?.data_nascita ?? '').slice(0, 10),
      telefono: String(grezzo?.telefono ?? '').slice(0, 40),
      quesito: String(grezzo?.quesito ?? '').slice(0, 1000),
      urgenza: ['urgente', 'normale', 'programmabile'].includes(grezzo?.urgenza)
        ? grezzo.urgenza
        : 'normale',
    };
    const esito = CampiSchema.safeParse(candidato);
    return esito.success ? esito.data : null;
  } catch {
    return null;
  }
}

// Estrae i campi da un file (immagine o PDF). Sceglie il motore disponibile:
// cloud se c'è la chiave, altrimenti l'AI locale (solo foto). Ritorna null se
// nessun motore è attivo, il tipo non è ammesso, o la lettura fallisce.
export async function estraiImpegnativa(
  buffer: Buffer,
  mimeType: string
): Promise<CampiImpegnativa | null> {
  const media = MIME_OK[mimeType.toLowerCase()];
  if (!media) return null;
  if (!catturaAttiva()) {
    if (await ollamaAttivo()) return estraiImpegnativaLocale(buffer, media);
    return null;
  }

  const client = new Anthropic();
  const data = buffer.toString('base64');

  const documentBlock: Anthropic.ContentBlockParam =
    media === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: media, data } };

  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 4000,
      // Estrazione semplice: nessun ragionamento profondo necessario.
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: zodOutputFormat(CampiSchema),
      },
      messages: [
        {
          role: 'user',
          // Il blocco documento prima del testo (raccomandazione API).
          content: [documentBlock, { type: 'text', text: PROMPT }],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return null;
    return response.parsed_output ?? null;
  } catch (e: any) {
    // Nessun contenuto clinico nel log: solo il motivo tecnico.
    console.error('Cattura impegnativa fallita:', e?.message || e);
    return null;
  }
}
