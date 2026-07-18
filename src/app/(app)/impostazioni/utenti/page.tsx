import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createUser, resetPassword, toggleUser } from './actions';

export const dynamic = 'force-dynamic';

// Gestione degli accessi dello studio: solo l'amministratore (recinto anche nel
// middleware). Crea le credenziali dei colleghi, reimposta le password,
// disattiva gli account (mai eliminati: restano nell'audit).

const RUOLI: Record<string, string> = {
  segretaria: 'Segreteria',
  medico: 'Medico',
  admin: 'Amministratore',
};

type Utente = {
  id: string;
  email: string;
  role: string;
  attivo: boolean;
  created_at: string;
  provider_nome: string | null;
};

function dataBreve(d: string): string {
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ERRORI: Record<string, string> = {
  email: 'Inserisci un indirizzo email valido.',
  password: 'La password deve avere almeno 8 caratteri.',
  esiste: 'Esiste già un account con questa email.',
};
const OK: Record<string, string> = {
  creato: 'Account creato: comunica le credenziali al collega.',
  password: 'Password reimpostata.',
};

export default async function Utenti({
  searchParams,
}: {
  searchParams: { err?: string; ok?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');

  const utenti = await query<Utente>(
    `select u.id, u.email, u.role::text, u.attivo, u.created_at,
            p.nome as provider_nome
       from users u
       left join providers p on p.user_id = u.id
      where u.studio_id = $1
      order by u.created_at`,
    [session.studioId]
  );

  return (
    <>
      <div className="page-head">
        <h1>Utenti dello studio</h1>
      </div>
      <p className="muted">
        Gli account di {session.studioNome}. Crea le credenziali per i colleghi:
        la segreteria gestisce la coda, il ruolo «Medico» vede solo il proprio programma
        del giorno, l'amministratore fa tutto e gestisce questa pagina.
      </p>

      {searchParams.err && ERRORI[searchParams.err] && (
        <p className="error">{ERRORI[searchParams.err]}</p>
      )}
      {searchParams.ok && OK[searchParams.ok] && (
        <div className="card notice"><p>{OK[searchParams.ok]} ✓</p></div>
      )}

      <div className="cols">
        <div className="card">
          <h2>Account attivi</h2>
          <ul className="mlist">
            {utenti.map((u) => (
              <li key={u.id} className={`mrow${u.attivo ? '' : ' inactive'}`}>
                <div className="mrow-head">
                  <div>
                    <span className="mname">{u.email}</span>
                    {u.id === session.id && <span className="badge"> tu</span>}
                    {!u.attivo && <span className="badge badge-danger"> disattivato</span>}
                  </div>
                  <span className="badge">{RUOLI[u.role] ?? u.role}</span>
                </div>
                <p className="tmeta">
                  {u.provider_nome ? `Collegato a: ${u.provider_nome} · ` : ''}
                  Creato il {dataBreve(u.created_at)}
                </p>
                <div className="mrow-links">
                  <details className="complete">
                    <summary className="btn btn-ghost btn-small">Reimposta password</summary>
                    <form action={resetPassword} className="complete-form card">
                      <input type="hidden" name="id" value={u.id} />
                      <label>Nuova password (min. 8 caratteri)
                        <input name="password" type="password" required minLength={8}
                          autoComplete="new-password" />
                      </label>
                      <button className="btn btn-primary btn-small" type="submit">Reimposta</button>
                    </form>
                  </details>
                  {u.id !== session.id && (
                    <form action={toggleUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn btn-ghost btn-small" type="submit">
                        {u.attivo ? 'Disattiva' : 'Riattiva'}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Crea un accesso</h2>
          <form action={createUser} className="feed-form">
            <label>Email
              <input name="email" type="email" required maxLength={160}
                placeholder="collega@studio.ch" />
            </label>
            <label>Password (min. 8 caratteri)
              <input name="password" type="password" required minLength={8}
                autoComplete="new-password" />
            </label>
            <label>Ruolo
              <select name="ruolo" defaultValue="segretaria">
                <option value="segretaria">Segreteria — gestisce coda e agenda</option>
                <option value="medico">Medico — vede solo il suo programma</option>
                <option value="admin">Amministratore — tutto, inclusi gli utenti</option>
              </select>
            </label>
            <button className="btn btn-primary" type="submit">Crea account</button>
          </form>
          <p className="tmeta">
            Per collegare un account «Medico» al suo calendario, usa la pagina
            «Agenda: feed e medici» del Programma.
          </p>
        </div>
      </div>
    </>
  );
}
