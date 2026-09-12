// Blocco «Allegato:» in fondo alla lettera (12.9.2026, terzo referto vero:
// la segretaria chiude con «Allegato: -duplex del 29.07.2026 -ecocardiogramma
// da sforzo del 11.08.2026», presi dalla cartella). Una riga per documento
// agganciato a una nota per la segreteria che parla di allegati: la nota del
// documento in cartella se c'è (è scritta da una persona), altrimenti il nome
// del file senza estensione. Niente AI, niente doppioni; vuoto = nessun blocco.
export type NotaAgganciata = {
  riguardaDocumenti: boolean;
  candidati: { filename: string; nota?: string | null }[];
};

export function righeAllegato(note: NotaAgganciata[]): string[] {
  const righe: string[] = [];
  const visti = new Set<string>();
  for (const n of note) {
    if (!n.riguardaDocumenti || !n.candidati.length) continue;
    const c = n.candidati[0];
    const etichetta = (c.nota ?? '').trim() || c.filename.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').trim();
    if (!etichetta) continue;
    const chiave = etichetta.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    righe.push(etichetta);
  }
  return righe;
}

export function bloccoAllegato(note: NotaAgganciata[]): string {
  const righe = righeAllegato(note);
  return righe.length ? ['Allegato:', ...righe.map((r) => `-${r}`)].join('\n') : '';
}
