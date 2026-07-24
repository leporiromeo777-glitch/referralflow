import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { STATUS } from '@/lib/status';
import { dataOra } from '@/lib/format';
import { richiediCodice, completaRegistrazione, inviaConsulto } from './actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; cognome: string; nome: string; status: string;
  quesito: string | null; appuntamento_at: string | null; created_at: string;
};

type ConsultoRow = {
  id: string; domanda: string; risposta: string | null; stato: string;
  created_at: string; answered_at: string | null;
};

const CONSULTO_STATO: Record<string, { label: string; tone: string }> = {
  aperto: { label: 'in attesa di risposta', tone: 'warn' },
  risposto: { label: 'risposto', tone: 'success' },
  convertito: { label: 'convertito in visita', tone: 'accent' },
};

export default async function Portale({
  params, searchParams,
}: {
  params: { token: string };
  searchParams: { reg?: string; consulto?: string };
}) {
  const [doc] = await query<{
    id: string; nome: string; email: string | null;
    scaduto: boolean; studio_nome: string;
  }>(
    `select d.id, d.nome, d.email, (d.token_expires_at <= now()) as scaduto, s.nome as studio_nome
       from referring_doctors d
       join studios s on s.id = d.studio_id
      where d.token = $1`,
    [params.token]
  );
  if (!doc) notFound();

  // Ha già un accesso registrato? Allora proponi il login, non la registrazione.
  const [account] = doc.email
    ? await query<{ id: string }>('select id from users where email = lower($1)', [doc.email])
    : [undefined];

  if (doc.scaduto) {
    return (
      <main className="public">
        <div className="brand brand-lg center">Referral<span>Flow</span></div>
        <p className="muted center">{doc.studio_nome}</p>
        <div className="card notice">
          <h2>Link scaduto</h2>
          <p className="muted">
            Per motivi di sicurezza questo link non è più valido. Contatti la segreteria
            dello studio per ricevere il nuovo link del portale.
          </p>
        </div>
      </main>
    );
  }

  const referrals = await query<Row>(
    `select r.id, p.cognome, p.nome, r.status, r.quesito, r.appuntamento_at, r.created_at
     from referrals r join patients p on p.id = r.patient_id
     where r.referring_doctor_id = $1
     order by r.created_at desc`,
    [doc.id]
  );

  const consulti = await query<ConsultoRow>(
    `select id, domanda, risposta, stato, created_at::text, answered_at::text
       from consulti
      where referring_doctor_id = $1
      order by created_at desc
      limit 50`,
    [doc.id]
  );

  return (
    <main className="public wide">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">{doc.studio_nome} · Portale invianti · {doc.nome}</p>

      {referrals.length === 0 ? (
        <div className="empty">Non hai ancora inviato referral.</div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr><th>Paziente</th><th>Quesito</th><th>Stato</th><th>Appuntamento</th><th>Inviata</th></tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.cognome} {r.nome}</td>
                  <td className="muted">{r.quesito ?? '—'}</td>
                  <td><span className={`badge badge-${STATUS[r.status]?.tone}`}>{STATUS[r.status]?.label}</span></td>
                  <td>{r.appuntamento_at ? dataOra(r.appuntamento_at) : '—'}</td>
                  <td className="muted">{dataOra(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h2>Consulto rapido</h2>
        <p className="muted">
          Una domanda clinica breve allo specialista, senza inviare il paziente:
          la risposta scritta arriva qui. Se poi serve la visita, ci pensiamo noi.
        </p>

        {searchParams.consulto === 'ok' && (
          <p className="success">Domanda inviata: riceverà un avviso quando c'è la risposta.</p>
        )}
        {searchParams.consulto === 'vuoto' && (
          <p className="error">Scriva la domanda prima di inviare.</p>
        )}
        {searchParams.consulto === 'lungo' && (
          <p className="error">La domanda è troppo lunga (massimo 4000 caratteri).</p>
        )}

        <form action={inviaConsulto} className="form">
          <input type="hidden" name="token" value={params.token} />
          <label>La sua domanda
            <textarea
              name="domanda" rows={3} required maxLength={4000}
              placeholder="Es. paziente in terapia con…, il tracciato allegato richiede una visita?"
            />
          </label>
          <label>Allegati (ECG, esami — facoltativi, max 3 file da 10 MB)
            <input type="file" name="allegati" multiple accept=".pdf,.png,.jpg,.jpeg" />
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Invia la domanda</button>
          </div>
        </form>

        {consulti.length > 0 && (
          <div className="consulti-list">
            {consulti.map((c) => (
              <div key={c.id} className="consulto-item">
                <div className="consulto-head">
                  <span className={`badge badge-${CONSULTO_STATO[c.stato]?.tone ?? 'warn'}`}>
                    {CONSULTO_STATO[c.stato]?.label ?? c.stato}
                  </span>
                  <span className="muted small">{dataOra(c.created_at)}</span>
                </div>
                <p className="consulto-domanda">{c.domanda}</p>
                {c.risposta && (
                  <p className="consulto-risposta">
                    <strong>Risposta{c.answered_at ? ` (${dataOra(c.answered_at)})` : ''}:</strong> {c.risposta}
                  </p>
                )}
                {c.stato === 'convertito' && (
                  <p className="muted small">
                    Da questa domanda è nata una richiesta di visita: la trova nella tabella qui sopra.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card notice reg-box">
        {account ? (
          <p className="muted">
            Ha già il suo accesso personale: <a href="/login">acceda qui</a> per vedere
            tutti i suoi invii, a tutti gli studi, in un'unica pagina.
          </p>
        ) : searchParams.reg === 'inviato' ? (
          <>
            <h2>Controlli la sua email</h2>
            <p className="muted">
              Le abbiamo inviato un codice di 6 cifre (vale 15 minuti). Lo inserisca qui
              con la password che vuole usare:
            </p>
            <form action={completaRegistrazione} className="reg-form">
              <input type="hidden" name="token" value={params.token} />
              <div className="grid2">
                <label>Codice ricevuto
                  <input name="code" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
                </label>
                <label>Scegli una password (min. 8 caratteri)
                  <input name="password" type="password" minLength={8} required autoComplete="new-password" />
                </label>
              </div>
              <button className="btn btn-primary" type="submit">Crea il mio accesso</button>
            </form>
            {searchParams && (
              <form action={richiediCodice} className="reg-form">
                <input type="hidden" name="token" value={params.token} />
                <button className="btn btn-ghost btn-small" type="submit">Invia un nuovo codice</button>
              </form>
            )}
          </>
        ) : (
          <>
            <h2>Crea il tuo accesso personale — gratis, in 1 minuto</h2>
            <p className="muted">
              Questa pagina mostra solo i pazienti inviati a {doc.studio_nome}.
              Con l'accesso personale invece:
            </p>
            <ul className="muted" style={{ margin: '4px 0 10px 20px', lineHeight: 1.7 }}>
              <li><strong>Tutti i suoi invii in una pagina</strong> — a qualunque studio, senza conservare link</li>
              <li><strong>Stato in tempo reale</strong> — presa in carico, appuntamento, referto: niente telefonate</li>
              <li><strong>Nell'annuario della piattaforma</strong> — gli studi la trovano e le affidano pazienti più facilmente</li>
            </ul>
            <p className="muted small">
              Basta un codice via email e una password: nessun modulo da compilare.
            </p>
            {searchParams.reg === 'codice' && (
              <p className="error">Codice non valido o scaduto: richiedine uno nuovo.</p>
            )}
            {searchParams.reg === 'password' && (
              <p className="error">La password deve avere almeno 8 caratteri.</p>
            )}
            {searchParams.reg === 'noemail' && (
              <p className="error">
                Non abbiamo un suo indirizzo email in anagrafica: lo comunichi alla
                segreteria dello studio, poi torni qui.
              </p>
            )}
            {searchParams.reg === 'errore' && (
              <p className="error">Invio del codice non riuscito: riprovi tra qualche minuto.</p>
            )}
            <form action={richiediCodice}>
              <input type="hidden" name="token" value={params.token} />
              <button className="btn btn-primary" type="submit">
                Inviami il codice via email{doc.email ? ` (${doc.email})` : ''}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="muted small center">
        Aggiorna la pagina per vedere lo stato più recente. <a href="/privacy">Informativa privacy</a>
      </p>
    </main>
  );
}
