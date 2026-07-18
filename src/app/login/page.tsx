import { LoginForm } from './LoginForm';
import { TrustStrip } from '../TrustStrip';

// Pagina server: il form è un client component, qui si aggiunge il riquadro
// assistenza (contatti da env, così restano lato server).
// force-dynamic: i contatti si leggono a ogni richiesta, non al build.
export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { reset?: string };
}) {
  const phone = process.env.SUPPORT_PHONE;
  const email = process.env.SUPPORT_EMAIL;
  return (
    <main className="auth">
      {searchParams.reset === '1' && (
        <p className="ok-line center">Password aggiornata: ora puoi accedere con la nuova password.</p>
      )}
      <LoginForm />
      {(phone || email) && (
        <p className="muted small center support-line">
          Assistenza 24/7:{' '}
          {phone && <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a>}
          {phone && email && ' · '}
          {email && <a href={`mailto:${email}`}>{email}</a>}
        </p>
      )}
      <p className="muted small center support-line">
        Sei un medico inviante senza accesso? <a href="/registrazione">Richiedilo qui</a>
      </p>
      <p className="muted small center support-line">
        Uno studio che vuole ReferralFlow? <a href="/attiva">Attiva il tuo studio</a>
        {' '}· <a href="/privacy">Informativa privacy</a>
      </p>
      <TrustStrip />
    </main>
  );
}
