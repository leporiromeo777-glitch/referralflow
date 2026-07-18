'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { query } from '@/lib/db';
import {
  createSession, getPending2fa, destroyPending2fa,
} from '@/lib/auth';
import { verifyTotp, hashRecoveryCode } from '@/lib/totp';
import { isLoginLocked, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit';

type State = { error?: string };

function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'dev-locale';
}

// Secondo passaggio del login: codice dall'app di autenticazione, oppure un
// codice di recupero (monouso). Stessi blocchi anti-forza-bruta del login.
export async function verify2fa(_prev: State, formData: FormData): Promise<State> {
  const uid = await getPending2fa();
  if (!uid) redirect('/login');

  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { error: 'Inserisci il codice.' };

  const [user] = await query<{
    id: string; email: string; role: string; attivo: boolean;
    totp_secret: string | null; totp_enabled_at: string | null;
    studio_id: string | null; studio_nome: string | null; studio_attivo: boolean | null;
  }>(
    `select u.id, u.email, u.role, u.attivo, u.totp_secret, u.totp_enabled_at,
            u.studio_id, s.nome as studio_nome, s.attivo as studio_attivo
       from users u
       left join studios s on s.id = u.studio_id
      where u.id = $1`,
    [uid]
  );
  if (!user || !user.attivo || !user.totp_enabled_at || !user.totp_secret) redirect('/login');
  if (user.studio_id && user.studio_attivo === false) redirect('/login');

  const ip = clientIp();
  const key = `2fa:${user.email.toLowerCase()}`;
  const lockedUntil = isLoginLocked(key, ip);
  if (lockedUntil) {
    const minuti = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    return { error: `Troppi tentativi falliti. Riprova tra ${minuti} minuti.` };
  }

  let ok = verifyTotp(user.totp_secret, code);
  if (!ok) {
    // Codice di recupero: monouso — si «brucia» nello stesso istante in cui
    // viene accettato (update condizionato su used_at is null).
    const [rec] = await query<{ id: string }>(
      `update user_recovery_codes set used_at = now()
        where user_id = $1 and code_hash = $2 and used_at is null
        returning id`,
      [user.id, hashRecoveryCode(code)]
    );
    ok = !!rec;
  }
  if (!ok) {
    recordFailedLogin(key, ip);
    return { error: 'Codice non valido. Usa l’app di autenticazione o un codice di recupero.' };
  }

  clearLoginAttempts(key);
  destroyPending2fa();
  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    studioId: user.studio_id ?? '',
    studioNome: user.studio_nome ?? '',
  });
  redirect(user.role === 'medico' ? '/programma' : user.role === 'inviante' ? '/invii' : '/');
}
