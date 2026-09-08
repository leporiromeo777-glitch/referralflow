import Link from 'next/link';
import { redirect } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { mediaMobile, statistiche, outlier, punteggioQualita } from '@/lib/audit/metriche';
import { registraRilascio } from '@/lib/audit/lineage';
import { annotaRilascio } from './actions';

export const dynamic = 'force-dynamic';

// AI Pipeline → Quality (9.9.2026, §24-§35, §58-§60). Un punto per referto:
// l'altezza è il numero di correzioni della SEGRETARIA rispetto all'ultimo
// output AI. Sopra, la media mobile; le linee verticali sono i rilasci.
// Le trasformazioni AI→AI e le modifiche del medico NON entrano qui. La
// metrica si chiama «tasso di intervento umano», non «accuratezza clinica».

type Punto = {
  id: number; bozza_id: string; created_at: string; edit_count: number; edits_per_100_words: number; words_total: number;
  severity_max: string | null; pipeline_version: string | null; prompt_version: string | null; medico: string | null;
  review_seconds: number | null; doctor_edits: number | null; tipo: string; revisore: string | null;
};
type Filtri = { da?: string; a?: string; medico?: string; pipeline?: string; prompt?: string; revisore?: string; finestra?: string; avanzata?: string };

const dataCh = (iso: string) => new Date(iso).toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
const n2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 100) / 100));
const pct = (num: number, den: number) => (den ? `${Math.round((num / den) * 1000) / 10}%` : '—');

