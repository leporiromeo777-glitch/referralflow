import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { toggleStudio, aggiornaPiano } from '../actions';

export const dynamic = 'force-dynamic';

// Scheda di un singolo studio per il titolare della piattaforma: tutti i dati
// che servono (piano, contatti, utenti, medici, attività) e le azioni.
// Pensata per il telefono: si arriva qui toccando lo studio nell'elenco.

const PIANO_BADGE: Record<string, { label: string; tone: string }> = {
  pilota: { label: 'pilota', tone: 'gray' },
  prova: { label: 'prova', tone: 'accent' },
  attivo: { label: 'abbonato', tone: 'success' },
  sospeso: { label: 'sospeso', tone: 'danger' },
};

const RUOLI: Record<string, string> = {
  segretaria: 'Segreteria',
  medico: 'Medico',
  admin: 'Amministratore',
};

function dataBreve(iso: string | null): string {
  if (!iso) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

export default async function SchedaStudio({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const owner = (process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner || session.email.toLowerCase() !== owner) redirect('/');

  const [studio] = await query<{
    id: string; nome: string; slug: string; titolare: string | null;
    notify_email: string | null; telefono: string | null; specialita: string | null;
    attivo: boolean; created_via: string | null; created_at: string;
    abbonamento: string; trial_until: string | null; trial_giorni: number | null;
  }>(
    `select id, nome, slug, titolare, notify_email, telefono, specialita,
            attivo, created_via, created_at::text,
            abbonamento, trial_until::text, (trial_until - current_date) as trial_giorni
       from studios where id = $1`,
    [params.id]
  );
  if (!studio) notFound();

  const [attivita] = await query<{
    referral_tot: number; referral_30g: number; referral_aperte: number;
    invianti: number; ultima: string | null;
  }>(
    `select count(*)::int as referral_tot,
            count(*) filter (where created_at > now() - interval '30 days')::int as referral_30g,
            count(*) filter (where status <> 'chiusa')::int as referral_aperte,
            (select count(*) from referring_doctors d where d.studio_id = $1)::int as invianti,
            max(created_at)::text as ultima
       from referrals where studio_id = $1`,
    [params.id]
  );

  const utenti = await query<{ email: string; role: string; attivo: boolean; created_at: string }>(
    `select email, role::text, attivo, created_at::text
       from users where studio_id = $1 order by created_at`,
    [params.id]
  );

  const medici = await query<{ nome: string; attivo: boolean }>(
    `select nome, attivo from providers where studio_id = $1 order by nome`,
    [params.id]
  );

  const piano = PIANO_BADGE[studio.abbonamento] ?? { label: studio.abbonamento, tone: 'gray' };
  const provaScaduta = studio.abbonamento === 'prova'
    && studio.trial_giorni !== null && studio.trial_giorni < 0;
  const mio = studio.id === session.studioId;

  return (
    <>
      <p><Link href="/piattaforma" className="muted">← Piattaforma</Link></p>
      <div className="page-head">
        <h1>{studio.nome}</h1>
        <span className={`badge badge-${provaScaduta ? 'danger' : piano.tone}`}>{piano.label}</span>
        {studio.created_via === 'self-service' && <span className="badge badge-accent">self-service</span>}
        {!studio.attivo && <span className="badge badge-danger">disattivato</span>}
        {mio && <span className="badge">il tuo studio</span>}
      </div>

      <div className="metrics">
        <div className="metric">
          <span className="metric-label">Referral totali</span>
          <span className="metric-value">{attivita?.referral_tot ?? 0}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Ultimi 30 giorni</span>
          <span className="metric-value">{attivita?.referral_30g ?? 0}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Aperte ora</span>
          <span className="metric-value">{attivita?.referral_aperte ?? 0}</span>
        </div>
      </div>

      <div className="card">
        <h2>Dati dello studio</h2>
        <dl className="kv">
          <dt>Medico titolare</dt><dd>{studio.titolare ?? '—'}</dd>
          <dt>Email notifiche</dt><dd>{studio.notify_email ?? '—'}</dd>
          <dt>Telefono</dt><dd>{studio.telefono ?? '—'}</dd>
          <dt>Specialità</dt><dd>{studio.specialita ?? '—'}</dd>
          <dt>Modulo pubblico</dt>
          <dd><a href={`/invia?s=${studio.slug}`} target="_blank">/invia?s={studio.slug}</a></dd>
          <dt>Origine</dt>
          <dd>{studio.created_via === 'self-service' ? 'attivazione self-service' : 'creato manualmente'}</dd>
          <dt>Creato</dt><dd>{dataOra(studio.created_at)}</dd>
          <dt>Ultima referral</dt>
          <dd>{attivita?.ultima ? dataOra(attivita.ultima) : '—'}</dd>
          <dt>Medici invianti in rubrica</dt><dd>{attivita?.invianti ?? 0}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Abbonamento</h2>
        <p className="muted">
          {studio.abbonamento === 'prova' && studio.trial_until
            ? (provaScaduta
                ? `Prova scaduta il ${dataBreve(studio.trial_until)} — da sentire per l'abbonamento.`
                : `In prova gratuita fino al ${dataBreve(studio.trial_until)}.`)
            : studio.abbonamento === 'attivo'
              ? 'Abbonamento attivo (pagamento concordato).'
              : studio.abbonamento === 'sospeso'
                ? 'Sospeso: da riattivare quando la situazione si chiarisce.'
                : 'Studio pilota: nessuna scadenza.'}
        </p>
        <form action={aggiornaPiano} className="reg-form">
          <input type="hidden" name="studio_id" value={studio.id} />
          <div className="grid2">
            <label>Piano
              <select name="abbonamento" defaultValue={studio.abbonamento}>
                <option value="pilota">pilota (senza scadenza)</option>
                <option value="prova">prova (con scadenza)</option>
                <option value="attivo">abbonato (paga)</option>
                <option value="sospeso">sospeso</option>
              </select>
            </label>
            <label>Scadenza prova
              <input type="date" name="trial_until" defaultValue={studio.trial_until ?? ''} />
            </label>
          </div>
          <button className="btn btn-primary btn-small" type="submit">Salva piano</button>
        </form>
      </div>

      <div className="card">
        <h2>Utenti <span className="badge">{utenti.length}</span></h2>
        {utenti.length === 0 ? (
          <p className="muted">Nessun utente.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Email</th><th>Ruolo</th><th>Stato</th><th>Creato</th></tr>
            </thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.email}>
                  <td>{u.email}</td>
                  <td>{RUOLI[u.role] ?? u.role}</td>
                  <td>{u.attivo ? 'attivo' : 'disattivato'}</td>
                  <td className="tmeta">{dataOra(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {medici.length > 0 && (
        <div className="card">
          <h2>Medici dello studio <span className="badge">{medici.length}</span></h2>
          <ul className="attach-list">
            {medici.map((m) => (
              <li key={m.nome}>{m.nome}{m.attivo ? '' : ' (non attivo)'}</li>
            ))}
          </ul>
        </div>
      )}

      {!mio && (
        <div className="card">
          <h2>{studio.attivo ? 'Disattiva studio' : 'Riattiva studio'}</h2>
          <p className="muted">
            {studio.attivo
              ? 'Disattivato, nessuno dei suoi utenti potrà più accedere e non riceverà più affidi.'
              : 'Riattivandolo, utenti e affidi tornano a funzionare normalmente.'}
          </p>
          <form action={toggleStudio}>
            <input type="hidden" name="studio_id" value={studio.id} />
            <button className="btn btn-small" type="submit">
              {studio.attivo ? 'Disattiva' : 'Riattiva'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
