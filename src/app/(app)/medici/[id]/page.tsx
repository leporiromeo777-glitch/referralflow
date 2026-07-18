import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS, URGENZA } from '@/lib/status';
import { eta, dataOra } from '@/lib/format';
import { CopyLink } from '../CopyLink';
import { rotateToken } from '../actions';

export const dynamic = 'force-dynamic';

type Doc = {
  id: string; nome: string; studio: string | null;
  email: string | null; hin_address: string | null; telefono: string | null;
  token: string; token_expires_at: string; scaduto: boolean;
};
type Stats = {
  totali: number; aperte: number; urgenti_aperte: number;
  prenotate: number; giorni_medi: number | null; ultima: string | null;
};
type Row = {
  id: string; quesito: string | null; urgenza: string; status: string;
  appuntamento_at: string | null; created_at: string;
  cognome: string; nome: string; data_nascita: string | null;
};

function dataBreve(d: string): string {
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function MedicoDetail({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [doc] = await query<Doc>(
    `select id, nome, studio, email, hin_address, telefono, token, token_expires_at,
            (token_expires_at <= now()) as scaduto
       from referring_doctors where id = $1 and studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!doc) notFound();

  const [stats] = await query<Stats>(
    `select count(*)::int as totali,
            count(*) filter (where status <> 'chiusa')::int as aperte,
            count(*) filter (where status <> 'chiusa' and urgenza = 'urgente')::int as urgenti_aperte,
            count(h.referral_id)::int as prenotate,
            round(avg(extract(epoch from (h.first_prenotata - r.created_at)) / 86400.0)::numeric, 1) as giorni_medi,
            max(r.created_at)::text as ultima
       from referrals r
       left join (
         select referral_id, min(changed_at) as first_prenotata
           from referral_status_history where to_status = 'prenotata' group by referral_id
       ) h on h.referral_id = r.id
      where r.referring_doctor_id = $1`,
    [params.id]
  );

  const referrals = await query<Row>(
    `select r.id, r.quesito, r.urgenza, r.status, r.appuntamento_at, r.created_at,
            p.cognome, p.nome, p.data_nascita
       from referrals r
       join patients p on p.id = r.patient_id
      where r.referring_doctor_id = $1
      order by r.created_at desc`,
    [params.id]
  );

  const conv = stats.totali ? Math.round((stats.prenotate / stats.totali) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <Link href="/medici" className="back">← Medici</Link>
        <h1>{doc.nome}</h1>
        {doc.studio ? <span className="muted">{doc.studio}</span> : null}
      </div>

      <div className="metrics metrics-4">
        <div className="metric">
          <span className="metric-label">Pazienti portati</span>
          <span className="metric-value">{stats.totali}</span>
        </div>
        <div className="metric">
          <span className="metric-label">In corso ora</span>
          <span className="metric-value">{stats.aperte}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Convertiti in appuntamento</span>
          <span className="metric-value">{conv}%</span>
        </div>
        <div className="metric">
          <span className="metric-label">Tempo medio → appuntamento</span>
          <span className="metric-value">{stats.giorni_medi ?? '—'}<small> g</small></span>
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <h2>Pazienti inviati</h2>
          {referrals.length === 0 && <p className="muted">Nessuna referral da questo medico.</p>}
          <ul className="queue">
            {referrals.map((r) => (
              <li key={r.id} className={`qrow tone-${URGENZA[r.urgenza]?.tone ?? 'gray'}`}>
                <Link href={`/referral/${r.id}`} className="qrow-link">
                  <div className="qrow-main">
                    <div className="qrow-top">
                      <span className="pname">
                        {r.cognome} {r.nome}
                        {r.data_nascita ? <span className="age">, {eta(r.data_nascita)}</span> : null}
                      </span>
                      <span className={`badge badge-${STATUS[r.status]?.tone}`}>
                        {STATUS[r.status]?.label}
                      </span>
                    </div>
                    <div className="qrow-sub">
                      {r.quesito ?? '—'}
                    </div>
                    <div className="qrow-meta">
                      <span className="meta">Inviata: {dataOra(r.created_at)}</span>
                      {r.appuntamento_at ? (
                        <span className="meta">Appuntamento: {dataOra(r.appuntamento_at)}</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Contatti e link</h2>
          <dl className="kv">
            <dt>Email</dt><dd>{doc.email ?? '—'}</dd>
            <dt>Indirizzo HIN</dt><dd>{doc.hin_address ?? '—'}</dd>
            <dt>Telefono</dt><dd>{doc.telefono ?? '—'}</dd>
            <dt>Ultimo invio</dt><dd>{stats.ultima ? dataBreve(stats.ultima) : '—'}</dd>
            <dt>Urgenti aperte</dt><dd>{stats.urgenti_aperte}</dd>
          </dl>

          <div className="mrow-links">
            <CopyLink path={`/invia/${doc.token}`} label="Copia link modulo d'invio" />
            <CopyLink path={`/portale/${doc.token}`} label="Copia link portale" />
          </div>
          <form action={rotateToken} className="rotate-form" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={doc.id} />
            <button className="btn btn-ghost btn-small" type="submit"
              title="I link attuali smettono di funzionare subito: andranno ricondivisi.">
              Rigenera link
            </button>
            <span className={`tmeta${doc.scaduto ? ' expired' : ''}`}>
              {doc.scaduto ? 'Link scaduti' : `Scadono il ${dataBreve(doc.token_expires_at)}`}
            </span>
          </form>
        </div>
      </div>
    </>
  );
}
