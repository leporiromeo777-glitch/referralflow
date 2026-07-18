import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS, URGENZA } from '@/lib/status';
import { eta, dataOra } from '@/lib/format';
import { aggiornaProfilo } from './actions';

export const dynamic = 'force-dynamic';

// Area del medico inviante registrato: tutti i suoi pazienti inviati,
// a tutti gli studi della piattaforma, in un'unica pagina.
// L'abbinamento è per email (le anagrafiche dei singoli studi restano separate).

type Row = {
  id: string;
  quesito: string | null;
  urgenza: string;
  status: string;
  appuntamento_at: string | null;
  created_at: string;
  cognome: string;
  nome: string;
  data_nascita: string | null;
  studio_nome: string;
};
type Profilo = {
  nome: string; studio: string | null; specialita: string | null;
  telefono: string | null; visibile: boolean; avatar_key: string | null;
};

export default async function MieiInvii({
  searchParams,
}: {
  searchParams: { benvenuto?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'inviante') redirect('/');

  const [profilo] = await query<Profilo>(
    'select nome, studio, specialita, telefono, visibile, avatar_key from inviante_profiles where user_id = $1',
    [session.id]
  );

  const rows = await query<Row>(
    `select r.id, r.quesito, r.urgenza::text, r.status::text, r.appuntamento_at::text,
            r.created_at::text,
            p.cognome, p.nome, p.data_nascita::text,
            s.nome as studio_nome
       from referrals r
       join referring_doctors d on d.id = r.referring_doctor_id
       join patients p on p.id = r.patient_id
       join studios s on s.id = r.studio_id
      where lower(d.email) = lower($1)
      order by (r.status = 'chiusa'), r.created_at desc`,
    [session.email]
  );

  const aperte = rows.filter((r) => r.status !== 'chiusa').length;
  const studi = new Set(rows.map((r) => r.studio_nome)).size;

  return (
    <>
      <div className="page-head">
        <h1>I miei invii</h1>
      </div>

      {searchParams.benvenuto && (
        <div className="card notice">
          <p>
            Benvenuto{profilo ? `, ${profilo.nome}` : ''} ✓ — questo è il suo accesso
            personale: tutti i pazienti che invia, a qualunque studio, in un'unica pagina.
            Consiglio: aggiunga ReferralFlow alla schermata Home del telefono.
          </p>
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <span className="metric-label">In corso</span>
          <span className="metric-value">{aperte}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Invii totali</span>
          <span className="metric-value">{rows.length}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Studi</span>
          <span className="metric-value">{studi}</span>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="empty">
          Nessun invio ancora. Usi il modulo d'invio dello studio a cui vuole
          mandare un paziente: gli invii compariranno qui.
        </div>
      )}

      <ul className="queue">
        {rows.map((r) => (
          <li key={r.id} className={`qrow tone-${r.status === 'chiusa' ? 'gray' : URGENZA[r.urgenza]?.tone ?? 'gray'}`}>
            <div className="qrow-link">
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
                  → {r.studio_nome}
                  {r.quesito ? ` · ${r.quesito}` : ''}
                </div>
                <div className="qrow-meta">
                  <span className="meta">Inviata: {dataOra(r.created_at)}</span>
                  {r.appuntamento_at && (
                    <span className="meta">Appuntamento: {dataOra(r.appuntamento_at)}</span>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {profilo && (
        <div className="card profilo-box">
          <h2>Il mio profilo</h2>
          <p className="muted">
            Se visibile nell'annuario, gli studi della piattaforma possono trovarla
            e affidarle pazienti tramite link sicuro.
          </p>
          <form action={aggiornaProfilo} className="feed-form">
            <div className="avatar-edit">
              {profilo.avatar_key ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar-preview" src={`/api/inviante-avatar/${session.id}`} alt="La sua foto profilo" />
              ) : (
                <span className="avatar-preview avatar-preview-empty" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
                </span>
              )}
              <label className="avatar-field">
                Foto profilo <span className="tmeta">(visibile agli studi — JPG o PNG, max 4 MB)</span>
                <input name="foto" type="file" accept=".jpg,.jpeg,.png" />
              </label>
            </div>
            <div className="grid2">
              <label>Studio / pratica
                <input name="studio" defaultValue={profilo.studio ?? ''} maxLength={120} />
              </label>
              <label>Specialità
                <input name="specialita" defaultValue={profilo.specialita ?? ''} maxLength={200}
                  placeholder="Es. Medicina interna generale" />
              </label>
              <label>Telefono
                <input name="telefono" type="tel" defaultValue={profilo.telefono ?? ''} maxLength={40} />
              </label>
              <label className="check-line">
                <input type="checkbox" name="visibile" defaultChecked={profilo.visibile} />
                Visibile nell'annuario della piattaforma
              </label>
            </div>
            <button className="btn btn-primary btn-small" type="submit">Salva profilo</button>
          </form>
        </div>
      )}
    </>
  );
}
