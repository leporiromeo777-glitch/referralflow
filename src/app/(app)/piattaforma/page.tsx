import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Pannello del titolare della piattaforma (solo PLATFORM_OWNER_EMAIL):
// chi si è registrato, quali studi sono attivi, il funnel in corso.
// Nessun dato di pazienti: solo anagrafiche di studi e medici.

type StudioRow = {
  id: string;
  nome: string;
  slug: string;
  notify_email: string | null;
  specialita: string | null;
  titolare: string | null;
  attivo: boolean;
  created_via: string | null;
  abbonamento: string;
  trial_until: string | null;
  trial_giorni: number | null;
  created_at: string;
  n_utenti: number;
  n_referral: number;
  n_ricevute_30g: number;
};

// Etichette dei piani (gestione manuale finché non c'è Stripe).
const PIANO_BADGE: Record<string, { label: string; tone: string }> = {
  pilota: { label: 'pilota', tone: 'gray' },
  prova: { label: 'prova', tone: 'accent' },
  attivo: { label: 'abbonato', tone: 'success' },
  sospeso: { label: 'sospeso', tone: 'danger' },
};

type InvianteRow = {
  nome: string;
  studio: string | null;
  email: string;
  created_at: string;
  n_invii: number;
};

type AttivazioneRow = {
  nome: string;
  email: string;
  created_at: string;
};

export default async function Piattaforma() {
  const session = await getSession();
  if (!session) redirect('/login');
  const owner = (process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner || session.email.toLowerCase() !== owner) redirect('/');

  const studi = await query<StudioRow>(
    `select s.id, s.nome, s.slug, s.notify_email, s.specialita, s.titolare, s.attivo,
            s.created_via, s.abbonamento, s.trial_until::text,
            (s.trial_until - current_date) as trial_giorni,
            s.created_at::text,
            (select count(*) from users u where u.studio_id = s.id)::int as n_utenti,
            (select count(*) from referrals r where r.studio_id = s.id)::int as n_referral,
            (select count(*) from referrals r
              where r.studio_id = s.id
                and r.created_at > now() - interval '30 days')::int as n_ricevute_30g
       from studios s
      order by s.created_at desc`
  );

  const invianti = await query<InvianteRow>(
    `select ip.nome, ip.studio, u.email, u.created_at::text,
            (select count(*) from referrals r
               join referring_doctors d on d.id = r.referring_doctor_id
              where lower(d.email) = lower(u.email))::int as n_invii
       from inviante_profiles ip
       join users u on u.id = ip.user_id
      order by u.created_at desc`
  );

  // Attivazioni iniziate ma non completate: contatti caldi da richiamare.
  const incompiute = await query<AttivazioneRow>(
    `select nome, email, created_at::text
       from studio_activations
      where used_at is null and created_at > now() - interval '14 days'
      order by created_at desc`
  );

  return (
    <>
      <div className="page-head">
        <h1>Piattaforma</h1>
      </div>
      <p className="muted">
        Il quadro della piattaforma: studi attivi, medici invianti registrati e
        attivazioni in corso. Ricevi anche un'email a ogni novità.
      </p>

      <div className="metrics">
        <div className="metric">
          <span className="metric-label">Studi attivi</span>
          <span className="metric-value">{studi.filter((s) => s.attivo).length}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Medici invianti registrati</span>
          <span className="metric-value">{invianti.length}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Referral (30 giorni, tutta la piattaforma)</span>
          <span className="metric-value">
            {studi.reduce((tot, s) => tot + s.n_ricevute_30g, 0)}
          </span>
        </div>
      </div>

      <section className="prog-group">
        <h2 className="prog-doctor">Studi <span className="badge">{studi.length}</span></h2>
        <p className="muted">Tocca uno studio per la scheda completa (piano, utenti, azioni).</p>
        {/* Lista compatta e toccabile (comoda da telefono): il dettaglio vive
            nella scheda /piattaforma/[id]. */}
        <ul className="queue">
          {studi.map((s) => {
            const piano = PIANO_BADGE[s.abbonamento] ?? { label: s.abbonamento, tone: 'gray' };
            const provaScaduta = s.abbonamento === 'prova'
              && s.trial_giorni !== null && s.trial_giorni < 0;
            return (
              <li key={s.id} className={`qrow tone-${s.attivo ? (provaScaduta ? 'danger' : 'gray') : 'gray'}`}
                style={s.attivo ? undefined : { opacity: 0.55 }}>
                <Link href={`/piattaforma/${s.id}`} className="qrow-link">
                  <div className="qrow-main">
                    <div className="qrow-top">
                      <span className="pname">{s.nome}</span>
                      <span className={`badge badge-${provaScaduta ? 'danger' : piano.tone}`}>
                        {piano.label}
                        {s.abbonamento === 'prova' && s.trial_until
                          ? ` ${provaScaduta ? 'scaduta' : `fino al ${s.trial_until.slice(8, 10)}.${s.trial_until.slice(5, 7)}`}`
                          : ''}
                      </span>
                      {!s.attivo && <span className="badge badge-danger">disattivato</span>}
                      {s.id === session.studioId && <span className="badge">il tuo</span>}
                    </div>
                    <div className="qrow-sub">
                      {s.titolare ? `${s.titolare} · ` : ''}
                      {s.created_via === 'self-service' ? 'self-service' : 'manuale'}
                    </div>
                    <div className="qrow-meta">
                      <span className="meta">{s.n_utenti} utenti</span>
                      <span className="meta">{s.n_referral} referral ({s.n_ricevute_30g} negli ultimi 30g)</span>
                      <span className="meta">dal {dataOra(s.created_at)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="prog-group">
        <h2 className="prog-doctor">
          Medici invianti registrati <span className="badge">{invianti.length}</span>
        </h2>
        {invianti.length === 0 ? (
          <div className="empty">Ancora nessun medico registrato dal portale.</div>
        ) : (
          <div className="card">
            <table className="tbl">
              <thead>
                <tr><th>Medico</th><th>Email</th><th>Invii</th><th>Registrato</th></tr>
              </thead>
              <tbody>
                {invianti.map((m) => (
                  <tr key={m.email}>
                    <td>
                      <strong>{m.nome}</strong>
                      {m.studio && <div className="tmeta">{m.studio}</div>}
                    </td>
                    <td className="tmeta">{m.email}</td>
                    <td>{m.n_invii}</td>
                    <td className="tmeta">{dataOra(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {incompiute.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">
            Attivazioni iniziate e non completate <span className="badge">{incompiute.length}</span>
          </h2>
          <p className="muted">
            Hanno chiesto il codice ma non hanno finito: contatti caldi — una
            telefonata può chiudere l'attivazione.
          </p>
          <div className="card">
            <table className="tbl">
              <thead>
                <tr><th>Studio</th><th>Email</th><th>Quando</th></tr>
              </thead>
              <tbody>
                {incompiute.map((a, i) => (
                  <tr key={i}>
                    <td>{a.nome}</td>
                    <td className="tmeta">{a.email}</td>
                    <td className="tmeta">{dataOra(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
