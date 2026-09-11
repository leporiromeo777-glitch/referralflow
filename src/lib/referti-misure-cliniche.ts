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

/** Vero se ogni misura presente in ENTRAMBI i testi ha gli stessi valori
 * (a prescindere dall'ordine). Una misura riconosciuta da una parte sola
 * non è uno scambio: il dettato dice «frequenza 64 battiti» e la lettera
 * «FC 64 bpm», e l'espressione della frequenza aggancia solo la seconda
 * (visto al banco di forma il 12.9.2026: la lettera giusta veniva
 * scartata). I numeri in sé li protegge già la firma numerica. */
export function relazioniIntatte(prima: string, dopo: string): boolean {
  const a = misureCliniche(prima);
  const b = misureCliniche(dopo);
  for (const n of Object.keys(a)) {
    if (!(n in b)) continue;
    const x = [...a[n]].sort().join('|');
    const y = [...b[n]].sort().join('|');
    if (x !== y) return false;
  }
  return true;
}
