import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Tassonomia automatica delle correzioni del medico (2026-09-06, analisi dei
// concorrenti: i grandi classificano ogni modifica, non salvano solo «prima
// → dopo»). Diff a livello di parola tra la proposta della catena e il testo
// firmato; ogni modifica riceve una classe dal CODICE:
//   ASR_NUMERIC       cambia un numero
//   ASR_MEDICATION    cambia una parola del registro Swissmedic
//   ASR_NEGATION      compare/sparisce una negazione
//   ASR_LATERALITY    destra/sinistra
//   ASR_TERM          una o due parole sostituite con altre simili (storpiatura)
//   OMISSION_RECOVERY inserita una frase intera (≥ 6 parole)
//   REMOVED           tolta una frase intera
//   FORMAT_ONLY       cambiano solo segni, spazi o maiuscole
//   STYLE             riformulazione senza numeri, farmaci o negazioni
// Solo le classi ASR_* dovrebbero alimentare dizionario e memoria acustica.

export type Modifica = { prima: string; dopo: string; classe: string; origine?: string };

const NEG = /\b(non|nessun[ao]?|senza|assenz[ae]|negativ[oaie]|esclus[oaie]|né)\b/i;
const LAT = /\b(destr[oaie]|sinistr[oaie]|dx|sx)\b/i;

let farmaci: Set<string> | null = null;
function caricaFarmaci(): Set<string> {
  if (farmaci) return farmaci;
  farmaci = new Set();
  try {
    const p = process.env.REFERTI_FARMACI_JSON || path.join(os.homedir(), 'referti-pipeline', 'dati', 'farmaci-ch.json');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const k of Object.keys(d?.nomi ?? {})) if (!k.includes(' ')) farmaci.add(k);
    for (const k of Object.keys(d?.principi ?? {})) if (!k.includes(' ')) farmaci.add(k);
  } catch { /* senza indice: la classe farmaco non si assegna */ }
  return farmaci;
}

