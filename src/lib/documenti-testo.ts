import 'server-only';
import mammoth from 'mammoth';
import { query } from './db';
import { getFile } from './storage';
import { logDocumento } from './cartella';

// Testo di un documento della cartella (13.9.2026): PDF con pdf-parse, Word
// con mammoth, testo semplice com'è. Serve al visualizzatore del prototipo
// (per i formati che il browser non mostra) e al bot, che risponde sul
// documento aperto con il modello LOCALE. Ogni estrazione è una lettura e
// finisce nel registro accessi. Mai contenuti nei log.
export const MAX_TESTO_DOCUMENTO = 8000;

export type TestoDocumento = { id: string; filename: string; nota: string | null; categoria: string; tipo: 'pdf' | 'docx' | 'testo' | 'altro'; testo: string; troncato: boolean };

export async function testoDocumento(studioId: string, documentId: string, userId?: string): Promise<TestoDocumento | null> {
  const [d] = await query<{ id: string; filename: string; storage_key: string; nota: string | null; categoria: string }>(
    `select id, filename, storage_key, nota, categoria from patient_documents where id = $1 and studio_id = $2`,
    [documentId, studioId]
  );
  if (!d) return null;
  const nome = d.filename.toLowerCase();
  const tipo: TestoDocumento['tipo'] = nome.endsWith('.pdf') ? 'pdf' : nome.endsWith('.docx') ? 'docx' : /\.(txt|md|csv)$/.test(nome) ? 'testo' : 'altro';
  let testo = '';
  try {
    const { body } = await getFile(d.storage_key);
    if (tipo === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: body });
      const r = await parser.getText();
      testo = typeof r === 'string' ? r : String((r as { text?: string })?.text ?? '');
      try { await parser.destroy(); } catch { /* ignora */ }
    } else if (tipo === 'docx') {
      testo = (await mammoth.extractRawText({ buffer: body })).value;
    } else if (tipo === 'testo') {
      testo = body.toString('utf-8');
    }
  } catch {
    testo = '';
  }
  testo = testo.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const troncato = testo.length > MAX_TESTO_DOCUMENTO;
  await logDocumento(d.id, 'lettura', { studioId, userId, dettaglio: 'testo estratto per il visualizzatore o l’assistente locale' });
  return { id: d.id, filename: d.filename, nota: d.nota, categoria: d.categoria, tipo, testo: troncato ? testo.slice(0, MAX_TESTO_DOCUMENTO) : testo, troncato };
}
