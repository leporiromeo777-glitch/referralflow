// Solo NUMERI (19.10.2026): nei titoli veri dell'agenda, quanti hanno una nota scritta dopo il nome che ora si separa,
// e di che tipo è la prima parola tolta. Mai testo, mai nomi.
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/misura-note-titolo.ts
import { query, pool } from '../src/lib/db';
import { leggiTitolo } from '../src/lib/agenda-titolo';

async function main() {
const righe = await query<{ t: string }>(`select distinct titolo as t from appointments where titolo is not null`);
let note = 0; const tipo: Record<string, number> = {}; const parole: Record<number, number> = {};
for (const { t } of righe) {
  const r = leggiTitolo(t);
  if (!r.resto) continue;
  note++;
  const w = r.resto.split(/\s+/)[0];
  const k = /\d/.test(w) ? 'cifre' : /\./.test(w) ? 'punto' : /^[a-zà-ÿ]/.test(w) ? 'minuscola' : 'altro';
  tipo[k] = (tipo[k] ?? 0) + 1;
  const n = r.nome.split(/\s+/).length; parole[n] = (parole[n] ?? 0) + 1;
}
console.log(JSON.stringify({ titoli: righe.length, con_nota: note, prima_parola_tolta: tipo, parole_nel_nome_restante: parole }));
await pool.end();
}
void main();