function token(s: string): string[] {
  return s.replace(/\r\n/g, '\n').split(/\s+/).filter(Boolean);
}
function nucleo(w: string): string {
  return w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// Blocchi di differenza (LCS su parole normalizzate), con un tetto per non
// far esplodere il costo su testi lunghi: oltre 4000 parole si confronta
// solo il primo tratto.
function blocchi(a: string[], b: string[]): { prima: string[]; dopo: string[] }[] {
  const n = Math.min(a.length, 4000), m = Math.min(b.length, 4000);
  const na = a.slice(0, n).map(nucleo), nb = b.slice(0, m).map(nucleo);
  const dp: Uint16Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { prima: string[]; dopo: string[] }[] = [];
  let i = 0, j = 0, cur: { prima: string[]; dopo: string[] } | null = null;
  const chiudi = () => { if (cur && (cur.prima.length || cur.dopo.length)) out.push(cur); cur = null; };
  while (i < n && j < m) {
    if (na[i] === nb[j]) {
      if (a[i] !== b[j]) { // stessa parola, cambiano solo segni o maiuscole
        if (!cur) cur = { prima: [], dopo: [] };
        cur.prima.push(a[i]); cur.dopo.push(b[j]);
      } else chiudi();
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      if (!cur) cur = { prima: [], dopo: [] };
      cur.prima.push(a[i]); i++;
    } else {
      if (!cur) cur = { prima: [], dopo: [] };
      cur.dopo.push(b[j]); j++;
    }
  }
  while (i < n) { if (!cur) cur = { prima: [], dopo: [] }; cur.prima.push(a[i++]); }
  while (j < m) { if (!cur) cur = { prima: [], dopo: [] }; cur.dopo.push(b[j++]); }
  chiudi();
  return out;
}

export function classifica(prima: string, dopo: string): string {
  const np = prima.toLowerCase(), nd = dopo.toLowerCase();
  const wp = token(prima).map(nucleo).filter(Boolean), wd = token(dopo).map(nucleo).filter(Boolean);
  if (wp.join(' ') === wd.join(' ')) return 'FORMAT_ONLY';
  if ((np.match(/\d/g) ?? []).join('') !== (nd.match(/\d/g) ?? []).join('')) return 'ASR_NUMERIC';
  const f = caricaFarmaci();
  if (wp.some((w) => f.has(w)) !== wd.some((w) => f.has(w)) || wp.filter((w) => f.has(w)).join() !== wd.filter((w) => f.has(w)).join()) return 'ASR_MEDICATION';
  if (NEG.test(np) !== NEG.test(nd)) return 'ASR_NEGATION';
  if (LAT.test(np) !== LAT.test(nd) || (np.match(LAT)?.[0] ?? '') !== (nd.match(LAT)?.[0] ?? '')) return 'ASR_LATERALITY';
  if (wp.length === 0 && wd.length >= 6) return 'OMISSION_RECOVERY';
  if (wd.length === 0 && wp.length >= 6) return 'REMOVED';
  if (wp.length <= 2 && wd.length <= 2) return 'ASR_TERM';
  return 'STYLE';
}

export function tassonomiaModifiche(catena: string, finale: string): { classi: Record<string, number>; modifiche: Modifica[] } {
  const b = blocchi(token(catena), token(finale));
  const classi: Record<string, number> = {};
  const modifiche: Modifica[] = [];
  for (const x of b) {
    const prima = x.prima.join(' '), dopo = x.dopo.join(' ');
    const classe = classifica(prima, dopo);
    classi[classe] = (classi[classe] ?? 0) + 1;
    if (modifiche.length < 60) modifiche.push({ prima: prima.slice(0, 80), dopo: dopo.slice(0, 80), classe });
  }
  return { classi, modifiche };
}


// ——— Lineage degli errori (2026-09-06, quarto documento) ———
// Per una correzione «prima → dopo» del medico, la PRIMA versione della
// catena in cui il valore giusto («dopo») è sparito dice chi ha sbagliato:
//   motori        né whisper (A) né Voxtral (B) l'avevano sentito
//   whisper       B l'aveva, A no, e l'arbitro ha tenuto A
//   arbitro       era in A (o in B) dopo il dizionario, sparito dopo l'arbitro
//   dizionario    era nei grezzi, sparito dopo il dizionario
//   correttore    c'era fino all'arbitro, sparito dopo la correzione
//   bella_copia   c'era dopo la correzione, sparito dopo la bella copia
//   omissione     il medico ha aggiunto testo che non era in nessuna versione
//   stile         solo forma: nessun componente ha «sbagliato»
// Così la correzione alimenta la memoria giusta e non si insegna al
// componente sbagliato.
const ORDINE_VERSIONI = ['grezzo_a', 'grezzo_b', 'dopo_dizionario', 'dopo_arbitro', 'dopo_correzione', 'dopo_bella_copia', 'finale'] as const;

function contiene(testo: string, frammento: string): boolean {
  const n = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const f = n(frammento);
  if (!f) return false;
  return (' ' + n(testo) + ' ').includes(' ' + f + ' ');
}

export function lineage(m: Modifica, versioni: Record<string, string>): string {
  if (m.classe === 'FORMAT_ONLY' || m.classe === 'STYLE') return 'stile';
  if (!m.dopo.trim()) return 'medico_toglie';
  // il valore giusto è il «dopo»: dove c'era?
  const presente = Object.fromEntries(ORDINE_VERSIONI.map((k) => [k, versioni[k] ? contiene(versioni[k], m.dopo) : null]));
  const inA = presente.grezzo_a === true, inB = presente.grezzo_b === true;
  if (!inA && !inB) return m.classe === 'OMISSION_RECOVERY' || !m.prima.trim() ? 'omissione' : 'motori';
  // c'era almeno in un grezzo: prima versione successiva in cui manca
  const dopoArbitro = presente.dopo_arbitro, dopoDiz = presente.dopo_dizionario;
  if (inB && !inA) return dopoArbitro === true ? 'ok_poi_perso' : 'whisper_e_arbitro';
  if (dopoDiz === false) return 'dizionario';
  if (dopoArbitro === false) return 'arbitro';
  if (presente.dopo_correzione === false) return 'correttore';
  if (presente.dopo_bella_copia === false) return 'bella_copia';
  return 'a_valle';
}

export function conLineage(modifiche: Modifica[], versioni: Record<string, string>): { modifiche: Modifica[]; origini: Record<string, number> } {
  const origini: Record<string, number> = {};
  const out = modifiche.map((m) => {
    const o = lineage(m, versioni);
    origini[o] = (origini[o] ?? 0) + 1;
    return { ...m, origine: o };
  });
  return { modifiche: out, origini };
}
