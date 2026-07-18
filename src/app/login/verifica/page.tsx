import { redirect } from 'next/navigation';
import { getPending2fa } from '@/lib/auth';
import { VerifyForm } from './VerifyForm';

export const dynamic = 'force-dynamic';

// Secondo passaggio del login (solo per chi ha la 2FA attiva). Senza il
// cookie «in attesa di verifica» (scade in 5 minuti) si torna al login.
export default async function Verifica() {
  const uid = await getPending2fa();
  if (!uid) redirect('/login');
  return (
    <main className="auth">
      <VerifyForm />
      <p className="muted small center support-line">
        Il codice cambia ogni 30 secondi: se non funziona, attenda il successivo.
      </p>
    </main>
  );
}
