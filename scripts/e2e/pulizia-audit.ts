// Pulizia delle prove end-to-end sul DB DEMO: le righe di audit sono
// immutabili (trigger in 033) e una bozza che ne ha non si può cancellare
// (la FK «on delete set null» è un UPDATE vietato). Solo qui, solo sul demo,
// si spengono i trigger il tempo di togliere le righe delle bozze di prova.
import { pool, query } from '../../src/lib/db';

export async function ultimoTestoAI(bozzaId: string): Promise<string | null> {
  const [a] = await query<{ t: string }>(
    `select content_text as t from audit.artifacts where bozza_id = $1 and producer_type = 'AI' and kind = 'text' and content_text is not null
      order by version_no desc limit 1`, [bozzaId]);
  return a?.t ?? null;
}

export async function togliAudit(ids: string[]): Promise<void> {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('alter table audit.artifacts disable trigger artifacts_immutabili');
    await c.query('alter table audit.human_edits disable trigger human_edits_immutabili');
    // Le misure del lavoro puntano agli artefatti: via prima loro, anche quelle senza bozza scritta
    // (8.10.2026: la pulizia falliva a intermittenza sulla chiave misure_lavoro_from_artifact_id_fkey
    // e lasciava nel demo bozze di prova che facevano fallire il giro dopo).
    await c.query(`delete from audit.misure_lavoro where bozza_id = any($1::uuid[]) or from_artifact_id in (select id from audit.artifacts where bozza_id = any($1::uuid[]))`, [ids]);
    await c.query('delete from audit.pipeline_steps where bozza_id = any($1::uuid[])', [ids]);
    await c.query('delete from audit.human_edits where bozza_id = any($1::uuid[])', [ids]);
    await c.query('delete from audit.artifacts where bozza_id = any($1::uuid[])', [ids]);
    await c.query('delete from audit.pipeline_runs where bozza_id = any($1::uuid[])', [ids]);
    await c.query('alter table audit.artifacts enable trigger artifacts_immutabili');
    await c.query('alter table audit.human_edits enable trigger human_edits_immutabili');
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}
