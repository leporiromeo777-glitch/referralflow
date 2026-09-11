import Link from 'next/link';
import { redirect } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { mediaMobile, statistiche, outlier } from '@/lib/audit/metriche';
import { registraRilascio } from '@/lib/audit/lineage';
import { proposteDizionario } from '@/lib/audit/dizionario';
import { annotaRilascio, decidiVoceDizionario } from './actions';

export const dynamic = 'force-dynamic';

// «Quanto corregge la segretaria» (9.9.2026, §24-§35, §58-§68). Struttura
// per DOMANDE, non per tabelle: sta migliorando? che cosa corregge di più?
// quali referti guardare? Le parti tecniche (versioni, percentili, latenze,
// errori) stanno in fondo, ripiegate. Un punto = un referto; l'altezza = le
// correzioni della segretaria rispetto all'ultimo testo dell'AI. Le
// trasformazioni AI→AI e le modifiche del medico non entrano.

type Punto = {
  id: number; bozza_id: string; created_at: string; edit_count: number; edits_per_100_words: number; words_total: number;
  severity_max: string | null; pipeline_version: string | null; prompt_version: string | null; medico: string | null;
  review_seconds: number | null; doctor_edits: number | null; tipo: string; revisore: string | null; categories: Record<string, number>;
};
type Filtri = { da?: string; a?: string; medico?: string; pipeline?: string; finestra?: string; tutti?: string };

const CATEGORIE: Record<string, string> = {
  punctuation: 'Punteggiatura', formatting: 'Formattazione', spelling: 'Ortografia', grammar: 'Grammatica', drug: 'Farmaco',
  dose: 'Dosaggio', measurement: 'Misure e valori', date: 'Date', patient_information: 'Dati del paziente',
  medical_terminology: 'Termini medici', clinical_meaning: 'Senso clinico', other: 'Altro',
};
const GRAVITA: Record<string, string> = { CRITICAL: 'critica', HIGH: 'alta', MEDIUM: 'media', LOW: 'bassa' };
const dataCh = (iso: string) => new Date(iso).toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataBreve = (iso: string) => new Date(iso).toLocaleDateString('it-CH', { day: 'numeric', month: 'short' });
const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10));
const pct = (num: number, den: number) => (den ? `${Math.round((num / den) * 100)}%` : '—');
const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

