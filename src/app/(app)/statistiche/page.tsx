import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Statistiche dello studio: le 4 metriche chiave + due grafici che servono
// davvero — il volume settimanale (il polso dell'attività) e i tempi di
// prenotazione mese per mese (il numero che dimostra il valore dello studio
// ai medici invianti). SVG server-side, nessuna dipendenza.

type Punto = { label: string; value: number | null };

// Grafico a barre minimale: barre verdi arrotondate, valore sopra, mese sotto.
function BarChart({ dati, unita }: { dati: Punto[]; unita?: string }) {
  const W = 640;
  const H = 200;
  const pad = { top: 26, bottom: 26, left: 8, right: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...dati.map((d) => d.value ?? 0));
  const slot = innerW / Math.max(1, dati.length);
  const barW = Math.min(46, slot * 0.55);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Grafico a barre" style={{ display: 'block' }}>
      {/* linea di base */}
      <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom}
        stroke="var(--line-strong)" strokeWidth="1" />
      {dati.map((d, i) => {
        const cx = pad.left + slot * i + slot / 2;
        const v = d.value ?? 0;
        const h = d.value === null ? 0 : Math.max(v > 0 ? 6 : 2, (v / max) * innerH);
        const y = H - pad.bottom - h;
        return (
          <g key={i}>
            {d.value !== null && (
              <rect x={cx - barW / 2} y={y} width={barW} height={h} rx={7}
                fill="var(--cta)" opacity={0.92} />
            )}
            <text x={cx} y={y - 7} textAnchor="middle" fontSize="12.5" fontWeight="650"
              fill="var(--ink)">
              {d.value === null ? '—' : `${d.value}${unita ?? ''}`}
            </text>
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="11"
              fill="var(--muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function Statistiche() {
  const session = await getSession();
  if (!session) redirect('/login');
  const sid = session.studioId;

  const [tot] = await query<{ n: string }>(
    'select count(*)::int as n from referrals where studio_id = $1', [sid]
  );
  const [prenotate] = await query<{ n: string }>(
    `select count(distinct h.referral_id)::int as n
     from referral_status_history h
     join referrals r on r.id = h.referral_id
     where h.to_status = 'prenotata' and r.studio_id = $1`, [sid]
  );
  const [tempo] = await query<{ giorni: number | null }>(
    `select round(avg(extract(epoch from (h.first_prenotata - r.created_at)) / 86400.0)::numeric, 1) as giorni
     from referrals r
     join (
       select referral_id, min(changed_at) as first_prenotata
       from referral_status_history where to_status = 'prenotata' group by referral_id
     ) h on h.referral_id = r.id
     where r.studio_id = $1`, [sid]
  );
  const [mediciAttivi] = await query<{ n: string }>(
    `select count(distinct referring_doctor_id)::int as n from referrals
     where studio_id = $1
       and created_at > now() - interval '90 days' and referring_doctor_id is not null`, [sid]
  );

  // Volume settimanale: tutte le 8 settimane, anche quelle a zero
  // (generate_series), così il grafico non «salta» i buchi.
  const settimane = await query<{ label: string; n: number }>(
    `select to_char(w, 'DD.MM') as label,
            (select count(*)::int from referrals r
              where r.studio_id = $1
                and r.created_at >= w and r.created_at < w + interval '1 week') as n
       from generate_series(
              date_trunc('week', now()) - interval '7 weeks',
              date_trunc('week', now()), interval '1 week') as w
      order by w`, [sid]
  );

  // Tempi di prenotazione per mese (ultimi 6): la media dei giorni tra
  // richiesta e appuntamento fissato. Mesi senza prenotazioni → «—».
  const tempi = await query<{ label: string; giorni: number | null }>(
    `select to_char(m, 'Mon') as label,
            (select round(avg(extract(epoch from (p.prima - r.created_at)) / 86400.0)::numeric, 1)
               from referrals r
               join (select referral_id, min(changed_at) as prima
                       from referral_status_history where to_status = 'prenotata'
                      group by referral_id) p on p.referral_id = r.id
              where r.studio_id = $1
                and p.prima >= m and p.prima < m + interval '1 month') as giorni
       from generate_series(
              date_trunc('month', now()) - interval '5 months',
              date_trunc('month', now()), interval '1 month') as m
      order by m`, [sid]
  );

  const totN = Number(tot?.n ?? 0);
  const prenN = Number(prenotate?.n ?? 0);
  const conv = totN ? Math.round((prenN / totN) * 100) : 0;
  const volumeVuoto = settimane.every((s) => Number(s.n) === 0);

  return (
    <>
      <header className="hero-solid">
        <div className="hero-top">
          <span className="hero-eyebrow">Analisi dello studio</span>
          <a className="btn btn-small" href="/api/export/referrals">Esporta CSV</a>
        </div>
        <h1>Statistiche</h1>
        <p className="hero-lede">
          I numeri che raccontano lo studio: quante richieste arrivano, quanto in
          fretta diventano appuntamenti, quali medici vi inviano di più.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="k">Referral totali</span>
            <span className="v">{totN}</span>
          </div>
          <div className="hero-stat">
            <span className="k">Convertite in appuntamento</span>
            <span className="v">{conv}%</span>
          </div>
          <div className="hero-stat">
            <span className="k">Tempo medio → appuntamento</span>
            <span className="v">{tempo?.giorni ?? '—'}<small> g</small></span>
          </div>
          <div className="hero-stat">
            <span className="k">Medici invianti attivi (90g)</span>
            <span className="v">{Number(mediciAttivi?.n ?? 0)}</span>
          </div>
        </div>
      </header>

      <div className="card chart-card">
        <h2>Richieste ricevute — ultime 8 settimane</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Il polso dell'attività: ogni barra è una settimana (data d'inizio).
        </p>
        {volumeVuoto ? (
          <p className="muted">Nessuna richiesta nel periodo.</p>
        ) : (
          <BarChart dati={settimane.map((s) => ({ label: s.label, value: Number(s.n) }))} />
        )}
      </div>

      <div className="card chart-card">
        <h2>Giorni per fissare l'appuntamento — ultimi 6 mesi</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Quanto passa in media dalla richiesta all'appuntamento fissato: più la
          barra è bassa, più lo studio è veloce. È il numero da mostrare ai
          medici invianti.
        </p>
        <BarChart
          dati={tempi.map((t) => ({
            label: t.label,
            value: t.giorni === null ? null : Number(t.giorni),
          }))}
          unita=" g"
        />
      </div>
    </>
  );
}
