// Il grafo ORGANIZZATIVO dello studio (13.9.2026): ruoli, responsabilità,
// quando si fa che cosa e con quale procedura. La fonte di verità è la pagina
// wiki `docs/wiki/Piattaforma/Organizzazione dello studio.md` (una tabella per
// sezione), letta a runtime dal checkout del server e tenuta in cache 5
// minuti: si cambia la pagina, non il codice. Solo ruoli, mai nomi di
// persone, mai dati clinici. Il parser è puro (`analizzaOrganizzazione`) e
// testato; la lettura del file sta in `caricaOrganizzazione`.
import fs from 'fs';
import path from 'path';

export type Responsabilita = { ruolo: string; cosa: string; quando: string; procedura: string | null; note: string };
export type Servizio = { servizio: string; ruolo: string; dati: string; note: string };
export type Organizzazione = { ruoli: { ruolo: string; descrizione: string }[]; responsabilita: Responsabilita[]; servizi: Servizio[] };

function righeTabella(sezione: string): string[][] {
  return sezione.split('\n')
    .filter((r) => r.trim().startsWith('|'))
    .map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((c, i) => i !== 0 && !c.every((x) => /^:?-+:?$/.test(x)));
}

function sezioneDopo(md: string, titolo: string): string {
  const rx = new RegExp(`^##\\s+${titolo}\\s*$`, 'mi');
  const m = rx.exec(md);
  if (!m) return '';
  const resto = md.slice(m.index + m[0].length);
  const fine = resto.search(/^##\s+/m);
  return fine === -1 ? resto : resto.slice(0, fine);
}

export function analizzaOrganizzazione(md: string): Organizzazione {
  const ruoli = righeTabella(sezioneDopo(md, 'Ruoli')).filter((c) => c.length >= 2).map((c) => ({ ruolo: c[0], descrizione: c[1] }));
  const responsabilita = righeTabella(sezioneDopo(md, 'Responsabilità')).filter((c) => c.length >= 3).map((c) => ({
    ruolo: c[0], cosa: c[1], quando: c[2] ?? '', procedura: c[3] && c[3] !== '—' && c[3] !== '-' ? c[3].replace(/`/g, '') : null, note: c[4] ?? '',
  }));
  const servizi = righeTabella(sezioneDopo(md, 'Servizi e dati')).filter((c) => c.length >= 3).map((c) => ({ servizio: c[0], ruolo: c[1], dati: c[2], note: c[3] ?? '' }));
  return { ruoli, responsabilita, servizi };
}

let cache: { at: number; org: Organizzazione } | null = null;
export const PAGINA_ORGANIZZAZIONE = path.join(process.cwd(), 'docs', 'wiki', 'Piattaforma', 'Organizzazione dello studio.md');

export function caricaOrganizzazione(): Organizzazione {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.org;
  let org: Organizzazione = { ruoli: [], responsabilita: [], servizi: [] };
  try {
    org = analizzaOrganizzazione(fs.readFileSync(PAGINA_ORGANIZZAZIONE, 'utf8'));
  } catch (e) {
    console.error(`[organizzazione] pagina non leggibile: ${(e as Error)?.message ?? e}`);
  }
  cache = { at: Date.now(), org };
  return org;
}

export function responsabileDi(org: Organizzazione, procedura: string): Responsabilita | null {
  return org.responsabilita.find((r) => r.procedura === procedura) ?? null;
}

// Blocco per il prompt del modello locale: chi fa che cosa, in poche righe.
export function organizzazionePerPrompt(org: Organizzazione): string {
  if (!org.responsabilita.length) return '';
  return org.responsabilita.map((r) => `- ${r.ruolo}: ${r.cosa}${r.quando ? ` (${r.quando})` : ''}`).join('\n');
}
