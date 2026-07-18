import 'server-only';
import { query } from './db';

// Cartella documenti del paziente (Fase 14): categorie, letture e registro
// accessi. Ogni operazione sui documenti passa da qui, così il log è uniforme
// (art. 4 OPDa: verbalizzazione degli accessi, conservata almeno 1 anno).

// Guardia sui parametri da URL/form: un valore non-UUID farebbe fallire il
// cast di Postgres con un errore 500 — meglio trattarlo come «non trovato».
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export const CATEGORIE: Record<string, string> = {
  referto: 'Referto',
  ecg: 'ECG',
  imaging: 'Imaging',
  lettera: 'Lettera',
  consenso: 'Consenso firmato',
  altro: 'Documento',
};

export type DocumentoPaziente = {
  id: string;
  filename: string;
  categoria: string;
  nota: string | null;
  uploaded_at: string;
};

// I documenti in cartella per un paziente, recintati per studio.
export function documentiPaziente(patientId: string, studioId: string) {
  return query<DocumentoPaziente>(
    `select id, filename, categoria, nota, uploaded_at::text
       from patient_documents
      where patient_id = $1 and studio_id = $2
      order by uploaded_at desc`,
    [patientId, studioId]
  );
}

// Scrive una riga nel registro accessi. Mai dati clinici nel dettaglio.
export async function logDocumento(
  documentId: string,
  azione: 'caricamento' | 'lettura' | 'invio' | 'cancellazione',
  opts: { studioId?: string; userId?: string; dettaglio?: string } = {}
): Promise<void> {
  await query(
    `insert into document_access_log (document_id, studio_id, user_id, azione, dettaglio)
     values ($1, $2, $3, $4, $5)`,
    [documentId, opts.studioId ?? null, opts.userId ?? null, azione, opts.dettaglio ?? null]
  );
}
