import { query } from '@/lib/db';
import { TrustStrip } from '../TrustStrip';
import { iniziaAttivazione, completaAttivazione, richiediAttivazione } from './actions';

export const dynamic = 'force-dynamic';

// Pagina pubblica «Attiva il tuo studio»: attivazione self-service in 2 passi
// (dati → codice via email → dentro). Chi arriva dal link di un affido trova
// i campi già compilati e, al termine, il paziente già nella sua coda.
// In alternativa resta il modulo «fatti ricontattare» (onboarding manuale).

const COSA = [
  ['La tua coda', 'Ogni richiesta arriva ordinata, con allegati e urgenza; avanza con un clic dal ricevimento al referto.'],
  ['Promemoria SMS', 'Il paziente riceve il promemoria e conferma con un tocco. Meno buchi in agenda, meno telefonate.'],
  ['Follow-up automatico', 'Il controllo a 6 o 12 mesi ricompare da solo quando è ora: nessun paziente si perde.'],
  ['Lista d’attesa', 'Una disdetta diventa uno slot con accanto chi richiamare, ordinato per urgenza.'],
  ['Programma del giorno', 'Ogni medico vede i suoi pazienti, con la scheda pronta prima della visita.'],
  ['Referral tra studi', 'Affida pazienti ad altri studi e segui lo stato in tempo reale, senza email che spariscono.'],
];

