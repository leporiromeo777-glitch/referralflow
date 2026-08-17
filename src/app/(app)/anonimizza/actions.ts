'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import {
  anonimizza,
  anonimizzaConPiano,
  TESTO_MAX,
  type EsitoAnonimizza,
} from '@/lib/anonimizza';

// Anonimizzazione on-demand: nessuna persistenza — il documento arriva, viene
// elaborato in memoria dal modello locale e torna al browser. Niente DB,
// niente file su disco, niente contenuti nei log (nLPD).
//
// Per i .docx la risposta porta anche IL FILE ORIGINALE MODIFICATO (stesso
// documento, stessi logo/intestazione/impaginazione, solo i dati sostituiti);
// per PDF e testo il file scaricabile resta il testo semplice.

// Sotto il bodySizeLimit delle server action (12 MB in next.config.mjs).
const FILE_MAX = 10 * 1024 * 1024;

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type RispostaAnonimizza =
  | { ok: true; esito: EsitoAnonimizza; file?: { nome: string; base64: string; mime: string } }
  | { ok: false; errore: string };

const ERRORE_OLLAMA =
  'Il modello AI locale non risponde. Controlla che Ollama sia in funzione su questo computer e riprova.';

async function testoDaPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const risultato = await parser.getText();
    return typeof risultato?.text === 'string' ? risultato.text : '';
  } finally {
    await parser.destroy();
  }
}

// Il percorso Word: piano di sostituzioni calcolato UNA volta sul testo
// estratto, applicato sia all'anteprima sia dentro il pacchetto .docx.
async function rispostaDocx(nomeFile: string, buffer: Buffer): Promise<RispostaAnonimizza> {
  let testo = '';
  try {
    const mammoth = (await import('mammoth')).default;
    const r = await mammoth.extractRawText({ buffer });
    testo = typeof r?.value === 'string' ? r.value : '';
  } catch {
    return { ok: false, errore: 'Non riesco a leggere questo file Word.' };
  }
  if (!testo.trim()) return { ok: false, errore: 'Questo file Word sembra vuoto.' };
  if (testo.length > TESTO_MAX) {
    return { ok: false, errore: `Il documento è troppo lungo (massimo ${Math.round(TESTO_MAX / 1000)}mila caratteri).` };
  }

  try {
    // Piano con controprova: le voci scoperte rileggendo il risultato
    // valgono anche per la riscrittura del pacchetto Word.
    const { piano, esito } = await anonimizzaConPiano(testo);
    const { anonimizzaDocx } = await import('@/lib/anonimizza-docx');
    const nuovo = await anonimizzaDocx(buffer, piano);
    return {
      ok: true,
      esito,
      file: {
        // Nome NEUTRO, mai derivato dall'originale: i file dei pazienti
        // hanno spesso il nome della persona proprio nel nome del file, e
        // un documento anonimizzato che si chiama come il paziente non è
        // anonimo (visto dal vivo al primo uso reale, 2026-08-17).
        nome: 'documento-anonimizzato.docx',
        base64: nuovo.toString('base64'),
        mime: MIME_DOCX,
      },
    };
  } catch {
    return { ok: false, errore: ERRORE_OLLAMA };
  }
}

export async function anonimizzaDocumento(formData: FormData): Promise<RispostaAnonimizza> {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  let testo = String(formData.get('testo') ?? '');

  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > FILE_MAX) {
      return { ok: false, errore: 'Il file supera i 10 MB.' };
    }
    const nome = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (nome.endsWith('.docx')) {
      return rispostaDocx(file.name, buffer);
    }
    if (nome.endsWith('.pdf')) {
      try {
        testo = await testoDaPdf(buffer);
      } catch {
        return { ok: false, errore: 'Non riesco a leggere questo PDF.' };
      }
      if (!testo.trim()) {
        return {
          ok: false,
          errore:
            'Questo PDF non contiene testo selezionabile (probabilmente è una scansione): al momento posso anonimizzare solo PDF con testo.',
        };
      }
    } else if (nome.endsWith('.doc')) {
      return {
        ok: false,
        errore: 'Il vecchio formato .doc non è supportato: salva il documento come .docx e riprova.',
      };
    } else if (nome.endsWith('.txt') || nome.endsWith('.md') || file.type.startsWith('text/')) {
      testo = buffer.toString('utf-8');
    } else {
      return { ok: false, errore: 'Formato non supportato: incolla il testo oppure carica un .txt, un .docx o un PDF.' };
    }
  }

  testo = testo.trim();
  if (!testo) return { ok: false, errore: 'Incolla un testo o carica un file.' };
  if (testo.length > TESTO_MAX) {
    return { ok: false, errore: `Il testo è troppo lungo (massimo ${Math.round(TESTO_MAX / 1000)}mila caratteri).` };
  }

  try {
    const esito = await anonimizza(testo);
    return { ok: true, esito };
  } catch {
    return { ok: false, errore: ERRORE_OLLAMA };
  }
}
