import 'server-only';
import { query } from './db';

// Aggancio dei riferimenti esterni citati nel dettato: quando una nota per la
// segreteria parla di un documento («allega la vecchia email del dottor
// Rossi», «metti anche l'ultimo ECG»), cerchiamo il candidato nella cartella
// del paziente e tra gli allegati delle sue referral, e lo proponiamo pronto
// accanto alla nota. Ricerca DETERMINISTICA (parole in comune), mai AI: i
// suggerimenti sono link, la scelta resta alla persona. Se non si trova
// nulla, la nota finisce nella lista «da procurare» in fondo alla bozza.

export type Candidato = {
  tipo: 'cartella' | 'allegato';
  id: string;
  filename: string;
  categoria: string | null;
  quando: string;
  punteggio: number;
};

export type NotaConRiferimenti = {
  nota: string;
  riguardaDocumenti: boolean;
  candidati: Candidato[];
};

// Una nota «riguarda documenti» se contiene un verbo/oggetto da allegato:
// solo per queste ha senso cercare (e chiedere se non si trova).
const SEGNALI_DOCUMENTO = [
  'allega', 'allegh', 'allegat', 'email', 'mail', 'lettera', 'referto',
  'esame', 'esami', 'ecg', 'eco', 'holter', 'imaging', 'immagini',
  'documento', 'cartella', 'vecchi',
];

const STOPWORDS = new Set([
  'alla', 'allo', 'agli', 'alle', 'della', 'dello', 'delle', 'degli',
  'del', 'dei', 'con', 'per', 'una', 'uno', 'anche', 'come', 'che',
  'non', 'gli', 'le', 'la', 'il', 'lo', 'un', 'in', 'su', 'da', 'di',
  'e', 'a', 'o', 'per', 'favore', 'grazie', 'poi', 'mi', 'ti', 'ci',
  'quella', 'quello', 'questa', 'questo', 'dottor', 'dottore', 'dottoressa',
  'dott', 'dr', 'signora', 'signor',
]);

function tokens(testo: string): string[] {
  return (testo.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function punteggio(nota: string[], testoDoc: string): number {
  const doc = new Set(tokens(testoDoc));
  let p = 0;
  for (const t of nota) if (doc.has(t)) p += 1;
  return p;
}

/** Trova il paziente citato nei campi estratti (match per cognome+nome). */
async function trovaPaziente(studioId: string, nomePaziente: string | null): Promise<string | null> {
  const pulito = (nomePaziente ?? '').trim();
  if (!pulito || pulito === 'non indicato') return null;
  const [p] = await query<{ id: string }>(
    `select id from patients
      where studio_id = $1
        and (lower(cognome || ' ' || nome) = lower($2)
             or lower(nome || ' ' || cognome) = lower($2))
      order by created_at desc limit 1`,
    [studioId, pulito]
  );
  return p?.id ?? null;
}

export async function agganciaRiferimenti(
  studioId: string,
  nomePaziente: string | null,
  note: string[]
): Promise<NotaConRiferimenti[]> {
  if (note.length === 0) return [];

  const patientId = await trovaPaziente(studioId, nomePaziente);

  // Le fonti si caricano una volta sola (liste piccole, recinto studio).
  const docs = patientId
    ? await query<{ id: string; filename: string; categoria: string; nota: string | null; uploaded_at: string }>(
        `select id, filename, categoria, nota, uploaded_at::text from patient_documents
          where patient_id = $1 and studio_id = $2
          order by uploaded_at desc limit 100`,
        [patientId, studioId]
      )
    : [];
  const allegati = patientId
    ? await query<{ id: string; filename: string; uploaded_at: string }>(
        `select a.id, a.filename, a.uploaded_at::text
           from attachments a join referrals r on r.id = a.referral_id
          where r.patient_id = $1 and r.studio_id = $2
          order by a.uploaded_at desc limit 100`,
        [patientId, studioId]
      )
    : [];

  return note.map((nota) => {
    const bassa = nota.toLowerCase();
    const riguardaDocumenti = SEGNALI_DOCUMENTO.some((s) => bassa.includes(s));
    if (!riguardaDocumenti) return { nota, riguardaDocumenti, candidati: [] };

    const toks = tokens(nota);
    const candidati: Candidato[] = [];
    for (const d of docs) {
      const p = punteggio(toks, `${d.filename} ${d.categoria} ${d.nota ?? ''}`);
      if (p > 0) {
        candidati.push({
          tipo: 'cartella', id: d.id, filename: d.filename,
          categoria: d.categoria, quando: d.uploaded_at, punteggio: p,
        });
      }
    }
    for (const a of allegati) {
      const p = punteggio(toks, a.filename);
      if (p > 0) {
        candidati.push({
          tipo: 'allegato', id: a.id, filename: a.filename,
          categoria: null, quando: a.uploaded_at, punteggio: p,
        });
      }
    }
    candidati.sort((x, y) => y.punteggio - x.punteggio);
    return { nota, riguardaDocumenti, candidati: candidati.slice(0, 3) };
  });
}
