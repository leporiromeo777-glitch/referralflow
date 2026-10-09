// Avvio del server (6.10.2026): parte il motore del monitoraggio remoto, che
// acquisisce, valuta le regole e genera gli avvisi ogni 5 secondi DENTRO il
// server — senza dipendere da una scheda del browser aperta.
// Si spegne con MONITORAGGIO_MOTORE=spento (le prove end-to-end lo fanno, e
// fanno scorrere il tempo a mano).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.MONITORAGGIO_MOTORE !== 'spento') {
    const { avviaMotore } = await import('./lib/monitoraggio/motore');
    avviaMotore();
  }
  // La cartella condivisa della pressione (8.10.2026): un file messo lì viene letto da solo.
  // Si spegne con PRESSIONE_CARTELLA_GIRO=spento (le prove chiamano il giro a mano).
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.PRESSIONE_CARTELLA_GIRO !== 'spento') {
    const { avviaCartella } = await import('./lib/pressione/cartella-server');
    avviaCartella();
  }
  // I referti PDF della ciclo (9.10.2026): arrivano in «Ciclo da leggere/referti» e vanno nella cartella del paziente.
  // Si spegne con CICLO_CARTELLA_GIRO=spento (le prove chiamano il giro a mano).
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.CICLO_CARTELLA_GIRO !== 'spento') {
    const { avviaCiclo } = await import('./lib/ciclo/cartella-server');
    avviaCiclo();
  }
}
