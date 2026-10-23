import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { indicizza, pezziDaPagina, type Indice } from './guida';

// La conoscenza di Cleo letta dalla wiki (23.10.2026, [[Guida/Cleo]]): la guida d'uso (`docs/wiki/Guida/`, peso pieno)
// e la documentazione di come funziona il software (Piattaforma, Catena, Regole, Glossario: peso minore, perché è
// scritta per chi lo costruisce). Si rilegge da sola quando una pagina cambia (si guarda l'ora dei file al più ogni
// minuto). Niente dati clinici: la wiki non ne contiene.
const WIKI = path.join(process.cwd(), 'docs/wiki');
const FONTI: { cartella: string; peso: number }[] = [
  { cartella: 'Guida', peso: 1 }, { cartella: 'Piattaforma', peso: 0.6 }, { cartella: 'Catena', peso: 0.5 },
  { cartella: 'Regole', peso: 0.5 }, { cartella: '.', peso: 0.5 },
];
let cache: { firma: string; indice: Indice; quando: number } | null = null;

async function fileDi(cartella: string): Promise<string[]> {
  const dir = path.join(WIKI, cartella);
  const voci = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return voci.filter((v) => v.isFile() && v.name.endsWith('.md') && (cartella !== '.' || v.name === 'Glossario.md')).map((v) => path.join(dir, v.name));
}

export async function indiceGuida(): Promise<Indice> {
  if (cache && Date.now() - cache.quando < 60_000) return cache.indice;
  const tutti: { file: string; peso: number; mtime: number }[] = [];
  for (const f of FONTI) for (const file of await fileDi(f.cartella)) {
    const st = await fs.stat(file).catch(() => null);
    if (st) tutti.push({ file, peso: f.peso, mtime: st.mtimeMs });
  }
  const firma = tutti.map((x) => `${x.file}:${x.mtime}`).join('|');
  if (cache && cache.firma === firma) { cache.quando = Date.now(); return cache.indice; }
  const pezzi = [];
  for (const x of tutti) pezzi.push(...pezziDaPagina(path.relative(WIKI, x.file), await fs.readFile(x.file, 'utf-8').catch(() => ''), x.peso));
  cache = { firma, indice: indicizza(pezzi), quando: Date.now() };
  console.log(`[guida] conoscenza di Cleo: ${tutti.length} pagine, ${pezzi.length} pezzi`);
  return cache.indice;
}
