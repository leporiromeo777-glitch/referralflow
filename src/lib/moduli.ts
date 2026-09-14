// I moduli dello studio in versione digitale (14.9.2026). La fonte di verità
// è la pagina wiki `docs/wiki/Piattaforma/Moduli.md` (un modulo per sezione
// `##`, campi numerati con tipo e obbligatorietà), letta a runtime dal
// checkout del server e tenuta in cache 5 minuti: si cambia la pagina, non il
// codice. Il parser e la validazione sono puri e testati; le compilazioni
// stanno in `moduli_compilazioni` (le risposte sono dati clinici: mai in log).
import fs from 'fs';
import path from 'path';

export type TipoCampo = 'testo' | 'testo_lungo' | 'numero' | 'data' | 'si_no' | 'scelta';
export type CampoModulo = { chiave: string; n: number; etichetta: string; tipo: TipoCampo; opzioni: string[]; obbligatorio: boolean };
export type Modulo = { id: string; codice: string; titolo: string; chi: string; quando: string; nota: string; campi: CampoModulo[] };

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const TIPI: [RegExp, TipoCampo][] = [
  [/^testo lungo$/i, 'testo_lungo'], [/^testo$/i, 'testo'], [/^numero$/i, 'numero'], [/^data$/i, 'data'],
  [/^s[iì]\s*\/\s*no$/i, 'si_no'], [/^scelta\s*:/i, 'scelta'],
];

export function analizzaModuli(md: string): Modulo[] {
  const out: Modulo[] = [];
  const rx = /^##\s+(.+?)\s*$/gm;
  const idx: { titolo: string; a: number; b: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(md))) idx.push({ titolo: m[1], a: m.index, b: m.index + m[0].length });
  for (let i = 0; i < idx.length; i++) {
    const corpo = md.slice(idx[i].b, i + 1 < idx.length ? idx[i + 1].a : md.length);
    const [codiceGrezzo, ...restoTitolo] = idx[i].titolo.split(/\s+—\s+/);
    const codice = restoTitolo.length ? codiceGrezzo.trim() : '';
    const titolo = restoTitolo.length ? restoTitolo.join(' — ').trim() : idx[i].titolo.trim();
    const campiTesto: Record<string, string> = {};
    const campi: CampoModulo[] = [];
    for (const riga of corpo.split('\n')) {
      const c = /^\s*-\s+([A-Za-zÀ-ÿ ]+?)\s*:\s*(.*)$/.exec(riga);
      if (c) { campiTesto[c[1].toLowerCase().trim()] = c[2].trim(); continue; }
      const q = /^\s+(\d+)\.\s+(.+)$/.exec(riga);
      if (!q) continue;
      const parti = q[2].split(/\s+—\s+/).map((x) => x.trim());
      const etichetta = parti[0];
      const tipoTesto = parti[1] ?? 'testo';
      const obbligatorio = parti.slice(2).some((x) => /^obbligator/i.test(x)) || /^obbligator/i.test(parti[1] ?? '');
      let tipo: TipoCampo = 'testo';
      for (const [r, t] of TIPI) if (r.test(tipoTesto)) { tipo = t; break; }
      const opzioni = tipo === 'scelta' ? tipoTesto.replace(/^scelta\s*:\s*/i, '').split('|').map((x) => x.trim()).filter(Boolean) : [];
      campi.push({ chiave: `c${q[1]}`, n: Number(q[1]), etichetta, tipo, opzioni, obbligatorio });
    }
    if (!campi.length) continue;
    out.push({ id: slug(idx[i].titolo), codice, titolo, chi: campiTesto['chi compila'] ?? '', quando: campiTesto.quando ?? '', nota: campiTesto.nota ?? '', campi });
  }
  return out;
}

// Ripulisce e controlla le risposte: torna i dati puliti (solo chiavi del
// modulo, stringhe corte) e gli errori per campo. Non tocca il contenuto.
export function validaCompilazione(modulo: Modulo, dati: Record<string, unknown>): { dati: Record<string, string>; errori: Record<string, string>; completo: boolean } {
  const puliti: Record<string, string> = {};
  const errori: Record<string, string> = {};
  for (const c of modulo.campi) {
    const v = String(dati?.[c.chiave] ?? '').trim().slice(0, c.tipo === 'testo_lungo' ? 4000 : 300);
    if (v) {
      if (c.tipo === 'numero' && !/^-?\d+([.,]\d+)?$/.test(v)) errori[c.chiave] = 'Serve un numero.';
      else if (c.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errori[c.chiave] = 'Serve una data.';
      else if (c.tipo === 'si_no' && !/^(sì|si|no)$/i.test(v)) errori[c.chiave] = 'Serve sì o no.';
      else if (c.tipo === 'scelta' && !c.opzioni.includes(v)) errori[c.chiave] = 'Valore fuori dall’elenco.';
      puliti[c.chiave] = c.tipo === 'si_no' ? (/^no$/i.test(v) ? 'no' : 'sì') : v;
    } else if (c.obbligatorio) errori[c.chiave] = 'Obbligatorio.';
  }
  const completo = Object.keys(errori).length === 0;
  return { dati: puliti, errori, completo };
}

let cache: { at: number; moduli: Modulo[] } | null = null;
export const PAGINA_MODULI = path.join(process.cwd(), 'docs', 'wiki', 'Piattaforma', 'Moduli.md');

export function caricaModuli(): Modulo[] {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.moduli;
  let moduli: Modulo[] = [];
  try {
    moduli = analizzaModuli(fs.readFileSync(PAGINA_MODULI, 'utf8'));
  } catch (e) {
    console.error(`[moduli] pagina non leggibile: ${(e as Error)?.message ?? e}`);
  }
  cache = { at: Date.now(), moduli };
  return moduli;
}
