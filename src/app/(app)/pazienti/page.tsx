import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS } from '@/lib/status';
import { eta, dataOra } from '@/lib/format';

export const dynamic = 'force-dynamic';

// «Pazienti»: si parte dalla ricerca e si arriva alla persona. Ogni paziente
// mostra il suo percorso più recente; da lì si apre il dettaglio della referral.
// Il paziente è al centro, non la singola pratica.

type Row = {
  id: string; cognome: string; nome: string; data_nascita: string | null;
  telefono: string | null;
  referral_id: string | null; status: string | null; ultima: string | null;
  n_referral: number;
};

export default async function Pazienti({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const q = (searchParams.q ?? '').trim();

  let rows: Row[] = [];
  if (q.length >= 2) {
    rows = await query<Row>(
      `select p.id, p.cognome, p.nome, p.data_nascita, p.telefono,
              r.id as referral_id, r.status::text as status, r.created_at::text as ultima,
              (select count(*) from referrals r2 where r2.patient_id = p.id)::int as n_referral
         from patients p
         left join lateral (
           select id, status, created_at from referrals
            where patient_id = p.id order by created_at desc limit 1
         ) r on true
        where p.studio_id = $1
          and (p.cognome ilike $2 or p.nome ilike $2 or p.telefono ilike $2)
        order by p.cognome, p.nome
        limit 50`,
      [session.studioId, `%${q}%`]
    );
  }

  return (
    <div className="paz">
      <header className="oggi-head">
        <div>
          <span className="oggi-eyebrow">Le persone dello studio</span>
          <h1>Pazienti</h1>
          <p className="oggi-lede">
            Cerca per cognome, nome o telefono: trovi la persona, il suo percorso e la sua storia.
          </p>
        </div>
      </header>

      <form className="paz-search" method="get">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <input name="q" defaultValue={q} placeholder="Cerca un paziente…" autoFocus autoComplete="off" />
        <button className="btn btn-primary btn-small" type="submit">Cerca</button>
      </form>

      {q.length < 2 ? (
        <div className="empty">Digita almeno due lettere per cercare.</div>
      ) : rows.length === 0 ? (
        <div className="empty">Nessun paziente trovato per «{q}».</div>
      ) : (
        <ul className="queue">
          {rows.map((p) => (
            <li key={p.id} className="qrow qrow-flex">
              <Link href={`/pazienti/${p.id}`} className="qrow-link">
                <div className="qrow-main">
                  <div className="qrow-top">
                    <span className="pname">
                      {p.cognome} {p.nome}
                      {p.data_nascita ? <span className="age">, {eta(p.data_nascita)}</span> : null}
                    </span>
                    {p.status && (
                      <span className={`badge badge-${STATUS[p.status]?.tone}`}>{STATUS[p.status]?.label}</span>
                    )}
                  </div>
                  <div className="qrow-sub">
                    {p.telefono ? `☎ ${p.telefono}` : 'telefono non registrato'}
                    {p.n_referral > 0 ? ` · ${p.n_referral} ${p.n_referral === 1 ? 'referral' : 'referral'}` : ' · nessuna referral'}
                    {p.ultima ? ` · ultima ${dataOra(p.ultima)}` : ''}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
