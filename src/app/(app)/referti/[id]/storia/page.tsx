import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { pezziInLinea, type Operazione } from '@/lib/audit/diff';

export const dynamic = 'force-dynamic';

// Storia e lineage di un referto (9.9.2026, §10, §28-§29, §61-§62): la
// linea del tempo dall'audio alla firma, ogni tappa espandibile (modello,
// versione, prompt, input, output, durata, esito), le versioni con i loro
// genitori e le modifiche umane con il confronto affiancato e in linea.
// Solo utenti dello studio; i testi si vedono qui, mai nella dashboard.

type Corsa = { id: number; attempt: number; status: string; pipeline_version: string | null; started_at: string | null; completed_at: string | null; duration_ms: number | null; failed_step: string | null; error_type: string | null; config: any };
type Tappa = { id: number; run_id: number | null; step_order: number; step_type: string; step_name: string; producer_type: string; model_provider: string | null; model_name: string | null; status: string; error_type: string | null; started_at: string | null; completed_at: string | null; duration_ms: number | null; input_artifact_id: number | null; output_artifact_id: number | null; metadata: any; prompt_name: string | null; prompt_version: string | null };
type Artefatto = { id: number; version_no: number; kind: string; label: string; producer_type: string; content_text: string | null; content_hash: string; words: number | null; created_at: string; genitori: number[] | null };
type Modifica = { id: number; editor_role: string; from_artifact_id: number | null; to_artifact_id: number | null; edit_count: number; insertions: number; deletions: number; replacements: number; words_total: number; edits_per_100_words: number; severity_max: string | null; categories: Record<string, number>; diff: Operazione[]; review_seconds: number | null; created_at: string; revisore: string | null };
type Evento = { azione: string; created_at: string; dettagli: any };

