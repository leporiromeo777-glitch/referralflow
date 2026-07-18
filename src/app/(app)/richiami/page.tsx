import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { eta } from '@/lib/format';
import { segnaGestito, creaReferralControllo } from './actions';

export const dynamic = 'force-dynamic';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const IconClock = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
);
const IconCalMonth = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="m9 16 2 2 4-4" /></svg>
);

type Row = {
  id: string;
  tipo: 'referral' | 'appuntamento';
  follow_up_due: string;
  follow_up_months: number;
  ultima_visita: string | null;
  in_ritardo: boolean;
  cognome: string;
  nome: string;
  data_nascita: string | null;
  telefono: string | null;
  medico_nome: string | null;
};

function dataBreve(d: string): string {
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function Richiami() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Due fonti: referral (deciso alla chiusura o dal programma se collegato)
  // e appuntamenti d'agenda senza referral (deciso dal programma del giorno).
  const rows = await query<Row>(
    `select r.id, 'referral' as tipo, r.follow_up_due::text, r.follow_up_months,
            (select max(changed_at) from referral_status_history
              where referral_id = r.id and to_status = 'vista')::text as ultima_visita,
            (r.follow_up_due <= current_date) as in_ritardo,
            p.cognome, p.nome, p.data_nascita, p.telefono,
            d.nome as medico_nome
       from referrals r
       join patients p on p.id = r.patient_id
       left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1
        and r.follow_up_due is not null and r.follow_up_done_at is null
     union all
     select a.id, 'appuntamento' as tipo, a.follow_up_due::text, a.follow_up_months,
            a.starts_at::text as ultima_visita,
            (a.follow_up_due <= current_date) as in_ritardo,
            coalesce(a.paziente_nome, a.titolo, 'Paziente') as cognome, '' as nome,
            null as data_nascita, null as telefono,
            pr.nome as medico_nome
       from appointments a
       left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1
        and a.follow_up_due is not null and a.follow_up_done_at is null
        and a.referral_id is null
      order by follow_up_due asc`,
    [session.studioId]
  );

  const inRitardo = rows.filter((r) => r.in_ritardo);
  const prossimi = rows.filter((r) => !r.in_ritardo);

  // Quanti pazienti sono stati ricontattati (richiamo gestito, in un modo o
  // nell'altro) nell'ultimo mese — stessa fonte dei richiami (referral +
  // appuntamenti), stavolta con follow_up_done_at valorizzato.
  const [ricontattatiMese] = await query<{ mese: number }>(
    `select count(*)::int as mese
     from (
       select follow_up_done_at as done_at from referrals
        where studio_id = $1 and follow_up_done_at is not null
       union all
       select follow_up_done_at as done_at from appointments
        where studio_id = $1 and follow_up_done_at is not null
     ) x
     where done_at >= now() - interval '30 days'`,
    [session.studioId]
  );

  // Tempo medio di richiamo: giorni che passano in media tra la scadenza del
  // controllo e quando viene effettivamente gestito (ultimi 90 giorni) — un
  // dato di efficienza, non solo di volume.
  const [tempoRichiamo] = await query<{ giorni: number | null }>(
    `select round(avg(greatest(0, done_at::date - due_date))::numeric, 1) as giorni
     from (
       select follow_up_due as due_date, follow_up_done_at as done_at from referrals
        where studio_id = $1 and follow_up_done_at is not null and follow_up_due is not null
          and follow_up_done_at >= now() - interval '90 days'
       union all
       select follow_up_due as due_date, follow_up_done_at as done_at from appointments
        where studio_id = $1 and follow_up_done_at is not null and follow_up_due is not null
          and follow_up_done_at >= now() - interval '90 days'
     ) x`,
    [session.studioId]
  );

  const Riga = ({ r }: { r: Row }) => {
    const contenuto = (
      <div className="qrow-main">
        <div className="qrow-top">
          <span className="pname">
            {r.cognome} {r.nome}
            {r.data_nascita ? <span className="age">, {eta(r.data_nascita)}</span> : null}
          </span>
          <span className={`badge ${r.in_ritardo ? 'badge-danger' : ''}`}>
            da rivedere: {dataBreve(r.follow_up_due)}
          </span>
        </div>
        <div className="qrow-sub">
          {r.medico_nome ?? 'Medico non indicato'}
          {r.tipo === 'appuntamento' ? ' · da agenda' : ''}
          {r.telefono ? ` · ${r.telefono}` : ' · telefono non registrato'}
        </div>
        <div className="qrow-meta">
          <span className="meta">
            Controllo a {r.follow_up_months} mesi
            {r.ultima_visita ? ` dall'ultima visita (${dataBreve(r.ultima_visita)})` : ''}
          </span>
        </div>
      </div>
    );
    return (
      <li className={`qrow qrow-flex tone-${r.in_ritardo ? 'danger' : 'gray'}`}>
        {r.tipo === 'referral' ? (
          <Link href={`/referral/${r.id}`} className="qrow-link">{contenuto}</Link>
        ) : (
          <div className="qrow-link">{contenuto}</div>
        )}
        <div className="qrow-action wait-action">
          {r.tipo === 'referral' && (
            <form action={creaReferralControllo}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn btn-primary btn-small" type="submit"
                title="Nuova referral di controllo precompilata, pronta da prenotare; il richiamo viene segnato gestito.">
                + Crea referral di controllo
              </button>
            </form>
          )}
          <form action={segnaGestito}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="tipo" value={r.tipo} />
            <button className="btn btn-ghost btn-small" type="submit">Segna gestito</button>
          </form>
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="coda-top">
        <div className="coda-hero">
          <span className="coda-eyebrow">Controlli da rivedere</span>
          <h1>Follow-up</h1>
          <p className="coda-lede">
            Pazienti da rivedere, in base alla decisione presa alla chiusura della referral.
            «Crea referral di controllo» apre subito la nuova visita; «Segna gestito» se il
            paziente è stato contattato in altro modo.
          </p>
        </div>
        <div className="rc-stats">
          <div className="rc-stat">
            <span className="v">{inRitardo.length}</span>
            <span className="k">Da richiamare ora</span>
          </div>
          <div className="rc-stat">
            <span className="v">{prossimi.length}</span>
            <span className="k">Programmati</span>
          </div>
          <div className="rc-stat">
            <span className="v">{rows.length}</span>
            <span className="k">Totale in agenda</span>
          </div>
        </div>
      </div>

      <div className="stat-grid stat-grid-2">
        <div className="stat-card">
          <span className="stat-badge"><IconCalMonth /></span>
          <span className="stat-body">
            <span className="stat-value">{ricontattatiMese?.mese ?? 0}</span>
            <span className="stat-label">Ricontattati questo mese</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-badge"><IconClock /></span>
          <span className="stat-body">
            <span className="stat-value">{tempoRichiamo?.giorni ?? '—'}<small> g</small></span>
            <span className="stat-label">Tempo medio di richiamo</span>
          </span>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="empty">
          Nessun richiamo in agenda. Si aggiungono chiudendo una referral con «da rivedere».
        </div>
      )}

      {inRitardo.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">Da richiamare <span className="badge badge-danger">{inRitardo.length}</span></h2>
          <ul className="queue">{inRitardo.map((r) => <Riga key={r.id} r={r} />)}</ul>
        </section>
      )}

      {prossimi.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">Prossimi controlli</h2>
          <ul className="queue">{prossimi.map((r) => <Riga key={r.id} r={r} />)}</ul>
        </section>
      )}
    </>
  );
}