export default async function QualitaPipeline({ searchParams }: { searchParams: Filtri }) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const proprietario = process.env.PLATFORM_OWNER_EMAIL && session.email?.toLowerCase() === process.env.PLATFORM_OWNER_EMAIL.toLowerCase();
  if (session.role !== 'admin' && !proprietario) redirect('/referti');
  const studioId = session.studioId;

  // Rilascio dell'app (build in servizio): registrato alla prima visita.
  try { registraRilascio(studioId, 'app', fs.readFileSync(path.join(process.cwd(), '.build-stamp'), 'utf8').trim().slice(0, 12)); } catch { /* senza build-stamp */ }

  const cond: string[] = ['h.studio_id = $1', "h.editor_role = 'SECRETARY'"];
  const par: unknown[] = [studioId];
  const agg = (sql: string, v: unknown) => { par.push(v); cond.push(sql.replace('?', `$${par.length}`)); };
  if (searchParams.da && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.da)) agg('h.created_at >= ?::date', searchParams.da);
  if (searchParams.a && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.a)) agg("h.created_at < ?::date + interval '1 day'", searchParams.a);
  if (searchParams.medico) agg('h.medico = ?', searchParams.medico.slice(0, 40));
  if (searchParams.pipeline) agg('h.pipeline_version = ?', searchParams.pipeline.slice(0, 40));
  if (searchParams.prompt) agg('h.prompt_version = ?', searchParams.prompt.slice(0, 40));
  if (searchParams.revisore) agg('u.email = ?', searchParams.revisore.slice(0, 120));

  const punti = await query<Punto>(
    `select h.id, h.bozza_id, h.created_at::text, h.edit_count, h.edits_per_100_words::float, h.words_total, h.severity_max,
            h.pipeline_version, h.prompt_version, h.medico, h.review_seconds, b.tipo, u.email as revisore,
            (select d.edit_count from audit.human_edits d where d.bozza_id = h.bozza_id and d.editor_role = 'DOCTOR' order by d.created_at desc limit 1) as doctor_edits
       from audit.human_edits h
       join referti_bozze b on b.id = h.bozza_id
       left join users u on u.id = h.editor_user_id
      where ${cond.join(' and ')}
      order by h.created_at`, par);
  const valori = punti.map((p) => p.edit_count);
  const finestraRichiesta = Number(searchParams.finestra);
  const finestra = [10, 25, 50, 100].includes(finestraRichiesta) ? finestraRichiesta : (punti.length >= 100 ? 50 : 20);
  const media = mediaMobile(valori, finestra);
  const anomali = outlier(valori);
  const st = statistiche(valori);
  const per100 = statistiche(punti.map((p) => p.edits_per_100_words));
  const zeroTouch = punti.filter((p) => p.edit_count === 0).length;

  const [stati] = await query<{ non_rivisti: number; in_revisione: number }>(
    `select count(*) filter (where status = 'NOT_REVIEWED')::int as non_rivisti, count(*) filter (where status = 'IN_REVIEW')::int as in_revisione
       from audit.report_reviews where studio_id = $1 and role = 'SECRETARY'`, [studioId]);
  const trend = (giorni: number) => {
    const ora = Date.now(), g = giorni * 86400000;
    const rec = punti.filter((p) => ora - new Date(p.created_at).getTime() < g).map((p) => p.edit_count);
    const prec = punti.filter((p) => { const d = ora - new Date(p.created_at).getTime(); return d >= g && d < 2 * g; }).map((p) => p.edit_count);
    if (rec.length < 3 || prec.length < 3) return null;
    const m1 = rec.reduce((s, v) => s + v, 0) / rec.length, m0 = prec.reduce((s, v) => s + v, 0) / prec.length;
    return m0 ? Math.round(((m1 - m0) / m0) * 100) : null;
  };
  const gruppo = (chiave: (p: Punto) => string | null) => {
    const m = new Map<string, number[]>();
    for (const p of punti) { const k = chiave(p) ?? '—'; m.set(k, [...(m.get(k) ?? []), p.edit_count]); }
    return [...m.entries()].map(([k, v]) => ({ k, ...statistiche(v) })).sort((a, b) => b.n - a.n);
  };
  const perPipeline = gruppo((p) => p.pipeline_version);
  const perPrompt = gruppo((p) => p.prompt_version);
  const perMedico = gruppo((p) => p.medico);
  const perMese = gruppo((p) => p.created_at.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k));

  const rilasci = await query<{ id: number; kind: string; version: string; released_at: string; note: string | null }>(
    `select id, kind, version, released_at::text, note from audit.deployments where studio_id = $1 or studio_id is null order by released_at`, [studioId]);
  const errori = await query<{ file_id: string; attempt: number; failed_step: string | null; error_type: string | null; created_at: string }>(
    `select file_id, attempt, failed_step, error_type, created_at::text from audit.pipeline_runs where studio_id = $1 and status = 'FAILED' order by created_at desc limit 20`, [studioId]);
  const [errN] = await query<{ n: number; tot: number }>(
    `select count(*) filter (where status = 'FAILED')::int as n, count(*)::int as tot from audit.pipeline_runs where studio_id = $1`, [studioId]);
  const latenze = searchParams.avanzata ? await query<{ step_name: string; media_ms: number; n: number }>(
    `select s.step_name, avg(s.duration_ms)::int as media_ms, count(*)::int as n
       from audit.pipeline_steps s join audit.pipeline_runs r on r.id = s.run_id
      where r.studio_id = $1 and r.status = 'SUCCESS' and r.created_at > now() - interval '90 days' and s.duration_ms > 0
      group by s.step_name order by media_ms desc`, [studioId]) : [];
  const [durata] = await query<{ media_ms: number | null; mediana_ms: number | null }>(
    `select avg(duration_ms)::int as media_ms, percentile_cont(0.5) within group (order by duration_ms)::int as mediana_ms
       from audit.pipeline_runs where studio_id = $1 and status = 'SUCCESS' and duration_ms > 0`, [studioId]);

  // ——— Grafico a punti (SVG lato server) ———
  const W = 960, H = 340, PL = 44, PR = 16, PT = 18, PB = 42;
  const n = punti.length;
  const yMax = Math.max(5, ...valori);
  const x = (i: number) => PL + (n <= 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (n - 1));
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / yMax);
  const lineaMedia = media.map((m, i) => (m === null ? null : `${x(i).toFixed(1)},${y(m).toFixed(1)}`)).filter(Boolean).join(' ');
  const tacche = [0, Math.round(yMax / 4), Math.round(yMax / 2), Math.round((3 * yMax) / 4), yMax];
  const rilasciNelGrafico = rilasci.map((r) => {
    const i = punti.findIndex((p) => new Date(p.created_at).getTime() >= new Date(r.released_at).getTime());
    return { ...r, i };
  }).filter((r) => r.i > 0);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...extra })) if (v) p.set(k, String(v));
    return `?${p.toString()}`;
  };

  return (
    <div className="content">
      <p className="muted small"><Link href="/referti/qualita">← Qualità della dettatura</Link></p>
      <h1>AI Pipeline → Quality</h1>
      <p className="muted">
        Un punto per referto: quante correzioni ha fatto la segretaria rispetto all’ultimo testo prodotto dall’AI.
        Le trasformazioni interne della catena e le modifiche del medico sono conservate ma non contate qui.
        È un tasso di intervento umano, non una misura di accuratezza clinica.
      </p>

      <form method="get" className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>Dal <input type="date" name="da" defaultValue={searchParams.da ?? ''} /></label>
        <label>Al <input type="date" name="a" defaultValue={searchParams.a ?? ''} /></label>
        <label>Medico <select name="medico" defaultValue={searchParams.medico ?? ''}><option value="">tutti</option>{perMedico.map((g) => <option key={g.k} value={g.k}>{g.k}</option>)}</select></label>
        <label>Catena <select name="pipeline" defaultValue={searchParams.pipeline ?? ''}><option value="">tutte</option>{perPipeline.map((g) => <option key={g.k} value={g.k}>{g.k}</option>)}</select></label>
        <label>Prompt <select name="prompt" defaultValue={searchParams.prompt ?? ''}><option value="">tutti</option>{perPrompt.map((g) => <option key={g.k} value={g.k}>{g.k}</option>)}</select></label>
        <label>Media mobile <select name="finestra" defaultValue={String(finestra)}>{[10, 25, 50, 100].map((f) => <option key={f} value={f}>{f} referti</option>)}</select></label>
        <label><input type="checkbox" name="avanzata" value="1" defaultChecked={!!searchParams.avanzata} /> vista avanzata</label>
        <button className="btn" type="submit">Applica</button>
      </form>

      <div className="aq-cards">
        <div className="aq-card"><div className="aq-n">{st.n}</div><div className="aq-l">referti revisionati dalla segretaria</div></div>
        <div className="aq-card"><div className="aq-n">{n2(st.media)}</div><div className="aq-l">media correzioni per referto</div></div>
        <div className="aq-card"><div className="aq-n">{n2(st.mediana)}</div><div className="aq-l">mediana</div></div>
        <div className="aq-card"><div className="aq-n">{n2(per100.mediana)}</div><div className="aq-l">correzioni per 100 parole (mediana)</div></div>
        <div className="aq-card"><div className="aq-n">{pct(zeroTouch, st.n)}</div><div className="aq-l">referti senza alcuna correzione (zero-touch)</div></div>
        <div className="aq-card"><div className="aq-n">{trend(30) === null ? '—' : `${trend(30)! > 0 ? '+' : ''}${trend(30)}%`}</div><div className="aq-l">trend 30 giorni (7 gg: {trend(7) === null ? '—' : `${trend(7)}%`}, 90 gg: {trend(90) === null ? '—' : `${trend(90)}%`})</div></div>
        <div className="aq-card"><div className="aq-n">{stati.non_rivisti + stati.in_revisione}</div><div className="aq-l">bozze non ancora revisionate (escluse dalla statistica)</div></div>
        <div className="aq-card"><div className="aq-n">{per100.mediana === null ? '—' : punteggioQualita(per100.mediana)}</div><div className="aq-l">punteggio derivato 0–100 (100 − 10 × correzioni/100 parole)</div></div>
      </div>

      <div className="card">
        <h2>Correzioni della segretaria, referto per referto</h2>
        {n === 0 ? <p className="muted">Nessun referto revisionato con i filtri scelti.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Correzioni della segretaria per referto">
              {tacche.map((t) => (
                <g key={t}>
                  <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="#e4e2dc" />
                  <text x={PL - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#6b6b6b">{t}</text>
                </g>
              ))}
              {rilasciNelGrafico.map((r) => (
                <g key={r.id}>
                  <line x1={x(r.i) - 4} x2={x(r.i) - 4} y1={PT} y2={H - PB} stroke="#0d5c48" strokeDasharray="4 3" />
                  <text x={x(r.i)} y={PT + 10} fontSize="10" fill="#0d5c48">{r.kind} {r.version.slice(0, 7)}{r.note ? ` · ${r.note}` : ''}</text>
                </g>
              ))}
              {lineaMedia && <polyline points={lineaMedia} fill="none" stroke="#0d5c48" strokeWidth="2.5" />}
              {punti.map((p, i) => (
                <a key={p.id} href={`/referti/${p.bozza_id}/storia`}>
                  <circle cx={x(i)} cy={y(p.edit_count)} r={anomali[i] ? 6 : 4.5}
                    fill={anomali[i] ? '#fff' : p.severity_max === 'CRITICAL' ? '#b3261e' : '#0d5c48'}
                    stroke={anomali[i] ? '#b3261e' : 'none'} strokeWidth="2" fillOpacity="0.75">
                    <title>{dataCh(p.created_at)} · {p.edit_count} correzioni · {n2(p.edits_per_100_words)}/100 parole{anomali[i] ? ' · outlier' : ''}</title>
                  </circle>
                </a>
              ))}
              <text x={PL} y={H - 8} fontSize="11" fill="#6b6b6b">{dataCh(punti[0].created_at)}</text>
              <text x={W - PR} y={H - 8} fontSize="11" fill="#6b6b6b" textAnchor="end">{dataCh(punti[n - 1].created_at)}</text>
              <text x={W / 2} y={H - 8} fontSize="11" fill="#6b6b6b" textAnchor="middle">referti nel tempo → · linea = media mobile su {finestra} · cerchio rosso = outlier · punto rosso = correzione critica</text>
            </svg>
          </div>
        )}
        <p className="muted small">Clicca un punto per aprire la storia del referto con le modifiche una per una.</p>
      </div>

      <div className="aq-due">
        <div className="card">
          <h2>Per versione della catena</h2>
          <table className="aq-tab"><thead><tr><th>catena</th><th>referti</th><th>media</th><th>mediana</th><th>p90</th></tr></thead>
            <tbody>{perPipeline.map((g) => <tr key={g.k}><td><Link href={qs({ pipeline: g.k })}>{g.k}</Link></td><td>{g.n}</td><td>{n2(g.media)}</td><td>{n2(g.mediana)}</td><td>{n2(g.p90)}</td></tr>)}</tbody></table>
          <h2>Per versione del prompt</h2>
          <table className="aq-tab"><thead><tr><th>prompt</th><th>referti</th><th>media</th><th>mediana</th><th>p90</th></tr></thead>
            <tbody>{perPrompt.map((g) => <tr key={g.k}><td><Link href={qs({ prompt: g.k })}>{g.k}</Link></td><td>{g.n}</td><td>{n2(g.media)}</td><td>{n2(g.mediana)}</td><td>{n2(g.p90)}</td></tr>)}</tbody></table>
          <h2>Per medico</h2>
          <table className="aq-tab"><thead><tr><th>medico</th><th>referti</th><th>media</th><th>mediana</th></tr></thead>
            <tbody>{perMedico.map((g) => <tr key={g.k}><td>{g.k}</td><td>{g.n}</td><td>{n2(g.media)}</td><td>{n2(g.mediana)}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Mese per mese</h2>
          <table className="aq-tab"><thead><tr><th>mese</th><th>referti</th><th>media</th><th>mediana</th><th>p95</th></tr></thead>
            <tbody>{perMese.map((g) => <tr key={g.k}><td>{g.k}</td><td>{g.n}</td><td>{n2(g.media)}</td><td>{n2(g.mediana)}</td><td>{n2(g.p95)}</td></tr>)}</tbody></table>
          <h2>Distribuzione</h2>
          <table className="aq-tab"><tbody>
            <tr><td>media</td><td>{n2(st.media)}</td><td>mediana</td><td>{n2(st.mediana)}</td></tr>
            <tr><td>p75</td><td>{n2(st.p75)}</td><td>p90</td><td>{n2(st.p90)}</td></tr>
            <tr><td>p95</td><td>{n2(st.p95)}</td><td>deviazione</td><td>{n2(st.deviazione)}</td></tr>
            <tr><td>minimo</td><td>{n2(st.min)}</td><td>massimo</td><td>{n2(st.max)}</td></tr>
          </tbody></table>
          <h2>Rilasci</h2>
          <table className="aq-tab"><thead><tr><th>quando</th><th>cosa</th><th>versione</th><th>nota</th></tr></thead>
            <tbody>{rilasci.map((r) => (
              <tr key={r.id}><td>{dataCh(r.released_at)}</td><td>{r.kind}</td><td>{r.version.slice(0, 12)}</td>
                <td><form action={annotaRilascio} style={{ display: 'flex', gap: 6 }}><input type="hidden" name="id" value={r.id} /><input name="nota" defaultValue={r.note ?? ''} placeholder="es. nuovo whisper" maxLength={200} /><button className="btn" type="submit">salva</button></form></td></tr>
            ))}</tbody></table>
        </div>
      </div>

      <div className="card">
        <h2>Esploratore dei referti</h2>
        <table className="aq-tab"><thead><tr><th>referto</th><th>data</th><th>tipo</th><th>catena</th><th>prompt</th><th>segretaria</th><th>medico</th><th>parole</th><th>per 100</th><th>gravità</th><th></th></tr></thead>
          <tbody>{[...punti].reverse().slice(0, 100).map((p, k) => {
            const i = n - 1 - k;
            return (
              <tr key={p.id} className={anomali[i] ? 'aq-outlier' : ''}>
                <td><Link href={`/referti/${p.bozza_id}`}>{p.bozza_id.slice(0, 8)}</Link></td><td>{dataCh(p.created_at)}</td><td>{p.tipo}</td>
                <td>{p.pipeline_version?.slice(0, 7) ?? '—'}</td><td>{p.prompt_version?.slice(0, 7) ?? '—'}</td>
                <td><strong>{p.edit_count}</strong>{anomali[i] ? ' ⚠ outlier' : ''}</td><td>{p.doctor_edits ?? '—'}</td><td>{p.words_total}</td><td>{n2(p.edits_per_100_words)}</td><td>{p.severity_max ?? '—'}</td>
                <td><Link className="btn" href={`/referti/${p.bozza_id}/storia`}>Visualizza modifiche</Link></td>
              </tr>
            );
          })}</tbody></table>
      </div>

      <div className="card">
        <h2>Errori della catena</h2>
        <p className="muted small">{errN.n} corse fallite su {errN.tot}. Durata media di una corsa riuscita: {durata.media_ms ? `${Math.round(durata.media_ms / 1000)} s` : '—'} (mediana {durata.mediana_ms ? `${Math.round(durata.mediana_ms / 1000)} s` : '—'}).</p>
        {errori.length > 0 && (
          <table className="aq-tab"><thead><tr><th>quando</th><th>audio</th><th>tentativo</th><th>fase</th><th>tipo</th></tr></thead>
            <tbody>{errori.map((e, k) => <tr key={k}><td>{dataCh(e.created_at)}</td><td>{e.file_id.slice(0, 10)}</td><td>{e.attempt}</td><td>{e.failed_step ?? '—'}</td><td>{e.error_type ?? '—'}</td></tr>)}</tbody></table>
        )}
      </div>

      {searchParams.avanzata && (
        <div className="card">
          <h2>Vista avanzata · latenze per tappa (ultimi 90 giorni)</h2>
          <table className="aq-tab"><thead><tr><th>tappa</th><th>media</th><th>corse</th></tr></thead>
            <tbody>{latenze.map((l) => <tr key={l.step_name}><td>{l.step_name}</td><td>{(l.media_ms / 1000).toFixed(1)} s</td><td>{l.n}</td></tr>)}</tbody></table>
          <p className="muted small">I tempi delle tappe vengono dai secondi cumulativi della catena: la passata B corre in parallelo alla A, quindi la sua durata è attribuita alla tappa che la aspetta.</p>
        </div>
      )}
    </div>
  );
}
