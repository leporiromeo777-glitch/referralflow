'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { anonimizza, TESTO_MAX, type EsitoAnonimizza } from '@/lib/anonimizza';

// Anonimizzazione on-demand: nessuna persistenza — il testo arriva, viene
// elaborato in memoria dal modello locale e torna al browser. Niente DB,
// niente file su disco, niente contenuti nei log (nLPD).

const FILE_MAX = 15 * 1024 * 1024;

export type RispostaAnonimizza =
  | { ok: true; esito: EsitoAnonimizza }
  | { ok: false; errore: string };

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

export async function anonimizzaDocumento(formData: FormData): Promise<RispostaAnonimizza> {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  let testo = String(formData.get('testo') ?? '');

  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > FILE_MAX) {
      return { ok: false, errore: 'Il file supera i 15 MB.' };
    }
    const nome = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
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
    } else if (nome.endsWith('.docx')) {
      try {
        const mammoth = (await import('mammoth')).default;
        const r = await mammoth.extractRawText({ buffer });
        testo = typeof r?.value === 'string' ? r.value : '';
      } catch {
        return { ok: false, errore: 'Non riesco a leggere questo file Word.' };
      }
      if (!testo.trim()) return { ok: false, errore: 'Questo file Word sembra vuoto.' };
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
    return {
      ok: false,
      errore:
        'Il modello AI locale non risponde. Controlla che Ollama sia in funzione su questo computer e riprova.',
    };
  }
}