export default async function Attiva({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; err?: string; step?: string; a?: string; da?: string };
}) {
  const phone = process.env.SUPPORT_PHONE;
  const email = process.env.SUPPORT_EMAIL;

  // Passo 2: inserimento del codice ricevuto via email.
  if (searchParams.step === 'codice' && searchParams.a) {
    const [att] = await query<{ id: string; nome: string; email: string }>(
      `select id, nome, email from studio_activations
        where id = $1 and used_at is null and expires_at > now()`,
      [searchParams.a]
    ).catch(() => [] as any[]);

    return (
      <main className="public attiva">
        <div className="brand brand-lg center">Referral<span>Flow</span></div>
        {att ? (
          <div className="card form">
            <h2>Controlli la sua email</h2>
            <p className="muted">
              Abbiamo inviato un codice di 6 cifre a <strong>{att.email}</strong> (vale
              15 minuti). Lo inserisca qui con la password che userà per accedere:
              un attimo dopo, lo studio <strong>{att.nome}</strong> è attivo.
            </p>
            {searchParams.err === 'codice' && (
              <p className="error">Codice non valido o scaduto: controlli l'email o ricominci.</p>
            )}
            {searchParams.err === 'password' && (
              <p className="error">La password deve avere almeno 8 caratteri.</p>
            )}
            {searchParams.err === 'termini' && (
              <p className="error">Per attivare lo studio deve accettare le condizioni.</p>
            )}
            <form action={completaAttivazione} className="reg-form">
              <input type="hidden" name="a" value={att.id} />
              <div className="grid2">
                <label>Codice ricevuto
                  <input name="code" inputMode="numeric" maxLength={6} required
                    autoComplete="one-time-code" autoFocus />
                </label>
                <label>Scegli una password (min. 8 caratteri)
                  <input name="password" type="password" minLength={8} required
                    autoComplete="new-password" />
                </label>
              </div>
              <label className="accept-line">
                <input type="checkbox" name="accetto" value="1" required />
                <span>
                  Dichiaro di accettare le{' '}
                  <a href="/termini" target="_blank" rel="noreferrer">condizioni di servizio</a> e il{' '}
                  <a href="/trattamento-dati" target="_blank" rel="noreferrer">contratto di trattamento dati</a>.
                </span>
              </label>
              <button className="btn btn-primary" type="submit">Attiva lo studio →</button>
            </form>
          </div>
        ) : (
          <div className="card notice">
            <h2>Richiesta scaduta</h2>
            <p className="muted">
              Per motivi di sicurezza il codice vale 15 minuti.{' '}
              <a href="/attiva">Ricominci da qui</a>: bastano due campi.
            </p>
          </div>
        )}
        <p className="muted small center"><a href="/privacy">Informativa privacy</a></p>
      </main>
    );
  }

  // Prefill se si arriva dal link di un affido esterno: i dati dello studio
  // destinatario sono già in rubrica presso il mittente.
  let prefill: { nome: string; email: string; specialita: string | null; telefono: string | null } | null = null;
  if (searchParams.da) {
    const [row] = await query<{ nome: string; email: string; specialita: string | null; telefono: string | null }>(
      `select es.nome, es.email, es.specialita, es.telefono
         from external_referrals er
         join external_studios es on es.id = er.external_studio_id
        where er.token = $1`,
      [searchParams.da]
    ).catch(() => [] as any[]);
    prefill = row ?? null;
  }

  return (
    <main className="public wide attiva">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">La piattaforma svizzera per le referral tra studi medici</p>

      {searchParams.ok ? (
        <div className="card notice">
          <h2>Richiesta ricevuta ✓</h2>
          <p className="muted">
            Grazie. La ricontattiamo a breve per una dimostrazione e per attivare
            il suo studio. Nel frattempo, per qualsiasi cosa:
            {phone && <> <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a></>}
            {phone && email && ' ·'}
            {email && <> <a href={`mailto:${email}`}>{email}</a></>}.
          </p>
        </div>
      ) : (
        <>
          <TrustStrip />

          <section className="card attiva-hero">
            <h1>Attiva il tuo studio — prova gratuita, in 2 minuti</h1>
            <p>
              Nome dello studio, email, un codice di verifica: la vostra pagina è
              pronta e siete dentro. Dati su server in Svizzera, conforme nLPD.
              Sta sopra gli strumenti che già usate — agenda e fatturazione
              restano dove sono.
            </p>
            <p className="muted small">
              L'attivazione è riservata al <strong>medico titolare</strong> dello
              studio: il suo sarà l'accesso da amministratore, con cui creare poi
              gli accessi per segreteria e colleghi.
            </p>
            <p className="muted small">
              🔒 <strong>Conformità nLPD inclusa:</strong> con l'attivazione ricevete
              anche i contratti pronti per il vostro studio (trattamento dati su
              incarico e riservatezza), sul modello ufficiale FMH.
            </p>
          </section>

          <form action={iniziaAttivazione} className="card form">
            {/* honeypot */}
            <input type="text" name="sito_web" tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-5000px', width: 1, height: 1 }} />
            <h2>Attiva subito</h2>
            {prefill && (
              <p className="muted">
                Vi è stato affidato un paziente tramite ReferralFlow: abbiamo già
                compilato i campi. Al termine dell'attivazione lo troverete
                <strong> già nella vostra coda</strong>.
              </p>
            )}
            {searchParams.err === 'dati' && (
              <p className="error">Servono il nome dello studio, il medico titolare e un'email valida.</p>
            )}
            {searchParams.err === 'esiste' && (
              <p className="error">
                Questa email ha già un accesso: <a href="/login">acceda qui</a>. Se
                non ricorda la password, contatti l'assistenza.
              </p>
            )}
            {searchParams.err === 'email' && (
              <p className="error">Invio del codice non riuscito: riprovi tra qualche minuto.</p>
            )}
            <div className="grid2">
              <label>Nome dello studio *
                <input name="studio" required maxLength={120}
                  defaultValue={prefill?.nome ?? ''} placeholder="Es. Studio Ortopedico Bellinzona" />
              </label>
              <label>Medico titolare *
                <input name="titolare" required maxLength={120}
                  placeholder="Es. Dr. med. Luca Bernasconi" />
              </label>
              <label>La sua email (diventerà l'accesso da amministratore) *
                <input name="email" type="email" required maxLength={160}
                  defaultValue={prefill?.email ?? ''} placeholder="l.bernasconi@hin.ch" />
              </label>
              <label>Telefono dello studio
                <input name="telefono" type="tel" maxLength={40}
                  defaultValue={prefill?.telefono ?? ''} />
              </label>
              <label>Specialità
                <input name="specialita" maxLength={200}
                  defaultValue={prefill?.specialita ?? ''} placeholder="Es. Ortopedia: ginocchio, spalla" />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">Ricevi il codice e attiva →</button>
            </div>
            <p className="muted small">
              Prova gratuita di 60 giorni, senza carta di credito e senza rinnovo
              automatico. Riceverà un codice di 6 cifre per confermare l'email:
              nessun altro passaggio.
            </p>
          </form>

          <section className="attiva-grid">
            {COSA.map(([titolo, testo]) => (
              <div className="card attiva-cell" key={titolo}>
                <h3>{titolo}</h3>
                <p className="muted">{testo}</p>
              </div>
            ))}
          </section>

          <details className="complete ext-add">
            <summary className="btn btn-small">Preferisce essere ricontattato? Lasci i suoi dati</summary>
            <form action={richiediAttivazione} className="card form">
              {/* honeypot */}
              <input type="text" name="sito_web" tabIndex={-1} autoComplete="off" aria-hidden="true"
                style={{ position: 'absolute', left: '-5000px', width: 1, height: 1 }} />
              {searchParams.error && (
                <p className="error">Inserisca almeno il nome dello studio e un'email valida.</p>
              )}
              <div className="grid2">
                <label>Nome dello studio *<input name="studio" required maxLength={120} /></label>
                <label>Specialità<input name="specialita" maxLength={200}
                  placeholder="Es. Cardiologia" /></label>
                <label>Referente<input name="referente" maxLength={120} /></label>
                <label>Email *<input name="email" type="email" required maxLength={160} /></label>
                <label>Telefono<input name="telefono" type="tel" maxLength={40} /></label>
              </div>
              <label>Messaggio (facoltativo)
                <textarea name="messaggio" rows={3} maxLength={1000}
                  placeholder="Qualcosa che vuole dirci, o quando preferisce essere ricontattato…" />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Invia la richiesta</button>
              </div>
            </form>
          </details>

          <section className="card attiva-how">
            <p className="muted">
              L'attivazione guidata è sempre inclusa: vi mostriamo la piattaforma con
              i vostri casi reali e vi aiutiamo con i primi accessi. Assistenza 24/7:
              {phone && <> <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a></>}
              {phone && email && ' ·'}
              {email && <> <a href={`mailto:${email}`}>{email}</a></>}.
            </p>
          </section>
        </>
      )}

      <p className="muted small center">
        <a href="/privacy">Informativa privacy</a>
      </p>
    </main>
  );
}
