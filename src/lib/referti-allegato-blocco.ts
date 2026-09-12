// Blocco «Allegato:» in fondo alla lettera (12.9.2026, terzo referto vero:
// la segretaria chiude con «Allegato: -duplex del 29.07.2026 -ecocardiogramma
// da sforzo del 11.08.2026», presi dalla cartella). Due fonti, nessuna AI:
// 1. una nota per la segreteria che CHIEDE di allegare («allega…») con un
//    documento agganciato in cartella (la nota del documento, scritta da una
//    persona, altrimenti il nome del file senza estensione);
// 2. i documenti della cartella CITATI nel testo della lettera: tutte le
//    parole specifiche della nota del documento («duplex», «carotideo»)
//    compaiono nel testo; le date sono facoltative (la segretaria allega
//    l'eco anche se il medico non ne detta la data). Mai le lettere
//    precedenti: non sono allegati.
// Niente doppioni; vuoto = nessun blocco.
export type NotaAgganciata = {
  nota?: string;
  riguardaDocumenti: boolean;
  candidati: { filename: string; nota?: string | null; categoria?: string | null }[];
};

export type DocumentoCartella = { filename: string; nota?: string | null; categoria?: string | null };

const GENERICHE = new Set([
  'esame', 'esami', 'referto', 'referti', 'documento', 'documenti', 'lettera', 'lettere', 'copia',
  'del', 'della', 'dello', 'dei', 'delle', 'degli', 'con', 'per', 'senza', 'eseguito', 'eseguita',
  'controllo', 'visita', 'rapporto', 'allegato', 'allegati', 'vecchio', 'vecchia', 'ultimo', 'ultima',
]);

function etichetta(c: { filename: string; nota?: string | null }): string {
  return (c.nota ?? '').trim() || c.filename.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').trim();
}

function normalizza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Le parole specifiche di una nota di documento: ≥ 4 lettere, non generiche,
// niente date e numeri.
export function paroleSpecifiche(nota: string): string[] {
  return (normalizza(nota).match(/[a-z]{4,}/g) ?? []).filter((w) => !GENERICHE.has(w));
}

// Il documento è citato nel testo se OGNI parola specifica della sua nota
// compare nel testo (confronto sul prefisso di 5 lettere, così «carotideo»
// aggancia «carotidei»). Una nota senza parole specifiche non aggancia mai.
export function citatoNelTesto(notaDoc: string, testo: string): boolean {
  const parole = paroleSpecifiche(notaDoc);
  if (!parole.length) return false;
  const corpo = normalizza(testo);
  const presenti = new Set(corpo.match(/[a-z]{4,}/g) ?? []);
  return parole.every((p) => {
    const pre = p.slice(0, 5);
    for (const w of presenti) if (w.startsWith(pre) && p.startsWith(w.slice(0, 5))) return true;
    return false;
  });
}

export function righeAllegato(note: NotaAgganciata[], testo = '', cartella: DocumentoCartella[] = []): string[] {
  const righe: string[] = [];
  const visti = new Set<string>();
  const aggiungi = (e: string) => {
    const chiave = e.toLowerCase();
    if (!e || visti.has(chiave)) return;
    visti.add(chiave);
    righe.push(e);
  };
  for (const n of note) {
    if (!n.riguardaDocumenti || !n.candidati.length) continue;
    if (typeof n.nota === 'string' && !/alleg/i.test(n.nota)) continue;
    aggiungi(etichetta(n.candidati[0]));
  }
  if (testo) {
    for (const d of cartella) {
      if (d.categoria === 'lettera') continue;
      const e = etichetta(d);
      if (e && citatoNelTesto(e, testo)) aggiungi(e);
    }
  }
  return righe;
}

export function bloccoAllegato(note: NotaAgganciata[], testo = '', cartella: DocumentoCartella[] = []): string {
  const righe = righeAllegato(note, testo, cartella);
  return righe.length ? ['Allegato:', ...righe.map((r) => `-${r}`)].join('\n') : '';
}
