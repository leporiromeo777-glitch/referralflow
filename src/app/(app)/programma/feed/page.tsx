import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { saveFeed, deleteFeed, saveProvider, toggleProvider } from './actions';

export const dynamic = 'force-dynamic';

type Feed = {
  id: string; nome: string; url: string; match_field: string;
  attivo: boolean; last_synced_at: string | null; last_status: string | null;
};
type Provider = {
  id: string; nome: string; aliases: string[]; attivo: boolean;
  login_email: string | null;
};

// L'URL del feed è un segreto (dà accesso all'agenda): si mostra solo l'origine.
function maskUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^webcal:\/\//, 'https://'));
    return `${u.origin}/…`;
  } catch {
    return '…';
  }
}

const MATCH_LABELS: Record<string, string> = {
  summary: 'Titolo (SUMMARY)',
  description: 'Descrizione',
  location: 'Luogo',
  organizer: 'Organizzatore',
};

export default async function FeedConfig() {
  const session = await getSession();
  if (!session) redirect('/login');

  const feeds = await query<Feed>(
    `select id, nome, url, match_field, attivo, last_synced_at, last_status
       from agenda_feeds where studio_id = $1 order by created_at`,
    [session.studioId]
  );
  const providers = await query<Provider>(
    `select p.id, p.nome, p.aliases, p.attivo, u.email as login_email
       from providers p
       left join users u on u.id = p.user_id
      where p.studio_id = $1
      order by p.nome`,
    [session.studioId]
  );

  return (
    <>
      <div className="page-head">
        <Link href="/programma" className="back">← Programma</Link>
        <h1>Agenda: feed e medici</h1>
      </div>

      <div className="cols">
        <div className="card">
          <h2>Feed iCal</h2>
          <p className="muted">
            L'indirizzo del feed dell'agenda (Cassa dei Medici) è riservato: viene mostrato
            solo il dominio. Per cambiarlo, incolla un nuovo indirizzo.
          </p>

          {feeds.map((f) => (
            <form key={f.id} action={saveFeed} className="feed-form">
              <input type="hidden" name="id" value={f.id} />
              <label>Nome
                <input name="nome" defaultValue={f.nome} required />
              </label>
              <label>Indirizzo del feed <span className="tmeta">{maskUrl(f.url)}</span>
                <input name="url" type="url" placeholder="Incolla un nuovo indirizzo per sostituirlo" />
              </label>
              <label>Campo in cui compare il medico
                <select name="match_field" defaultValue={f.match_field}>
                  {Object.entries(MATCH_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <p className="tmeta">
                {f.last_synced_at
                  ? `Ultima sincronizzazione: ${dataOra(f.last_synced_at)} · ${f.last_status ?? ''}`
                  : 'Mai sincronizzato'}
              </p>
              <div className="feed-actions">
                <button className="btn btn-primary" type="submit">Salva</button>
                <button className="btn btn-ghost" formAction={deleteFeed} formNoValidate>Elimina</button>
              </div>
            </form>
          ))}

          <h3>Aggiungi feed</h3>
          <form action={saveFeed} className="feed-form">
            <label>Nome
              <input name="nome" placeholder="Es. Agenda Cassa dei Medici" required />
            </label>
            <label>Indirizzo del feed (https:// o webcal://)
              <input name="url" type="url" placeholder="https://…/agenda.ics" required />
            </label>
            <label>Campo in cui compare il medico
              <select name="match_field" defaultValue="summary">
                {Object.entries(MATCH_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" type="submit">Aggiungi</button>
          </form>
        </div>

        <div className="card">
          <h2>Medici dello studio</h2>
          <p className="muted">
            Gli «alias» sono i modi in cui il medico compare nel calendario (es. «Verdi»,
            «Dr.ssa Verdi»), separati da virgola. Servono ad assegnare automaticamente gli
            appuntamenti.
          </p>

          {providers.map((p) => (
            <form key={p.id} action={saveProvider} className="feed-form">
              <input type="hidden" name="id" value={p.id} />
              <label>Nome
                <input name="nome" defaultValue={p.nome} required />
              </label>
              <label>Alias nel calendario
                <input name="aliases" defaultValue={p.aliases.join(', ')} />
              </label>
              <div className="grid2">
                <label>Email di accesso {p.login_email ? <span className="tmeta">collegato ✓</span> : null}
                  <input name="login_email" type="email" defaultValue={p.login_email ?? ''}
                    placeholder="es. verdi@studio.ch" />
                </label>
                <label>Password {p.login_email ? '(solo per reimpostarla)' : '(per creare l’accesso)'}
                  <input name="login_password" type="password" autoComplete="new-password" />
                </label>
              </div>
              <div className="feed-actions">
                <button className="btn btn-primary" type="submit">Salva</button>
                <button className="btn btn-ghost" formAction={toggleProvider} formNoValidate>
                  {p.attivo ? 'Disattiva' : 'Riattiva'}
                </button>
                {!p.attivo && <span className="badge">disattivato</span>}
              </div>
            </form>
          ))}

          <h3>Aggiungi medico</h3>
          <form action={saveProvider} className="feed-form">
            <label>Nome
              <input name="nome" placeholder="Es. Dr.ssa Verdi" required />
            </label>
            <label>Alias nel calendario
              <input name="aliases" placeholder="Verdi, Dr.ssa Verdi" />
            </label>
            <button className="btn btn-primary" type="submit">Aggiungi</button>
          </form>
        </div>
      </div>
    </>
  );
}
