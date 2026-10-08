// Immagini lette dal NAS dello studio (8.10.2026) — la parte PURA.
// Un'immagine catalogata sul NAS ha una chiave «nas:<percorso dentro la cartella
// condivisa>»: il file non è nostro, non si copia, non si sposta, non si cancella.
export const PREFISSO_NAS = 'nas:';
export const eSulNas = (key: string | null | undefined): boolean => typeof key === 'string' && key.startsWith(PREFISSO_NAS);

// Un percorso relativo che non può uscire dalla cartella: niente «..», niente
// barra iniziale, niente caratteri di controllo, niente pezzi vuoti.
export function relativoSicuro(rel: string): string | null {
  const r = String(rel ?? '').replace(/\\/g, '/');
  if (!r || r.startsWith('/') || r.length > 600 || /[\0-\x1f]/.test(r)) return null;
  const pezzi = r.split('/');
  if (pezzi.some((p) => !p || p === '.' || p === '..')) return null;
  return pezzi.join('/');
}
export function chiaveNas(rel: string): string | null {
  const r = relativoSicuro(rel);
  return r ? `${PREFISSO_NAS}${r}` : null;
}
// Dove sta il file, data la radice della cartella collegata. null se la chiave non è valida.
export function percorsoNas(key: string, radice: string): string | null {
  if (!eSulNas(key) || !radice || !radice.startsWith('/')) return null;
  const r = relativoSicuro(key.slice(PREFISSO_NAS.length));
  return r ? `${radice.replace(/\/+$/, '')}/${r}` : null;
}
// ~/referti-imaging/archivio-file.conf: RADICE=/Volumes/…  URL=smb://utente@indirizzo/cartella
// (mai una password: quella sta nel portachiavi del Mac).
export function leggiConfNas(testo: string): { radice: string | null; url: string | null } {
  const v: Record<string, string> = {};
  for (const riga of String(testo ?? '').split('\n')) {
    const t = riga.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    v[t.slice(0, i).trim().toUpperCase()] = t.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  const radice = v.RADICE && v.RADICE.startsWith('/') && !v.RADICE.includes('..') ? v.RADICE.replace(/\/+$/, '') : null;
  const url = v.URL && /^smb:\/\/[^:@/\s]+@[^/\s]+\/[^\s]+$/.test(v.URL) ? v.URL : null;   // utente@host/cartella, senza «:password»
  return { radice, url };
}
