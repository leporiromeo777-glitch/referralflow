// Le date con i punti, non con la barra (20.10.2026, richiesta dello studio: «tutte le date della trascrizione con i
// punti»): «12/03/2024» → «12.03.2024», «3/4/24» → «3.4.24», «03/2024» → «03.2024». Solo ciò che è una data: giorno
// 1-31, mese 1-12, anno di 2 o 4 cifre (o mese/anno a 4 cifre); la pressione «130/80», le frazioni «1/2», «3/5» no.
// La lunghezza del testo non cambia. È la stessa regola della catena (`date_coi_punti` in pipeline.py). PURO.
const DATA = /(?<![\d/.,])(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(\d{4}|\d{2})(?![\d/])/g;
const MESE_ANNO = /(?<![\d/.,])(0?[1-9]|1[0-2])\/((?:19|20)\d{2})(?![\d/])/g;

export function dateColPunto(testo: string): string {
  const t = String(testo ?? '');
  if (!t.includes('/')) return t;
  return t.replace(DATA, '$1.$2.$3').replace(MESE_ANNO, '$1.$2');
}