export default async function QualitaPipeline({ searchParams }: { searchParams: Filtri }) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');
  const proprietario = process.env.PLATFORM_OWNER_EMAIL && session.email?.toLowerCase() === process.env.PLATFORM_OWNER_EMAIL.toLowerCase();
  if (session.role !== 'admin' && !proprietario) redirect('/referti');
  const studioId = session.studioId;
  try { registraRilascio(studioId, 'app', fs.readFileSync(path.join(process.cwd(), '.build-stamp'), 'utf8').trim().slice(0, 12)); } catch { /* senza build-stamp */ }

  const cond: string[] = ['h.studio_id = $1', "h.editor_role = 'SECRETARY'"];
  const par: unknown[] = [studioId];
  const agg = (sql: string, v: unknown) => { par.push(v); cond.push(sql.replace('?', `$${par.length}`)); };
  if (searchParams.da && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.da)) agg('h.created_at >= ?::date', searchParams.da);
  if (searchParams.a && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.a)) agg("h.created_at < ?::date + interval '1 day'", searchParams.a);
  if (searchParams.medico) agg('h.medico = ?', searchParams.medico.slice(0, 40));
  if (searchParams.pipeline) agg('h.pipeline_version = ?', searchParams.pipeline.slice(0, 40));

  const punti = await query<Punto>(
    `select h.id, h.bozza_id, h.created_at::text, h.edit_count, h.edits_per_100_words::float, h.words_total, h.severity_max,
            h.pipeline_version, h.prompt_version, h.medico, h.review_seconds, h.categories, b.tipo, u.email as revisore,
            (select d.edit_count from audit.human_edits d where d.bozza_id = h.bozza_id and d.editor_role = 'DOCTOR' order by d.created_at desc limit 1) as doctor_edits
       from audit.human_edits h join referti_bozze b on b.id = h.bozza_id left join users u on u.id = h.editor_user_id
      where ${cond.join(' and ')} order by h.created_at`, par);
  const n = punti.length;
  const valori = punti.map((p) => p.edit_count);
  const finestraRichiesta = Number(searchParams.finestra);
  const finestra = [10, 25, 50, 100].includes(finestraRichiesta) ? finestraRichiesta : (n >= 100 ? 50 : 20);
  const mm = mediaMobile(valori, finestra);
  const anomali = outlier(valori);
  const st = statistiche(valori);
  const per100 = statistiche(punti.map((p) => p.edits_per_100_words));
  const zeroTouch = valori.filter((v) => v === 0).length;
  const [stati] = await query<{ non_rivisti: number }>(
    `select count(*)::int as non_rivisti from audit.report_reviews where studio_id = $1 and role = 'SECRETARY' and status in ('NOT_REVIEWED', 'IN_REVIEW')`, [studioId]);

  const trend = (giorni: number) => {
    const ora = Date.now(), g = giorni * 86400000;
    const rec = punti.filter((p) => ora - new Date(p.created_at).getTime() < g).map((p) => p.edit_count);
    const prec = punti.filter((p) => { const d = ora - new Date(p.created_at).getTime(); return d >= g && d < 2 * g; }).map((p) => p.edit_count);
    if (rec.length < 3 || prec.length < 3) return null;
    const m1 = media(rec)!, m0 = media(prec)!;
    return m0 ? Math.round(((m1 - m0) / m0) * 100) : null;
  };
  const t30 = trend(30);

  // Che cosa corregge di più: somma delle categorie e delle gravità.
  const categorie = new Map<string, number>();
  for (const p of punti) for (const [k, v] of Object.entries(p.categories ?? {})) categorie.set(k, (categorie.get(k) ?? 0) + Number(v));
  const totCat = [...categorie.values()].reduce((s, v) => s + v, 0);
  const catOrdinate = [...categorie.entries()].sort((a, b) => b[1] - a[1]);
  const gravita = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  for (const p of punti) if (p.severity_max) gravita[p.severity_max] = (gravita[p.severity_max] ?? 0) + 1;

  // Rilasci: etichette leggibili («catena del 7 set») e confronto prima/dopo.
  const rilasci = await query<{ id: number; kind: string; version: string; released_at: string; note: string | null }>(
    `select id, kind, version, released_at::text, note from audit.deployments where studio_id = $1 or studio_id is null order by released_at`, [studioId]);
  const etichettaVersione = (kind: string, v: string | null) => {
    if (!v) return '—';
    const r = rilasci.find((x) => x.kind === kind && x.version === v);
    return r ? `${kind === 'pipeline' ? 'catena' : kind} del ${dataBreve(r.released_at)}${r.note ? ` · ${r.note}` : ''}` : `${kind === 'pipeline' ? 'catena' : kind} ${v.slice(0, 7)}`;
  };
  const primaDopo = rilasci.filter((r) => r.kind === 'pipeline').map((r) => {
    const t = new Date(r.released_at).getTime();
    const prima = punti.filter((p) => new Date(p.created_at).getTime() < t).map((p) => p.edit_count);
    const dopo = punti.filter((p) => new Date(p.created_at).getTime() >= t).map((p) => p.edit_count);
    return { ...r, prima, dopo };
  }).filter((r) => r.prima.length >= 3 && r.dopo.length >= 3);

  const perMese = (() => {
    const m = new Map<string, number[]>();
    for (const p of punti) { const k = p.created_at.slice(0, 7); m.set(k, [...(m.get(k) ?? []), p.edit_count]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ k, ...statistiche(v), zero: v.filter((x) => x === 0).length }));
  })();
  const gruppo = (chiave: (p: Punto) => string | null) => {
    const m = new Map<string, number[]>();
    for (const p of punti) { const k = chiave(p) ?? '—'; m.set(k, [...(m.get(k) ?? []), p.edit_count]); }
    return [...m.entries()].map(([k, v]) => ({ k, ...statistiche(v) })).sort((a, b) => b.n - a.n);
  };
  const perPipeline = gruppo((p) => p.pipeline_version);
  const perPrompt = gruppo((p) => p.prompt_version);
  const perMedico = gruppo((p) => p.medico);
  const errori = await query<{ file_id: string; attempt: number; failed_step: string | null; error_type: string | null; created_at: string }>(
    `select file_id, attempt, failed_step, error_type, created_at::text from audit.pipeline_runs where studio_id = $1 and status = 'FAILED' order by created_at desc limit 20`, [studioId]);
  const [corse] = await query<{ n: number; tot: number; media_ms: number | null }>(
    `select count(*) filter (where status = 'FAILED')::int as n, count(*)::int as tot, avg(duration_ms) filter (where status = 'SUCCESS')::int as media_ms from audit.pipeline_runs where studio_id = $1`, [studioId]);
  const latenze = await query<{ step_name: string; media_ms: number; n: number }>(
    `select s.step_name, avg(s.duration_ms)::int as media_ms, count(*)::int as n from audit.pipeline_steps s join audit.pipeline_runs r on r.id = s.run_id
      where r.studio_id = $1 and r.status = 'SUCCESS' and r.created_at > now() - interval '90 days' and s.duration_ms > 0 group by s.step_name order by media_ms desc limit 12`, [studioId]);

  // ——— Proposte di dizionario dalle correzioni umane (11.9.2026) ———
  // Dalle operazioni REPLACE della segretaria (ultimi 180 giorni, tutti i
  // medici, senza i filtri della pagina) alle coppie ricorrenti; lo stato
  // (confermata/rifiutata) viene dalla tabella referti_dizionario.
  const modifiche = await query<{ medico: string | null; bozza_id: string; created_at: string; diff: unknown }>(
    `select medico, bozza_id::text, created_at::text, diff from audit.human_edits
      where studio_id = $1 and editor_role = 'SECRETARY' and created_at > now() - interval '180 days' and medico is not null`, [studioId]);
  const decise = await query<{ medico: string; da: string; a: string; stato: string; occorrenze: number; deciso_at: string }>(
    `select medico, da, a, stato, occorrenze, deciso_at::text from referti_dizionario where studio_id = $1 order by medico, da`, [studioId]);
  const decisa = (medico: string, da: string) => decise.find((d) => d.medico === medico && d.da.toLowerCase() === da.toLowerCase());
  const proposteTutte = proposteDizionario(modifiche).filter((p) => !decisa(p.medico, p.da));
  // In vista normale: le ricorrenti e, tra quelle viste una volta sola, i
  // termini medici, l'ortografia, i farmaci e la grammatica (sui primi
  // referti veri: 19 proposte, 1 ricorrente, 12 di categoria «altro»).
  const proposte = searchParams.dizionario === 'tutte'
    ? proposteTutte
    : proposteTutte.filter((p) => p.occorrenze >= 2 || ['medical_terminology', 'spelling', 'drug', 'grammar'].includes(p.categoria));
  const confermate = decise.filter((d) => d.stato === 'confermata');
  const rifiutate = decise.filter((d) => d.stato === 'rifiutata').length;

  // ——— Grafico ———
  const W = 960, H = 320, PL = 40, PR = 16, PT = 26, PB = 40;
  const yMax = Math.max(5, ...valori);
  const x = (i: number) => PL + (n <= 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (n - 1));
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / yMax);
  const lineaMedia = mm.map((m, i) => (m === null ? null : `${x(i).toFixed(1)},${y(m).toFixed(1)}`)).filter(Boolean).join(' ');
  const tacche = [...new Set([0, Math.round(yMax / 2), yMax])];
  const rilasciNelGrafico = rilasci.filter((r) => r.kind === 'pipeline').map((r) => ({ ...r, i: punti.findIndex((p) => new Date(p.created_at).getTime() >= new Date(r.released_at).getTime()) })).filter((r) => r.i > 0);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...extra })) if (v) p.set(k, String(v));
    return `?${p.toString()}`;
  };
  const ultimi = [...punti].reverse().slice(0, searchParams.tutti ? 200 : 15);
  const filtriAttivi = !!(searchParams.da || searchParams.a || searchParams.medico || searchParams.pipeline);

  return (
    <div className="content">
      <header className="hero-solid">
        <div className="hero-top">
          <span className="hero-eyebrow">Qualità dell’AI</span>
          <Link className="btn btn-small" href="/referti/qualita">Qualità della dettatura</Link>
        </div>
        <h1>Quanto corregge la segretaria</h1>
        <p className="hero-lede">
          Ogni referto che la segretaria conferma viene confrontato con l’ultimo testo scritto dall’AI.
          Meno correzioni servono, meglio lavora la catena. È una misura del lavoro umano, non dell’esattezza clinica.
        </p>
        <div className="hero-stats">
          <div className="hero-stat"><span className="k">Correzioni per referto</span><span className="v">{n1(st.mediana)}<small> mediana · media {n1(st.media)}</small></span></div>
          <div className="hero-stat"><span className="k">Referti senza correzioni</span><span className="v">{pct(zeroTouch, n)}<small> {zeroTouch} su {n}</small></span></div>
          <div className={`hero-stat${t30 !== null && t30 > 0 ? ' alert' : ''}`}><span className="k">Ultimi 30 giorni</span><span className="v">{t30 === null ? '—' : `${t30 > 0 ? '+' : ''}${t30}%`}<small> rispetto ai 30 prima</small></span></div>
          <div className="hero-stat"><span className="k">Referti misurati</span><span className="v">{n}<small> {stati.non_rivisti} ancora da rivedere</small></span></div>
        </div>
      </header>

      {n === 0 ? (
        <div className="card"><p className="muted">Nessun referto confermato dalla segretaria{filtriAttivi ? ' con i filtri scelti' : ''}. La pagina si riempie da sola a ogni conferma.</p></div>
      ) : (
        <>
          <div className="card chart-card">
            <h2>Sta migliorando?</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Un pallino per referto, da sinistra (i più vecchi) a destra (i più recenti): più è in alto, più correzioni sono servite.
              La linea verde è la media degli ultimi {finestra} referti. Le linee tratteggiate segnano quando la catena è cambiata.
              Un cerchio rosso è un referto fuori dal normale: vale la pena aprirlo.
            </p>
            <div className="coda-tabs" style={{ marginBottom: 8 }}>
              {[10, 25, 50, 100].map((f) => (
                <Link key={f} className={`coda-tab${f === finestra ? ' active' : ''}`} href={qs({ finestra: String(f) })}>media su {f}</Link>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Correzioni della segretaria per referto">
                {tacche.map((t) => (
                  <g key={t}><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="#e4e2dc" /><text x={PL - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#6b6b6b">{t}</text></g>
                ))}
                {rilasciNelGrafico.map((r) => (
                  <g key={r.id}><line x1={x(r.i) - 4} x2={x(r.i) - 4} y1={PT} y2={H - PB} stroke="#0d5c48" strokeDasharray="4 3" /><text x={x(r.i)} y={PT - 8} fontSize="10.5" fill="#0d5c48">{etichettaVersione('pipeline', r.version)}</text></g>
                ))}
                {lineaMedia && <polyline points={lineaMedia} fill="none" stroke="#0d5c48" strokeWidth="2.5" />}
                {punti.map((p, i) => (
                  <a key={p.id} href={`/referti/${p.bozza_id}/storia`}>
                    <circle cx={x(i)} cy={y(p.edit_count)} r={anomali[i] ? 6.5 : 5} fill={anomali[i] ? '#fff' : '#0d5c48'} stroke={anomali[i] ? '#b3261e' : '#fff'} strokeWidth={anomali[i] ? 2.5 : 1} fillOpacity="0.85">
                      <title>{dataCh(p.created_at)} · {p.edit_count} correzioni{anomali[i] ? ' · fuori dal normale' : ''} · clicca per vederle</title>
                    </circle>
                  </a>
                ))}
                <text x={PL} y={H - 8} fontSize="11" fill="#6b6b6b">{dataCh(punti[0].created_at)}</text>
                <text x={W - PR} y={H - 8} fontSize="11" fill="#6b6b6b" textAnchor="end">{dataCh(punti[n - 1].created_at)}</text>
              </svg>
            </div>
            {primaDopo.length > 0 && (
              <>
                <h3>Prima e dopo ogni cambiamento della catena</h3>
                <table className="aq-tab"><thead><tr><th>cambiamento</th><th>prima</th><th>dopo</th><th>effetto</th></tr></thead>
                  <tbody>{primaDopo.map((r) => {
                    const a = media(r.prima)!, b = media(r.dopo)!;
                    const delta = a ? Math.round(((b - a) / a) * 100) : null;
                    return (
                      <tr key={r.id}><td>{etichettaVersione('pipeline', r.version)}</td><td>{n1(a)} correzioni <span className="muted small">({r.prima.length} referti)</span></td><td>{n1(b)} correzioni <span className="muted small">({r.dopo.length} referti)</span></td>
                        <td>{delta === null ? '—' : delta < 0 ? `▼ ${Math.abs(delta)}% in meno` : delta > 0 ? `▲ ${delta}% in più` : 'uguale'}</td></tr>
                    );
                  })}</tbody></table>
              </>
            )}
          </div>

          <div className="aq-due">
            <div className="card">
              <h2>Che cosa corregge di più</h2>
              <p className="muted small" style={{ marginTop: 0 }}>Tutte le correzioni dei referti misurati, per tipo. È qui che si vede dove la catena continua a sbagliare.</p>
              {catOrdinate.map(([k, v]) => (
                <div key={k} className="aq-barra">
                  <span className="aq-barra-l">{CATEGORIE[k] ?? k}</span>
                  <span className="aq-barra-b"><span style={{ width: `${totCat ? Math.max(2, (v / totCat) * 100) : 0}%` }} /></span>
                  <span className="aq-barra-v">{v} <span className="muted small">({pct(v, totCat)})</span></span>
                </div>
              ))}
              <p className="muted small" style={{ marginTop: 10 }}>
                Gravità più alta trovata nei referti: {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((g) => `${GRAVITA[g]} ${gravita[g] ?? 0}`).join(' · ')}.
                Una correzione critica è un dosaggio; alta un farmaco, un valore, una data, una negazione o una lateralità.
              </p>
            </div>
            <div className="card">
              <h2>Mese per mese</h2>
              <p className="muted small" style={{ marginTop: 0 }}>La stessa misura, riassunta per mese.</p>
              <table className="aq-tab"><thead><tr><th>mese</th><th>referti</th><th>correzioni (mediana)</th><th>senza correzioni</th></tr></thead>
                <tbody>{perMese.map((g) => <tr key={g.k}><td>{g.k}</td><td>{g.n}</td><td>{n1(g.mediana)} <span className="muted small">media {n1(g.media)}</span></td><td>{pct(g.zero, g.n)}</td></tr>)}</tbody></table>
              {perMedico.length > 1 && (
                <>
                  <h3>Per medico che detta</h3>
                  <table className="aq-tab"><thead><tr><th>medico</th><th>referti</th><th>correzioni (mediana)</th></tr></thead>
                    <tbody>{perMedico.map((g) => <tr key={g.k}><td><Link href={qs({ medico: g.k })}>{g.k}</Link></td><td>{g.n}</td><td>{n1(g.mediana)}</td></tr>)}</tbody></table>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Gli ultimi referti</h2>
            <p className="muted small" style={{ marginTop: 0 }}>Dal più recente. «Vedi le modifiche» mostra, una per una, che cosa ha cambiato la segretaria e da quale testo dell’AI era partita.</p>
            <table className="aq-tab"><thead><tr><th>data</th><th>medico</th><th>correzioni</th><th>parole</th><th>gravità</th><th></th></tr></thead>
              <tbody>{ultimi.map((p) => {
                const i = punti.indexOf(p);
                return (
                  <tr key={p.id} className={anomali[i] ? 'aq-outlier' : ''}>
                    <td>{dataCh(p.created_at)}</td><td>{p.medico ?? '—'}</td>
                    <td><strong>{p.edit_count}</strong>{anomali[i] ? <span className="aq-tag aq-tag-rosso">fuori dal normale</span> : null}{p.edit_count === 0 ? <span className="aq-tag">nessuna</span> : null}{p.doctor_edits ? <span className="muted small"> · medico {p.doctor_edits}</span> : null}</td>
                    <td>{p.words_total}</td><td>{p.severity_max ? GRAVITA[p.severity_max] : '—'}</td>
                    <td><Link className="btn btn-small" href={`/referti/${p.bozza_id}/storia`}>Vedi le modifiche</Link></td>
                  </tr>
                );
              })}</tbody></table>
            {n > 15 && !searchParams.tutti && <p><Link href={qs({ tutti: '1' })}>Mostra tutti i {n} referti</Link></p>}
          </div>
        </>
      )}

      <div className="card" id="dizionario">
        <h2>Che cosa insegnano le correzioni</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Le parole che la segretaria corregge allo stesso modo, referto dopo referto, sono errori d’ascolto stabili della catena
          («tucarografico» → «elettrocardiografico»). Qui sono proposte: chi conferma le mette nel dizionario del medico, e da lì
          la catena le corregge da sola nei dettati futuri. Conferma solo errori d’ascolto ricorrenti, mai cambiamenti di senso clinico
          (quelli non compaiono) né correzioni che valgono solo in una frase. Niente entra da solo.
        </p>
        {proposte.length === 0 ? (
          <p className="muted">Nessuna proposta nuova{proposteTutte.length ? ' (le altre sono già decise)' : ''}. La lista si riempie con le conferme della segretaria.</p>
        ) : (
          <table className="aq-tab"><thead><tr><th>medico</th><th>dettato trascritto così</th><th>la segretaria scrive</th><th>volte</th><th></th></tr></thead>
            <tbody>{proposte.slice(0, 40).map((p) => (
              <tr key={`${p.medico} ${p.da}`}>
                <td>{p.medico}</td>
                <td><code>{p.da}</code></td>
                <td><code>{p.a}</code>{p.alternative.length > 0 && <span className="muted small"> (altre volte: {p.alternative.map((x) => `«${x}»`).join(', ')})</span>}</td>
                <td>{p.occorrenze}<span className="muted small"> in {p.bozze} {p.bozze === 1 ? 'referto' : 'referti'}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <form action={decidiVoceDizionario} style={{ display: 'inline-flex', gap: 6 }}>
                    <input type="hidden" name="medico" value={p.medico} /><input type="hidden" name="da" value={p.da} /><input type="hidden" name="a" value={p.a} /><input type="hidden" name="occorrenze" value={p.occorrenze} />
                    <button className="btn btn-small btn-primary" name="azione" value="conferma" type="submit">Metti nel dizionario</button>
                    <button className="btn btn-small btn-ghost" name="azione" value="rifiuta" type="submit">Non è un errore d’ascolto</button>
                  </form>
                </td>
              </tr>
            ))}</tbody></table>
        )}
        {confermate.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="sez-summary">Voci confermate ({confermate.length}){rifiutate ? ` · scartate ${rifiutate}` : ''}</summary>
            <table className="aq-tab"><thead><tr><th>medico</th><th>da</th><th>a</th><th>quando</th><th></th></tr></thead>
              <tbody>{confermate.map((d) => (
                <tr key={`${d.medico} ${d.da}`}><td>{d.medico}</td><td><code>{d.da}</code></td><td><code>{d.a}</code></td><td>{dataCh(d.deciso_at)}</td>
                  <td><form action={decidiVoceDizionario}><input type="hidden" name="medico" value={d.medico} /><input type="hidden" name="da" value={d.da} /><input type="hidden" name="a" value={d.a} /><button className="btn btn-small btn-ghost" name="azione" value="togli" type="submit">Togli</button></form></td></tr>
              ))}</tbody></table>
            <p className="muted small">Il servizio sul Mac dello studio legge queste voci ogni dieci minuti e le scrive nel file correzioni-&lt;medico&gt;-piattaforma.json: valgono dal dettato successivo.</p>
          </details>
        )}
      </div>

      <details className="card">
        <summary className="btn">Filtra per periodo, medico o versione della catena{filtriAttivi ? ' · filtri attivi' : ''}</summary>
        <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 12 }}>
          <label>Dal <input type="date" name="da" defaultValue={searchParams.da ?? ''} /></label>
          <label>Al <input type="date" name="a" defaultValue={searchParams.a ?? ''} /></label>
          <label>Medico <select name="medico" defaultValue={searchParams.medico ?? ''}><option value="">tutti</option>{perMedico.map((g) => <option key={g.k} value={g.k}>{g.k}</option>)}</select></label>
          <label>Versione della catena <select name="pipeline" defaultValue={searchParams.pipeline ?? ''}><option value="">tutte</option>{perPipeline.map((g) => <option key={g.k} value={g.k}>{etichettaVersione('pipeline', g.k)}</option>)}</select></label>
          <input type="hidden" name="finestra" value={finestra} />
          <button className="btn" type="submit">Applica</button>
          {filtriAttivi && <Link className="btn btn-ghost" href="/referti/qualita/pipeline">Togli i filtri</Link>}
        </form>
      </details>

      <details className="card">
        <summary className="btn">Dettagli tecnici: versioni, distribuzione, errori, tempi</summary>
        <div className="aq-due" style={{ marginTop: 12 }}>
          <div>
            <h3>Per versione della catena</h3>
            <table className="aq-tab"><thead><tr><th>versione</th><th>referti</th><th>media</th><th>mediana</th><th>p90</th></tr></thead>
              <tbody>{perPipeline.map((g) => <tr key={g.k}><td>{etichettaVersione('pipeline', g.k)} <span className="muted small">{g.k.slice(0, 7)}</span></td><td>{g.n}</td><td>{n1(g.media)}</td><td>{n1(g.mediana)}</td><td>{n1(g.p90)}</td></tr>)}</tbody></table>
            <h3>Per versione del prompt</h3>
            <table className="aq-tab"><thead><tr><th>prompt</th><th>referti</th><th>media</th><th>mediana</th></tr></thead>
              <tbody>{perPrompt.map((g) => <tr key={g.k}><td>{g.k.slice(0, 12)}</td><td>{g.n}</td><td>{n1(g.media)}</td><td>{n1(g.mediana)}</td></tr>)}</tbody></table>
            <h3>Distribuzione delle correzioni</h3>
            <table className="aq-tab"><tbody>
              <tr><td>media</td><td>{n1(st.media)}</td><td>mediana</td><td>{n1(st.mediana)}</td></tr>
              <tr><td>p75</td><td>{n1(st.p75)}</td><td>p90</td><td>{n1(st.p90)}</td></tr>
              <tr><td>p95</td><td>{n1(st.p95)}</td><td>deviazione standard</td><td>{n1(st.deviazione)}</td></tr>
              <tr><td>minimo</td><td>{n1(st.min)}</td><td>massimo</td><td>{n1(st.max)}</td></tr>
              <tr><td>correzioni per 100 parole</td><td>{n1(per100.mediana)} <span className="muted small">mediana</span></td><td>media</td><td>{n1(per100.media)}</td></tr>
            </tbody></table>
          </div>
          <div>
            <h3>Rilasci</h3>
            <p className="muted small">Una nota per ricordare che cosa è cambiato («nuovo whisper», «prompt lettera v2»): compare sul grafico.</p>
            <table className="aq-tab"><thead><tr><th>quando</th><th>cosa</th><th>nota</th></tr></thead>
              <tbody>{rilasci.map((r) => (
                <tr key={r.id}><td>{dataCh(r.released_at)}</td><td>{r.kind} {r.version.slice(0, 7)}</td>
                  <td><form action={annotaRilascio} style={{ display: 'flex', gap: 6 }}><input type="hidden" name="id" value={r.id} /><input name="nota" defaultValue={r.note ?? ''} placeholder="che cosa è cambiato" maxLength={200} /><button className="btn btn-small" type="submit">salva</button></form></td></tr>
              ))}</tbody></table>
            <h3>Errori della catena</h3>
            <p className="muted small">{corse.n} corse fallite su {corse.tot}. Durata media di una corsa riuscita: {corse.media_ms ? `${Math.round(corse.media_ms / 1000)} s` : '—'}.</p>
            {errori.length > 0 && (
              <table className="aq-tab"><thead><tr><th>quando</th><th>audio</th><th>tentativo</th><th>fase</th><th>tipo</th></tr></thead>
                <tbody>{errori.map((e, k) => <tr key={k}><td>{dataCh(e.created_at)}</td><td>{e.file_id.slice(0, 10)}</td><td>{e.attempt}</td><td>{e.failed_step ?? '—'}</td><td>{e.error_type ?? '—'}</td></tr>)}</tbody></table>
            )}
            <h3>Tempi per tappa (ultimi 90 giorni)</h3>
            <table className="aq-tab"><thead><tr><th>tappa</th><th>media</th><th>corse</th></tr></thead>
              <tbody>{latenze.map((l) => <tr key={l.step_name}><td>{l.step_name}</td><td>{(l.media_ms / 1000).toFixed(1)} s</td><td>{l.n}</td></tr>)}</tbody></table>
          </div>
        </div>
      </details>
    </div>
  );
}
