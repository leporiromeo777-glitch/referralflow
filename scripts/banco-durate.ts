// Banco delle durate (16.9.2026, Piattaforma/Orchestrazione sale §9, fase 5).
//
// La mediana per (prestazione, medico) contro un modello predittivo semplice
// (regressione con prestazione, medico, ora del giorno, prima visita),
// valutati «a uno fuori»: per ogni osservazione si stima con tutte le altre
// e si misura l'errore. Il predittivo entra solo se riduce l'errore mediano
// di almeno un minuto. Senza abbastanza dati lo dice, e non conclude niente.
//
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/banco-durate.ts
import { query } from '@/lib/db';
import { stimaDurata, type Osservazione } from '@/lib/orchestrazione/previsione';

function regressione(oss: Osservazione[], target: Osservazione): number | null {
  // Caratteristiche: 1, prestazione (one-hot), medico (one-hot), ora/60, primaVisita. Ridge con λ=1.
  const prest = [...new Set(oss.map((o) => o.prestazione))], med = [...new Set(oss.map((o) => o.medico))];
  const x = (o: Osservazione) => [1, ...prest.map((p) => (p === o.prestazione ? 1 : 0)), ...med.map((m) => (m === o.medico ? 1 : 0)), o.ora / 60, o.primaVisita ? 1 : 0];
  const X = oss.map(x), y = oss.map((o) => o.minuti); const d = X[0].length;
  if (oss.length < d + 5) return null;
  const A = Array.from({ length: d }, () => new Array(d).fill(0)); const b = new Array(d).fill(0);
  for (let i = 0; i < X.length; i++) for (let r = 0; r < d; r++) { b[r] += X[i][r] * y[i]; for (let c = 0; c < d; c++) A[r][c] += X[i][r] * X[i][c]; }
  for (let r = 0; r < d; r++) A[r][r] += 1;
  // Gauss
  for (let c = 0; c < d; c++) {
    let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-9) return null;
    for (let r = 0; r < d; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < d; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const w = b.map((v, i) => v / A[i][i]);
  const xt = x(target); return xt.reduce((s, v, i) => s + v * w[i], 0);
}
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

async function main() {
  const oss = await query<Osservazione>(`select prestazione, medico, ora, minuti, prima_visita as "primaVisita" from durate_osservate where giorno > current_date - 180`);
  console.log(`Banco durate · ${oss.length} osservazioni`);
  if (oss.length < 40) { console.log('Troppo poche per dire qualcosa (ne servono almeno 40): il predittivo resta spento, vale la mediana.'); return; }
  const errMed: number[] = [], errReg: number[] = [], errCat: number[] = [];
  for (let i = 0; i < oss.length; i++) {
    const altre = oss.filter((_, j) => j !== i); const o = oss[i];
    const m = stimaDurata({ prestazione: o.prestazione, medico: o.medico, ora: o.ora, catalogo: 20, osservate: altre, conOra: true, primaVisita: o.primaVisita }).minuti;
    errMed.push(Math.abs(m - o.minuti));
    const r = regressione(altre, o); if (r != null) errReg.push(Math.abs(Math.round(r) - o.minuti));
    errCat.push(Math.abs(20 - o.minuti));
  }
  console.log(`| stima | errore mediano | errore medio |\n| --- | --- | --- |`);
  console.log(`| catalogo (20) | ${mediana(errCat).toFixed(1)} | ${(errCat.reduce((a, b) => a + b, 0) / errCat.length).toFixed(1)} |`);
  console.log(`| mediana (quella in uso) | ${mediana(errMed).toFixed(1)} | ${(errMed.reduce((a, b) => a + b, 0) / errMed.length).toFixed(1)} |`);
  if (errReg.length) console.log(`| regressione | ${mediana(errReg).toFixed(1)} | ${(errReg.reduce((a, b) => a + b, 0) / errReg.length).toFixed(1)} |`);
  const guadagno = errReg.length ? mediana(errMed) - mediana(errReg) : 0;
  console.log(guadagno >= 1 ? `\nIl predittivo batte la mediana di ${guadagno.toFixed(1)} min: si può accendere (ORCHESTRAZIONE_PREDITTIVO=1).` : `\nIl predittivo NON batte la mediana di almeno un minuto (${guadagno.toFixed(1)}): resta spento.`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