const ora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const durata = (ms: number | null) => (ms === null || ms === undefined ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const RUOLO: Record<string, string> = { AI: 'AI', SYSTEM: 'codice', SECRETARY: 'segretaria', DOCTOR: 'medico' };

export default async function StoriaReferto({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  if (!isUuid(params.id)) notFound();
  const [b] = await query<{ id: string; stato: string; created_at: string; medico: string | null; file_id: string }>(
    'select id, stato, created_at::text, medico, file_id from referti_bozze where id = $1 and studio_id = $2', [params.id, session.studioId]);
  if (!b) notFound();

  const corse = await query<Corsa>(
    `select id, attempt, status, pipeline_version, started_at::text, completed_at::text, duration_ms, failed_step, error_type, config
       from audit.pipeline_runs where bozza_id = $1 or (studio_id = $2 and file_id = $3) order by attempt`, [b.id, session.studioId, b.file_id]);
  const tappe = await query<Tappa>(
    `select s.id, s.run_id, s.step_order, s.step_type, s.step_name, s.producer_type, s.model_provider, s.model_name, s.status, s.error_type,
            s.started_at::text, s.completed_at::text, s.duration_ms, s.input_artifact_id, s.output_artifact_id, s.metadata, p.name as prompt_name, p.version as prompt_version
       from audit.pipeline_steps s left join audit.prompt_versions p on p.id = s.prompt_version_id
      where s.bozza_id = $1 order by s.started_at nulls last, s.step_order`, [b.id]);
  const artefatti = await query<Artefatto>(
    `select a.id, a.version_no, a.kind, a.label, a.producer_type, a.content_text, a.content_hash, a.words, a.created_at::text,
            (select array_agg(parent_artifact_id order by parent_artifact_id) from audit.artifact_parents ap where ap.artifact_id = a.id) as genitori
       from audit.artifacts a where a.bozza_id = $1 order by a.version_no`, [b.id]);
  const modifiche = await query<Modifica>(
    `select h.id, h.editor_role, h.from_artifact_id, h.to_artifact_id, h.edit_count, h.insertions, h.deletions, h.replacements, h.words_total,
            h.edits_per_100_words::float, h.severity_max, h.categories, h.diff, h.review_seconds, h.created_at::text, u.email as revisore
       from audit.human_edits h left join users u on u.id = h.editor_user_id where h.bozza_id = $1 order by h.created_at`, [b.id]);
  const revisioni = await query<{ role: string; status: string; started_at: string | null; completed_at: string | null }>(
    'select role, status, started_at::text, completed_at::text from audit.report_reviews where bozza_id = $1', [b.id]);
  const eventi = await query<Evento>(
    'select azione, created_at::text, dettagli from referti_eventi where bozza_id = $1 order by created_at', [b.id]);
  const art = new Map(artefatti.map((a) => [a.id, a]));
  const versione = (id: number | null) => (id && art.get(id) ? `v${art.get(id)!.version_no} · ${art.get(id)!.label}` : '—');

  // Linea del tempo: tappe, eventi e revisioni fusi per istante.
  type Voce = { quando: string; testo: string; dettaglio?: string };
  const voci: Voce[] = [
    { quando: b.created_at, testo: 'Bozza ricevuta dalla catena' },
    ...tappe.filter((t) => t.started_at).map((t) => ({ quando: t.started_at!, testo: `${t.step_name} (${RUOLO[t.producer_type] ?? t.producer_type}${t.model_name ? `, ${t.model_name}` : ''})`, dettaglio: `${durata(t.duration_ms)}${t.status !== 'SUCCESS' ? ` · ${t.status}` : ''}` })),
    ...revisioni.filter((r) => r.started_at).map((r) => ({ quando: r.started_at!, testo: `Revisione ${RUOLO[r.role]} iniziata` })),
    ...modifiche.map((m) => ({ quando: m.created_at, testo: `Revisione ${RUOLO[m.editor_role]} conclusa`, dettaglio: `${m.edit_count} modifiche` })),
    ...eventi.filter((e) => !['bozza_ricevuta'].includes(e.azione)).map((e) => ({ quando: e.created_at, testo: e.azione.replaceAll('_', ' ') })),
  ].sort((a, c) => a.quando.localeCompare(c.quando));

  return (
    <div className="content">
      <p className="muted small"><Link href={`/referti/${b.id}`}>← Referto</Link> · <Link href="/referti/qualita/pipeline">AI Pipeline → Quality</Link></p>
      <h1>Storia del referto {b.id.slice(0, 8)}</h1>
      <p className="muted">Ogni versione è conservata così com’è nata: chi l’ha prodotta, da cosa deriva, con quale modello e quale prompt. Le modifiche umane sono confrontate con l’ultimo testo dell’AI.</p>

      <div className="aq-cards">
        <div className="aq-card"><div className="aq-n">{corse.length}</div><div className="aq-l">corse della catena {corse.some((c) => c.status === 'FAILED') ? '(con tentativi falliti)' : ''}</div></div>
        <div className="aq-card"><div className="aq-n">{artefatti.length}</div><div className="aq-l">versioni conservate</div></div>
        {modifiche.map((m) => (
          <div className="aq-card" key={m.id}><div className="aq-n">{m.edit_count}</div><div className="aq-l">modifiche {RUOLO[m.editor_role]} · {m.edits_per_100_words.toFixed(1)} per 100 parole · {m.severity_max ?? '—'}</div></div>
        ))}
        {revisioni.map((r) => (
          <div className="aq-card" key={r.role}><div className="aq-n" style={{ fontSize: 16 }}>{r.status.replaceAll('_', ' ').toLowerCase()}</div><div className="aq-l">stato revisione {RUOLO[r.role]}</div></div>
        ))}
      </div>

      <div className="card">
        <h2>Linea del tempo</h2>
        <ol className="aq-timeline">
          {voci.map((v, i) => <li key={i}><span className="aq-quando">{ora(v.quando)}</span> {v.testo}{v.dettaglio ? <span className="muted small"> · {v.dettaglio}</span> : null}</li>)}
        </ol>
      </div>

      {corse.map((c) => (
        <div className="card" key={c.id}>
          <h2>Corsa {c.attempt} · {c.status === 'SUCCESS' ? 'riuscita' : c.status === 'FAILED' ? `fallita in ${c.failed_step ?? '?'} (${c.error_type ?? '?'})` : c.status}</h2>
          <p className="muted small">catena {c.pipeline_version ?? '—'} · dal {ora(c.started_at)} al {ora(c.completed_at)} · {durata(c.duration_ms)} · modelli: {Object.entries(c.config?.modelli ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || '—'} · prompt {c.config?.prompt ?? '—'} · dizionario {c.config?.dizionario ?? '—'}</p>
          {tappe.filter((t) => t.run_id === c.id).map((t) => (
            <details key={t.id} className="aq-tappa">
              <summary><strong>{t.step_order}. {t.step_name}</strong> <span className="muted small">{RUOLO[t.producer_type]}{t.model_name ? ` · ${t.model_name}` : ''} · {durata(t.duration_ms)} · {t.status}</span></summary>
              <table className="aq-tab"><tbody>
                <tr><td>tipo</td><td>{t.step_type}</td></tr>
                <tr><td>modello</td><td>{t.model_name ? `${t.model_name} (${t.model_provider})` : '—'}</td></tr>
                <tr><td>prompt</td><td>{t.prompt_name ? `${t.prompt_name} · versione ${t.prompt_version}` : '—'}</td></tr>
                <tr><td>inizio / fine</td><td>{ora(t.started_at)} → {ora(t.completed_at)}</td></tr>
                <tr><td>ingresso</td><td>{versione(t.input_artifact_id)}</td></tr>
                <tr><td>uscita</td><td>{versione(t.output_artifact_id)}</td></tr>
                {t.error_type && <tr><td>errore</td><td>{t.error_type}</td></tr>}
                {Object.keys(t.metadata ?? {}).length > 0 && <tr><td>dettagli</td><td className="small">{Object.entries(t.metadata).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</td></tr>}
              </tbody></table>
              {t.output_artifact_id && art.get(t.output_artifact_id)?.content_text && (
                <details><summary className="small">Testo prodotto ({art.get(t.output_artifact_id)!.words ?? '?'} parole)</summary><pre className="aq-testo">{art.get(t.output_artifact_id)!.content_text}</pre></details>
              )}
            </details>
          ))}
        </div>
      ))}

      {/* Tappe fuori dalla corsa (impaginazione AI dell'app) */}
      {tappe.some((t) => t.run_id === null || !corse.some((c) => c.id === t.run_id)) && (
        <div className="card">
          <h2>Tappe eseguite dall’applicazione</h2>
          {tappe.filter((t) => t.run_id === null || !corse.some((c) => c.id === t.run_id)).map((t) => (
            <details key={t.id} className="aq-tappa">
              <summary><strong>{t.step_name}</strong> <span className="muted small">{t.model_name ?? ''} · {durata(t.duration_ms)} · {t.status}{t.error_type ? ` (${t.error_type})` : ''}</span></summary>
              <table className="aq-tab"><tbody>
                <tr><td>prompt</td><td>{t.prompt_name ? `${t.prompt_name} · versione ${t.prompt_version}` : '—'}</td></tr>
                <tr><td>ingresso</td><td>{versione(t.input_artifact_id)}</td></tr>
                <tr><td>uscita</td><td>{versione(t.output_artifact_id)}</td></tr>
                {Object.keys(t.metadata ?? {}).length > 0 && <tr><td>dettagli</td><td className="small">{JSON.stringify(t.metadata)}</td></tr>}
              </tbody></table>
            </details>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Versioni e provenienza</h2>
        <table className="aq-tab"><thead><tr><th>v</th><th>etichetta</th><th>chi</th><th>parole</th><th>deriva da</th><th>impronta</th><th>quando</th></tr></thead>
          <tbody>{artefatti.map((a) => (
            <tr key={a.id}><td>v{a.version_no}</td><td>{a.label}</td><td>{RUOLO[a.producer_type]}</td><td>{a.words ?? (a.kind === 'audio' ? 'audio' : '—')}</td>
              <td>{(a.genitori ?? []).map((g) => `v${art.get(g)?.version_no ?? '?'}`).join(', ') || '—'}</td><td className="small">{a.content_hash.slice(0, 12)}</td><td className="small">{ora(a.created_at)}</td></tr>
          ))}</tbody></table>
      </div>

      {modifiche.map((m) => {
        const da = m.from_artifact_id ? art.get(m.from_artifact_id) : null;
        const a = m.to_artifact_id ? art.get(m.to_artifact_id) : null;
        const pezzi = da?.content_text && a?.content_text ? pezziInLinea(da.content_text, a.content_text) : [];
        return (
          <div className="card" key={m.id}>
            <h2>Modifiche {RUOLO[m.editor_role]}{m.revisore ? ` (${m.revisore})` : ''}: {m.edit_count}</h2>
            <p className="muted small">{m.insertions} inserimenti · {m.deletions} cancellazioni · {m.replacements} sostituzioni · {m.words_total} parole · {m.edits_per_100_words.toFixed(2)} per 100 · gravità massima {m.severity_max ?? '—'} · {m.review_seconds ? `${Math.round(m.review_seconds / 60)} min di revisione` : ''} · categorie: {Object.entries(m.categories).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}</p>
            {m.diff.length > 0 && (
              <table className="aq-tab"><thead><tr><th>#</th><th>tipo</th><th>prima (AI)</th><th>dopo ({RUOLO[m.editor_role]})</th><th>categoria</th><th>gravità</th><th>contesto</th></tr></thead>
                <tbody>{m.diff.map((o, i) => (
                  <tr key={i} className={o.severita === 'CRITICAL' ? 'aq-outlier' : ''}><td>{i + 1}</td><td>{o.kind}</td><td><s>{o.from}</s></td><td><strong>{o.to}</strong></td><td>{o.categoria}</td><td>{o.severita}</td><td className="small muted">…{o.contesto}…</td></tr>
                ))}</tbody></table>
            )}
            {pezzi.length > 0 && (
              <>
                <h3>In linea</h3>
                <p className="aq-inline">{pezzi.map((p, i) => p.tipo === 'uguale' ? <span key={i}>{p.testo} </span> : p.tipo === 'tolto' ? <mark key={i} className="aq-tolto">{p.testo}</mark> : <mark key={i} className="aq-aggiunto">{p.testo}</mark>)}</p>
                <h3>Affiancate</h3>
                <div className="aq-due"><div><h4>Versione AI (v{da?.version_no})</h4><pre className="aq-testo">{da?.content_text}</pre></div><div><h4>Versione {RUOLO[m.editor_role]} (v{a?.version_no})</h4><pre className="aq-testo">{a?.content_text}</pre></div></div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
