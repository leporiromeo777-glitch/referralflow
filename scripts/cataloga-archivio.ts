// Catalogare gli esami del NAS dello studio (8.10.2026). Legge, non copia e
// non scrive sul NAS. Stampa solo numeri: mai un nome, mai un dato dell'esame.
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/cataloga-archivio.ts <sottocartella> [--prova] [--limite N] [--rifai]
// --prova: non scrive niente nel database, conta soltanto.
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { query, pool } from '../src/lib/db';
import { catalogaTutto } from '../src/lib/imaging-catalogo';
import { leggiConfNas } from '../src/lib/imaging-esterno';

const arg = process.argv.slice(2);
const sotto = arg.find((a) => !a.startsWith('--')) ?? '';
const prova = arg.includes('--prova'), rifai = arg.includes('--rifai');
const limite = Number(arg[arg.indexOf('--limite') + 1]) > 0 && arg.includes('--limite') ? Number(arg[arg.indexOf('--limite') + 1]) : undefined;
const ora = () => new Date().toLocaleTimeString('it-CH');
const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

async function main() {
  if (!sotto) { console.error('Uso: cataloga-archivio.ts <sottocartella> [--prova] [--limite N] [--rifai]'); process.exit(2); }
  const base = process.env.REFERTI_IMAGING_BASE ?? path.join(os.homedir(), 'referti-imaging');
  const conf = leggiConfNas(await fs.readFile(path.join(base, 'archivio-file.conf'), 'utf-8').catch(() => ''));
  if (!conf.radice) { console.error('Manca RADICE in archivio-file.conf: bash mac/installa-nas.sh'); process.exit(2); }
  const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
  if (!studio) throw new Error('nessuno studio');
  console.log(`${ora()} catalogo di «${sotto}»${prova ? ' (PROVA: non scrivo niente)' : ''}${limite ? ` · prime ${limite} cartelle` : ''}`);
  const t0 = Date.now();
  const r = await catalogaTutto(studio.id, conf.radice, sotto, { prova, limite, rifai, avanza: (x, i) =>
    console.log(`${ora()} ${i}/${x.cartelle} cartelle · esami ${x.esami} (nuovi ${x.nuovi}, abbinati ${x.abbinati}) · immagini ${x.immagini} · ${gb(x.byte)} · già fatte ${x.gia_fatte} · vuote ${x.vuote} · errori ${x.errori}`) });
  console.log(`${ora()} FINITO in ${Math.round((Date.now() - t0) / 60000)} min — cartelle ${r.cartelle}: fatte ${r.fatte}, già fatte ${r.gia_fatte}, vuote ${r.vuote}, errori ${r.errori} · esami ${r.esami} (nuovi ${r.nuovi}, abbinati a un paziente ${r.abbinati}) · immagini ${r.immagini} · ${gb(r.byte)} · file non DICOM ${r.non_dicom}${r.interrotto ? ` · INTERROTTO: ${r.interrotto}` : ''}`);
  await pool.end();
  process.exit(r.interrotto ? 1 : 0);
}
main().catch((e) => { console.error(`errore: ${e?.code ?? e?.name ?? 'sconosciuto'}`); process.exit(1); });
