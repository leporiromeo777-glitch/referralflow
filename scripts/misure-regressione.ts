// Regressione fra versioni del motore (MSE fase 8, punto 16 della specifica).
//
// Ogni misura salvata porta i suoi punti e la calibrazione usata: qui si
// ricalcola TUTTO con il motore attuale e si confronta col valore in tabella.
// Una differenza oltre la tolleranza tecnica vuol dire che un aggiornamento
// ha cambiato i numeri di studi vecchi — e allora non si distribuisce
// (mac/aggiorna-server.sh lo lancia prima di riavviare).
//
//   npx tsx --env-file=.env scripts/misure-regressione.ts
// Solo numeri: nessun dato clinico entra o esce.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Pool } from 'pg';

async function main() {
  const c: any = {};
  for (const m of ['mse/geometria.js', 'mse/misure.js', 'mse/validazione.js', 'mse/serie.js']) {
    vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public', 'prototipo', m), 'utf-8'), c, { filename: m });
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `select id, tipo, punti, valore, extra, calibrazione, versione_calcolo, stato_validazione, avvisi from imaging_misure_manuali where annullata_at is null order by created_at`);
  let uguali = 0; const diverse: string[] = [];
  for (const r of rows) {
    let v: number | null;
    if (r.tipo === 'distanza_3d' || r.tipo === 'volume') v = c.RFMSE.misure.ricalcolaDaExtra(r.tipo, r.extra);
    else {
      const e = c.RFMSE.validazione.valuta({ cal: r.calibrazione, punti: r.punti, algoritmo: r.tipo || 'distanza', cautionValidati: Array.isArray(r.avvisi) ? r.avvisi : [] });   // gli avvisi accettati allora restano accettati ora
      v = e.ok ? (r.tipo === 'punto' ? Number(e.extra?.x_mm) : e.valore) : null;
    }
    const salvato = r.tipo === 'punto' ? Number(r.extra?.x_mm) : Number(r.valore);
    const tol = 1e-9 * Math.max(1, Math.abs(salvato));
    if (v === null || Math.abs(v - salvato) > tol) diverse.push(`${r.id.slice(0, 8)} ${r.tipo} salvato=${salvato} (v${r.versione_calcolo}) attuale=${v ?? 'non ricalcolabile'}`);
    else uguali++;
  }
  await pool.end();
  console.log(`misure-regressione: ${rows.length} misure, ${uguali} uguali, ${diverse.length} diverse (motore ${c.RFMSE.misure.ALGORITMI.distanza.versione}, gate ${c.RFMSE.validazione.VERSIONE})`);
  for (const d of diverse.slice(0, 20)) console.log('  ' + d);
  if (diverse.length) { console.log('BLOCCO: il motore attuale cambia numeri già salvati'); process.exit(1); }
  console.log('TUTTO OK');
}
main().catch((e) => { console.error('misure-regressione: ' + (e?.message ?? e)); process.exit(2); });
