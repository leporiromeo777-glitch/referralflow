// Nomi nella cartella del paziente: sottocartelle e documenti (20.10.2026, richiesta dello studio: «quando carico un
// documento devo poter scegliere in che sottocartella metterlo, e poter modificare, togliere o spostare i file nelle
// varie sottocartelle»). PURO.
//
// Una sottocartella non è una riga a sé: è il campo `cartella` dei documenti (migrazione 089). Esiste finché ha
// almeno un documento; le dodici della cartella cartacea dello studio (`SEZIONI` in dividi/sezioni.ts) si propongono
// sempre. Lo zip e i nomi devono reggere anche fuori dalla piattaforma: niente barre né segni che un file system rifiuta.

const VIETATI = /[\\/:*?"<>|\u0000-\u001f]+/g;

// Il nome di una sottocartella scritto da una persona; '' (o solo segni vietati) = nessuna sottocartella.
export function nomeCartella(v: unknown): string | null {
  const s = String(v ?? '').replace(VIETATI, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim();
  return s || null;
}

// La nota che porta un documento nato da «Dividi cartella» o la cartella completa da dividere: non è una descrizione.
export const NOTA_DI_SERVIZIO = /^(dalla cartella completa|cartella completa, da dividere)/;

// Che cosa si mostra di un documento: la descrizione scritta al caricamento, se c'è; se no il nome del file senza
// estensione (i documenti nati da una divisione hanno già il nome «AAAA.MM.GG Cognome Nome Che cos'è»).
export function titoloMostrato(d: { filename: string; nota: string | null }): string {
  const nota = (d.nota ?? '').trim();
  return nota && !NOTA_DI_SERVIZIO.test(nota) ? nota : d.filename.replace(/\.[a-z0-9]{2,5}$/i, '');
}

// Rinominare cambia ciò che si vede: la descrizione, se è quella che si vede; se no il nome del file, che tiene la sua
// estensione. → i campi da scrivere, o null se il nome nuovo è vuoto.
export function rinomina(d: { filename: string; nota: string | null }, titolo: unknown): { filename?: string; nota?: string } | null {
  const t = String(titolo ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  if (!t) return null;
  const nota = (d.nota ?? '').trim();
  if (nota && !NOTA_DI_SERVIZIO.test(nota)) return { nota: t };
  const est = /\.[a-z0-9]{2,5}$/i.exec(d.filename)?.[0] ?? '';
  const base = t.replace(VIETATI, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return null;
  return { filename: est && !base.toLowerCase().endsWith(est.toLowerCase()) ? `${base}${est}` : base };
}
