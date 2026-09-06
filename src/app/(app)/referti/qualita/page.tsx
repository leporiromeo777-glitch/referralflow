import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Cruscotto della qualità della dettatura (2026-09-06, dall'analisi dei
// concorrenti: Tandem misura il tempo del medico, non quello della macchina).
// Tutto viene dalle conferme: quota di parole modificate, tempo di revisione,
// segnalazioni chiuse senza riascolto, classi di correzione. Bersagli:
// mediana di revisione sotto 2 minuti (poi 90 secondi) senza errori critici.

type R = {
  settimana: string; n: number; quota_med: number | null; tempo_med: number | null;
  flag: number | null; senza: number | null;
};

export default async function Qualita() {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const settimane = await query<R>(
    `select to_char(date_trunc('week', reviewed_at), 'IYYY-"s"IW') as settimana,
            count(*)::int as n,
            percentile_cont(0.5) within group (order by (payload->'revisione'->>'quota_modificata')::numeric) as quota_med,
            percentile_cont(0.5) within group (order by (payload->'revisione'->>'tempo_revisione_s')::numeric) as tempo_med,
            sum((payload->'revisione'->>'flag_totali')::int)::int as flag,
            sum((payload->'revisione'->>'flag_accettati_senza_riascolto')::int)::int as senza
       from referti_bozze
      where studio_id = $1 and stato = 'confermata' and payload ? 'revisione'
      group by 1 order by 1 desc limit 12`,
    [session.studioId]
  );
  const medici = await query<{ email: string; n: number; quota_med: number | null; tempo_med: number | null }>(
    `select coalesce(u.email, '—') as email, count(*)::int as n,
            percentile_cont(0.5) within group (order by (b.payload->'revisione'->>'quota_modificata')::numeric) as quota_med,
            percentile_cont(0.5) within group (order by (b.payload->'revisione'->>'tempo_revisione_s')::numeric) as tempo_med
       from referti_bozze b left join users u on u.id = b.reviewed_by
      where b.studio_id = $1 and b.stato = 'confermata' and b.payload ? 'revisione'
      group by 1 order by 2 desc`,
    [session.studioId]
  );
  const classi = await query<{ classe: string; n: number }>(
    `select k as classe, sum(v::int)::int as n
       from referti_bozze b, jsonb_each_text(coalesce(b.payload->'revisione'->'classi', '{}'::jsonb)) as t(k, v)
      where b.studio_id = $1 and b.stato = 'confermata'
      group by k order by 2 desc`,
    [session.studioId]
  );
  const origini = await query<{ origine: string; n: number }>(
    `select k as origine, sum(v::int)::int as n
       from referti_bozze b, jsonb_each_text(coalesce(b.payload->'revisione'->'origini', '{}'::jsonb)) as t(k, v)
      where b.studio_id = $1 and b.stato = 'confermata'
      group by k order by 2 desc`,
    [session.studioId]
  );
  const totale = settimane.reduce((s, r) => s + r.n, 0);
  const min = (s: number | null) => (s === null ? '—' : `${Math.round(s / 60)} min ${Math.round(s % 60)} s`);

  return (
    <div className="content">
      <p className="muted small"><Link href="/referti">← Referti</Link></p>
      <h1>Qualità della dettatura</h1>
      <p className="muted">
        Quanto il medico corregge, quanto tempo impiega a firmare, quante segnalazioni chiude senza
        riascoltare e di che tipo sono le correzioni. Bersaglio: mediana di revisione sotto 2 minuti,
        poi 90 secondi, con zero errori su numeri e negazioni.
      </p>
      {totale === 0 ? (
        <div className="card"><p className="muted">Ancora nessun referto confermato con la misura della revisione: i numeri compaiono dalle prossime conferme.</p></div>
      ) : (
        <>
          <div className="card">
            <h2>Per settimana</h2>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead><tr><th>Settimana</th><th>Referti</th><th>Parole modificate (mediana)</th><th>Tempo di revisione (mediana)</th><th>Segnalazioni chiuse</th><th>di cui senza riascolto</th></tr></thead>
                <tbody>
                  {settimane.map((r) => (
                    <tr key={r.settimana}>
                      <td>{r.settimana}</td><td>{r.n}</td>
                      <td>{r.quota_med === null ? '—' : `${Number(r.quota_med).toFixed(1)}%`}</td>
                      <td>{min(r.tempo_med === null ? null : Number(r.tempo_med))}</td>
                      <td>{r.flag ?? 0}</td><td>{r.senza ?? 0}{r.flag ? ` (${Math.round(100 * (r.senza ?? 0) / r.flag)}%)` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Per medico</h2>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead><tr><th>Medico</th><th>Referti</th><th>Parole modificate (mediana)</th><th>Tempo di revisione (mediana)</th></tr></thead>
                <tbody>
                  {medici.map((m) => (
                    <tr key={m.email}><td>{m.email}</td><td>{m.n}</td>
                      <td>{m.quota_med === null ? '—' : `${Number(m.quota_med).toFixed(1)}%`}</td>
                      <td>{min(m.tempo_med === null ? null : Number(m.tempo_med))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Tipi di correzione</h2>
            <p className="muted small">Classificate dal codice a ogni conferma. Solo le classi che iniziano per «ASR» alimentano il dizionario e, un giorno, l&apos;adattamento della voce.</p>
            <ul>
              {classi.map((c) => (
                <li key={c.classe}><strong>{c.classe.toLowerCase().replaceAll('_', ' ')}</strong>: {c.n}</li>
              ))}
              {classi.length === 0 && <li className="muted">Nessuna correzione classificata ancora.</li>}
            </ul>
          </div>
        </>
      )}
      {origini.length > 0 && (
        <div className="card">
          <h2>Da dove nascono gli errori</h2>
          <p className="muted small">Per ogni correzione del medico, la prima tappa della catena in cui il valore giusto è sparito: dice quale componente migliorare (motori = né whisper né Voxtral l&apos;avevano sentito; whisper e arbitro = Voxtral l&apos;aveva, l&apos;arbitro ha scelto male).</p>
          <ul>
            {origini.map((o) => (
              <li key={o.origine}><strong>{o.origine.replaceAll('_', ' ')}</strong>: {o.n}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small"><Link href="/referti/confronto">Confronto cieco tra versioni della catena →</Link></p>
    </div>
  );
}
