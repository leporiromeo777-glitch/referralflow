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
  // 28.9.2026: la cartella scansionata intera non è «citata» da nessun referto.
  'cartella', 'cartelle', 'scansione', 'scansionata', 'scansionato', 'completa', 'completo', 'paziente', 'pagine',
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
// `escluse`: parole che non contano mai, cioè il nome del paziente
// (28.9.2026: una cartella caricata col nome del paziente come nome del file
// risultava «citata» da ogni suo referto, e partiva intera con la mail).
export function citatoNelTesto(notaDoc: string, testo: string, escluse: string[] = []): boolean {
  const via = new Set(escluse.flatMap((e) => paroleSpecifiche(e)));
  const parole = paroleSpecifiche(notaDoc).filter((w) => !via.has(w));
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

export function bloccoAllegato(note: NotaAgganciata[], testo = '', cartella: DocumentoCartella[] = [], extra: string[] = []): string {
  const righe = righeAllegato(note, testo, cartella);
  for (const e of extra) if (e && !righe.some((r) => r.toLowerCase() === e.toLowerCase())) righe.push(e);
  return righe.length ? ['Allegato:', ...righe.map((r) => `-${r}`)].join('\n') : '';
}

// ---------- L'ECG citato nel dettato (26.9.2026) ----------
// Richiesta dello studio: se il medico parla di un ECG, il sistema lo cerca
// nella cartella e lo allega. La regola di sopra non poteva farlo: «ECG» ha
// tre lettere e le parole specifiche ne vogliono almeno quattro, quindi un
// documento «ECG» non risultava mai citato.
// Quale ECG: un documento della cartella di categoria «ecg» (o con «ECG» /
// «elettrocardiogramma» nella nota o nel nome), caricato fra 30 giorni prima
// e 3 giorni dopo il dettato; il più recente. Un ECG di mesi prima NON si
// allega: il medico parla dell'ECG di oggi, e allegare quello vecchio sarebbe
// un errore scritto nella lettera. Niente ECG adatto = la revisione lo dice.
export type DocumentoDatato = DocumentoCartella & { id?: string; uploaded_at: string | Date };

export function citaECG(testo: string): boolean {
  return /\b(?:ecg|e\.c\.g\.|elettrocardiogramm[ai])\b/i.test(String(testo || ''));
}

export function eUnECG(d: DocumentoCartella): boolean {
  return d.categoria === 'ecg' || /\b(?:ecg|elettrocardiogramm[ai])\b/i.test(`${d.nota ?? ''} ${d.filename}`);
}

export function scegliECG<T extends DocumentoDatato>(cartella: T[], dettatoIl: Date): T | null {
  const t = dettatoIl.getTime();
  const adatti = cartella
    .filter((d) => eUnECG(d))
    .map((d) => ({ d, q: new Date(d.uploaded_at).getTime() }))
    .filter((x) => Number.isFinite(x.q) && x.q >= t - 30 * 86_400_000 && x.q <= t + 3 * 86_400_000)
    .sort((a, b) => b.q - a.q);
  return adatti[0]?.d ?? null;
}

export function etichettaDocumento(d: { filename: string; nota?: string | null }): string {
  return etichetta(d);
}
