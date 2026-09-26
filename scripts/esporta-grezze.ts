// «Trascrizioni grezze»: i dettati nuovi li scrive da sola la piattaforma.
// Questo script serve per quelli già arrivati. Solo conteggi.
//   senza argomenti → aggiorna solo le sottocartelle che ci sono già
//                     (aggiunge i Word mancanti, toglie gli audio)
//   con un numero   → anche i dettati della cartella degli ultimi N giorni
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/esporta-grezze.ts [giorni]
import { promises as fs } from 'fs';
import { query, pool } from '../src/lib/db';
import { cartellaGrezze, esportaGrezza } from '../src/lib/esporta-grezze';

async function main() {
  const giorni = process.argv[2] ? Number(process.argv[2]) : null;
  let ids: string[];
  if (giorni) {
    ids = (await query<{ id: string }>(
      `select distinct b.id from referti_bozze b join referti_audio a on a.bozza_id = b.id and a.filename like 'dettato.%'
        where b.created_at > now() - make_interval(days => $1) order by b.id`, [giorni])).map((r) => r.id);
  } else {
    let voci: string[] = [];
    try { voci = await fs.readdir(cartellaGrezze()); } catch { /* cartella assente */ }
    const prefissi = voci.map((v) => /· ([0-9a-f]{6})$/.exec(v)?.[1]).filter((x): x is string => !!x);
    ids = prefissi.length ? (await query<{ id: string }>(
      `select id from referti_bozze where left(replace(id::text, '-', ''), 6) = any($1::text[])`, [prefissi])).map((r) => r.id) : [];
    if (ids.length !== prefissi.length) console.log(`attenzione: ${prefissi.length} sottocartelle, ${ids.length} bozze trovate`);
  }
  const conta: Record<string, number> = {};
  for (const id of ids) { const e = await esportaGrezza(id); conta[e] = (conta[e] ?? 0) + 1; }
  console.log(`${ids.length} dettati ${giorni ? `degli ultimi ${giorni} giorni` : 'già in cartella'} →`, conta, '·', cartellaGrezze());
  await pool.end();
}
main().catch((e) => { console.error(e?.code ?? e?.message ?? e); process.exit(1); });
