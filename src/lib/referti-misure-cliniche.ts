// Misure cliniche del profilo di specialità (pipeline-referti/profilo-
// cardiologia.json, le stesse 19 espressioni della catena): concetto → tutti
// i valori trovati nel testo. Serve al «lucchetto delle relazioni» (Ricerca
// 18 §7): una riscrittura può conservare tutti i numeri e scambiarli tra due
// concetti; la firma numerica «multinsieme» non se ne accorge, il confronto
// per misura sì. Solo lettura, nessun contenuto clinico in log.
import fs from 'fs';
import os from 'os';
import path from 'path';

type Misura = { nome: string; rx: RegExp };
let cache: Misura[] | null = null;

function carica(): Misura[] {
  if (cache) return cache;
  const candidati = [
    process.env.REFERTI_PROFILO_JSON,
    path.join(os.homedir(), 'referti-pipeline', 'profilo-cardiologia.json'),
    path.join(process.cwd(), 'pipeline-referti', 'profilo-cardiologia.json'),
  ].filter((x): x is string => !!x);
  const fuori: Misura[] = [];
  for (const p of candidati) {
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const m of Array.isArray(d?.misure) ? d.misure : []) {
        if (!m || typeof m.nome !== 'string' || typeof m.regex !== 'string') continue;
        try {
          fuori.push({ nome: m.nome, rx: new RegExp(m.regex, 'gi') });
        } catch {
          // un'espressione non traducibile in JS si salta: meglio un
          // lucchetto con una misura in meno che nessun lucchetto
        }
      }
      if (fuori.length) break;
    } catch {
      // prossimo candidato
    }
  }
  cache = fuori;
  return fuori;
}

/** Tutti i valori di ogni misura, nell'ordine del testo (normalizzati: senza spazi, punto decimale). */
export function misureCliniche(testo: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { nome, rx } of carica()) {
    rx.lastIndex = 0;
    const vals: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(testo)) !== null) {
      if (m[1]) vals.push(m[1].replace(/\s+/g, '').replace(',', '.'));
      if (m[0] === '') rx.lastIndex++;
    }
    if (vals.length) out[nome] = vals;
  }
  return out;
}

// Una misura riconosciuta da una parte sola non è uno scambio: il dettato
// dice «frequenza 64 battiti» e la lettera «FC 64 bpm», e l'espressione
// aggancia solo la seconda (banco di forma del 12.9.2026).
// Una misura «diverge» solo se la lettera le attribuisce un valore che il
// dettato NON le attribuiva (uno scambio: FE 55 e FEVD 45 → FE 45 e FEVD 55,
// o FE 60 → FE 50). Se invece la lettera riformula la frase e l'espressione
// non aggancia più uno dei valori («frequenza cardiaca 50 e 99 bpm» →
// «bradicardia a 50 bpm, FC 99 bpm»), il valore non è cambiato: il numero
// in sé lo protegge già la firma numerica (14.9.2026: una lettera con tutti
// i numeri giusti veniva scartata per questo, e sembrava un modello diverso).
export function misureDivergenti(prima: string, dopo: string): string[] {
  const a = misureCliniche(prima);
  const b = misureCliniche(dopo);
  const out: string[] = [];
  for (const n of Object.keys(a)) {
    if (!(n in b)) continue;
    const conta = (vals: string[]) => vals.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
    const ca = conta(a[n]), cb = conta(b[n]);
    const nuovi = [...cb].some(([v, k]) => k > (ca.get(v) ?? 0));
    if (nuovi) out.push(`${n}: ${a[n].join(', ')} → ${b[n].join(', ')}`);
  }
  return out;
}

/** Vero se nessuna misura riconosciuta in ENTRAMBI i testi riceve nella
 * lettera un valore che nel dettato non aveva (vedi `misureDivergenti`). */
export function relazioniIntatte(prima: string, dopo: string): boolean {
  return misureDivergenti(prima, dopo).length === 0;
}
