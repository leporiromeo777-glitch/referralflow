'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { query } from '@/lib/db';
import { verifyPassword, createSession, createPending2fa } from '@/lib/auth';
import { isLoginLocked, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit';

type State = { error?: string };

// L'app gira dietro Caddy: l'IP reale del client è in X-Forwarded-For
// (Caddy lo imposta di default). In locale/dev l'header manca: si raggruppa
// tutto sotto una chiave fissa, che va bene per lo sviluppo.
function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'dev-locale';
}

export async function login(_prev: State, formData: FormData): Promise<State> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Inserisci email e password.' };

  const ip = clientIp();
  const lockedUntil = isLoginLocked(email, ip);
  if (lockedUntil) {
    const minuti = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    return { error: `Troppi tentativi falliti. Riprova tra ${minuti} minuti.` };
  }

  const rows = await query<{
    id: string; email: string; password_hash: string; role: string;
    attivo: boolean; studio_id: string | null; studio_nome: string | null;
    studio_attivo: boolean | null; totp_enabled_at: string | null;
  }>(
    `select u.id, u.email, u.password_hash, u.role, u.attivo, u.totp_enabled_at,
            u.studio_id, s.nome as studio_nome, s.attivo as studio_attivo
       from users u
       left join studios s on s.id = u.studio_id
      where u.email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user || !user.attivo || !(await verifyPassword(user.password_hash, password))) {
    recordFailedLogin(email, ip);
    return { error: 'Credenziali non valide.' };
  }
  // Studio spento dal titolare della piattaforma: nessun accesso.
  if (user.studio_id && user.studio_attivo === false) {
    return { error: 'Lo studio non è attivo: contatti l’assistenza.' };
  }
  // 2FA attiva: password ok non basta — si passa dal secondo fattore.
  // La sessione vera nasce solo in /login/verifica, a codice confermato.
  if (user.totp_enabled_at) {
    await createPending2fa(user.id);
    redirect('/login/verifica');
  }

  clearLoginAttempts(email);
  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    studioId: user.studio_id ?? '',
    studioNome: user.studio_nome ?? '',
  });
  redirect(user.role === 'medico' ? '/programma' : user.role === 'inviante' ? '/invii' : '/');
}
