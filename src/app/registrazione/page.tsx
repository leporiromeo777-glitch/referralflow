import { richiediAccesso } from './actions';

export const dynamic = 'force-dynamic';

// Richiesta d'accesso per medici invianti che non hanno ancora un link portale
// (nessuno studio li ha ancora invitati). La richiesta arriva alla piattaforma,
// che verifica l'identità professionale prima di attivare l'accesso.

export default function Registrazione({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  return (
    <main className="public">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">Accesso per medici invianti</p>

      {searchParams.ok ? (
        <div className="card notice">
          <h2>Richiesta inviata ✓</h2>
          <p className="muted">
            Grazie. Verifichiamo i dati professionali e la ricontattiamo a breve
            con le istruzioni per l'accesso.
          </p>
        </div>
      ) : (
        <form action={richiediAccesso} className="card form">
          {/* honeypot anti-spam */}
          <input type="text" name="sito_web" tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: 'absolute', left: '-5000px', width: 1, height: 1 }} />
          <p className="muted">
            Se uno studio le ha già condiviso il suo <strong>link del portale</strong>,
            può creare l'accesso direttamente da lì, in un minuto. Altrimenti compili
            questo modulo: verifichiamo e la ricontattiamo.
          </p>
          {searchParams.error && (
            <p className="error">Inserisca nome e un indirizzo email valido.</p>
          )}
          <div className="grid2">
            <label>Nome e cognome *<input name="nome" required maxLength={120} /></label>
            <label>Studio / pratica<input name="studio" maxLength={120} /></label>
            <label>Email *<input name="email" type="email" required maxLength={160} /></label>
            <label>Telefono<input name="telefono" type="tel" maxLength={40} /></label>
          </div>
          <label>Messaggio (facoltativo)
            <textarea name="messaggio" rows={3} maxLength={1000}
              placeholder="Es. collaboro già con lo studio X…" />
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Richiedi l'accesso</button>
          </div>
        </form>
      )}
      <p className="muted small center">
        <a href="/privacy">Informativa privacy</a>
      </p>
    </main>
  );
}
