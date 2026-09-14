// Fornitori cloud autorizzati, lato piattaforma (15.9.2026).
//
// La catena ha questa guardia da settembre (`FORNITORI_AUTORIZZATI` in
// pipeline.py): rifiuta di parlare con un indirizzo fuori lista anche se la
// configurazione glielo indica. Finora la piattaforma non chiamava mai fuori,
// quindi non le serviva; da quando la «domanda medica» esce, le serve — e la
// regola dev'essere la stessa, altrimenti ci sono due porte con due serrature
// diverse.
//
// Si estende con FORNITORI_AUTORIZZATI nel .env (prefissi separati da virgola)
// SOLO dopo aver aggiornato docs/legale/fornitori-cloud.md.

export function listaAutorizzata(): string[] {
  return (process.env.FORNITORI_AUTORIZZATI ?? 'https://api.infomaniak.com/')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// Vero solo se l'indirizzo COMINCIA con uno dei prefissi. Il prefisso porta la
// barra finale apposta: senza, «https://api.infomaniak.com.altro.tld/» la
// passerebbe.
export function fornitoreAutorizzato(url: string, lista: string[] = listaAutorizzata()): boolean {
  const u = (url ?? '').trim();
  if (!u.startsWith('https://')) return false;
  return lista.some((pref) => pref.endsWith('/') && u.startsWith(pref));
}

// Il file di configurazione dei fornitori è `chiave=valore`, una per riga,
// con i commenti a cancelletto. Qui solo il parsing: la lettura del file sta
// dove c'è il filesystem.
export function leggiConf(testo: string): Record<string, string> {
  const fuori: Record<string, string> = {};
  for (const riga of (testo ?? '').split('\n')) {
    const r = riga.trim();
    if (!r || r.startsWith('#') || !r.includes('=')) continue;
    const i = r.indexOf('=');
    const chiave = r.slice(0, i).trim();
    const valore = r.slice(i + 1).trim();
    if (chiave && valore) fuori[chiave] = valore;
  }
  return fuori;
}
