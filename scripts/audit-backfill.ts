// Riempimento dello storico dell'audit dalle bozze già in archivio (9.9.2026).
// Idempotente: salta ciò che è già registrato. Uso: npm run audit-backfill
// (gira con la condizione react-server, così `server-only` è un modulo vuoto).
import { query } from '../src/lib/db';
import { registraCorsa } from '../src/lib/audit/lineage';
import { registraRevisione } from '../src/lib/audit/revisione';

async function main() {
  const bozze = await query<{
    id: string; studio_id: string; stato: string; payload: any; testo_finale: string | null; created_at: string;
    reviewed_at: string | null; reviewed_by: string | null; ruolo: string | null; storage_key: string | null; revisione_stato: unknown;
  }>(
    `select b.id, b.studio_id, b.stato, b.payload, b.testo_finale, b.created_at::text, b.reviewed_at::text, b.reviewed_by,
            u.role as ruolo, a.storage_key, b.revisione_stato
       from referti_bozze b
       left join users u on u.id = b.reviewed_by
       left join lateral (select storage_key from referti_audio where bozza_id = b.id order by created_at desc limit 1) a on true
      order by b.created_at`
  );
  let corse = 0, revisioni = 0, stati = 0;
  for (const b of bozze) {
    const [run] = await query<{ id: number }>('select id from audit.pipeline_runs where bozza_id = $1 limit 1', [b.id]);
    if (!run) {
      const id = await registraCorsa(b.studio_id, b.id, b.payload, { audioStorage: b.storage_key, completatoIl: b.created_at });
      if (id) corse += 1;
    }
    if (b.stato === 'confermata' && b.testo_finale) {
      const [he] = await query<{ id: number }>('select id from audit.human_edits where bozza_id = $1 limit 1', [b.id]);
      if (!he) {
        const r = await registraRevisione({
          studioId: b.studio_id, bozzaId: b.id, userId: b.reviewed_by ?? '00000000-0000-0000-0000-000000000000', ruoloUtente: b.ruolo ?? 'segretaria',
          testo: b.testo_finale, secondi: Number(b.payload?.revisione?.tempo_revisione_s) || null,
          pipelineVersion: b.payload?.versione_catena?.pipeline ?? null, promptVersion: b.payload?.versione_catena?.prompt ?? null,
          medico: b.payload?.medico?.id ?? null, quando: b.reviewed_at,
        });
        if (r) revisioni += 1;
      }
    } else if (b.stato === 'bozza' && !b.payload?.ombra) {
      const r = await query(
        `insert into audit.report_reviews (studio_id, bozza_id, role, status, started_at)
           values ($1, $2, 'SECRETARY', $3, $4) on conflict (bozza_id, role) do nothing returning id`,
        [b.studio_id, b.id, b.revisione_stato ? 'IN_REVIEW' : 'NOT_REVIEWED', b.revisione_stato ? b.created_at : null]);
      stati += r.length;
    }
  }
  console.log(`bozze ${bozze.length} · corse registrate ${corse} · revisioni registrate ${revisioni} · stati ${stati}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
