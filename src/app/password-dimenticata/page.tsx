import Link from 'next/link';
import { ForgotForm } from './ForgotForm';

export const dynamic = 'force-dynamic';

function LockBadge() {
  return (
    <div className="fp-lock" aria-hidden="true">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        <circle cx="12" cy="16" r="1" />
      </svg>
    </div>
  );
}

// Pagina pubblica «Password dimenticata». Dopo l'invio (?inviata=1) mostra la
// conferma neutra: non si rivela mai se l'email è registrata.
export default function PasswordDimenticata({
  searchParams,
}: {
  searchParams: { inviata?: string };
}) {
  const inviata = searchParams.inviata === '1';

  return (
    <main className="auth">
      <div className="card auth-card fp-card">
        <div className="fp-head">
          <Link className="fp-back" href="/login" aria-label="Torna all'accesso">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="fp-title">Password dimenticata</h1>
        </div>

        <LockBadge />

        {inviata ? (
          <>
            <p className="muted center fp-lede">
              Se l&rsquo;indirizzo è registrato, ti abbiamo inviato un&rsquo;email con il link per
              reimpostare la password. Controlla anche lo spam. Il link scade tra un&rsquo;ora.
            </p>
            <Link className="btn btn-primary fp-send" href="/login">
              Torna all&rsquo;accesso
            </Link>
          </>
        ) : (
          <ForgotForm />
        )}
      </div>
    </main>
  );
}
