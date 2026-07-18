import Link from 'next/link';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { ResetForm } from './ResetForm';

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

// Verifica il token lato server: se valido mostra il form per la nuova password,
// altrimenti un avviso neutro con l'invito a richiederne uno nuovo.
export default async function ReimpostaPassword({
  params,
}: {
  params: { token: string };
}) {
  const tokenHash = crypto.createHash('sha256').update(params.token).digest('hex');
  const [reset] = await query<{ id: string }>(
    `select id from password_resets
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [tokenHash]
  );

  return (
    <main className="auth">
      <div className="card auth-card fp-card">
        <div className="fp-head">
          <Link className="fp-back" href="/login" aria-label="Torna all'accesso">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="fp-title">Nuova password</h1>
        </div>

        <LockBadge />

        {reset ? (
          <>
            <p className="muted center fp-lede">Scegli una nuova password per il tuo accesso.</p>
            <ResetForm token={params.token} />
          </>
        ) : (
          <>
            <p className="muted center fp-lede">
              Questo link non è valido o è scaduto (dura un&rsquo;ora e vale una volta sola).
              Richiedine uno nuovo.
            </p>
            <Link className="btn btn-primary fp-send" href="/password-dimenticata">
              Richiedi un nuovo link
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
