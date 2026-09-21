// Una volta sola, e poi quando serve: scrive patient_id su appuntamenti e
// referti che le regole sanno abbinare (src/lib/pazienti-abbina.ts). Non
// stacca mai niente. Stampa solo conteggi.
//   npx tsx --conditions=react-server --env-file=.env scripts/pazienti-riabbina.ts
import { query } from '../src/lib/db';
import { riabbinaPazienti } from '../src/lib/pazienti-abbina';

async function main() {
  const studi = await query<{ id: string }>(`select id from studios`);
  for (const s of studi) {
    const e = await riabbinaPazienti(s.id);
    const [t] = await query<{ a: string; r: string }>(
      `select (select count(*) filter (where patient_id is not null) || ' su ' || count(*) from appointments where studio_id = $1) as a,
              (select count(*) filter (where patient_id is not null) || ' su ' || count(*) from referti_bozze where studio_id = $1 and stato <> 'scartata') as r`, [s.id]);
    console.log(`studio ${s.id.slice(0, 8)}: abbinati ora appuntamenti=${e.appuntamenti} referti=${e.referti} · totale con cartella: appuntamenti ${t.a}, referti ${t.r}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
