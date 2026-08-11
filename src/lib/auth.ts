import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { hash, verify } from '@node-rs/argon2';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE = 'rf_session';

// La sessione porta con sé lo studio: ogni query dell'area interna è
// recintata su studioId (piattaforma multi-studio).
// Eccezione: il ruolo 'inviante' (medico esterno registrato) non appartiene a
// nessuno studio — studioId/studioNome restano stringhe vuote e il middleware
// lo recinta nella sua area /invii.
export type SessionUser = {
  id: string;
  email: string;
  role: string;
  studioId: string;
  studioNome: string;
};

export function hashPassword(pw: string) {
  return hash(pw);
}
export function verifyPassword(storedHash: string, pw: string) {
  return verify(storedHash, pw);
}

// I cookie sono «secure» (solo-HTTPS) in produzione — MA non quando l'app è
// servita su http:// (es. l'anteprima locale sul Mac dello studio): lì un
// cookie secure verrebbe scartato dal browser e la sessione non reggerebbe la
// navigazione. Ci si regola sull'APP_BASE_URL.
export function cookieSecure(): boolean {
  if ((process.env.APP_BASE_URL ?? '').startsWith('http://')) return false;
  return process.env.NODE_ENV === 'production';
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export function destroySession() {
  cookies().delete(COOKIE);
}

// ─── 2FA: sessione «in attesa di verifica» ───
// Dopo la password corretta, chi ha la 2FA attiva NON riceve la sessione vera:
// riceve questo cookie breve (5 minuti) che dà accesso solo a /login/verifica.
const PENDING_COOKIE = 'rf_2fa';

export async function createPending2fa(userId: string) {
  const token = await new SignJWT({ uid: userId, stage: '2fa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  cookies().set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  });
}

export async function getPending2fa(): Promise<string | null> {
  const token = cookies().get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.stage !== '2fa' || typeof payload.uid !== 'string') return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export function destroyPending2fa() {
  cookies().delete(PENDING_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    // Token emesso prima del multi-studio: senza studio non è più valido
    // (fa eccezione l'inviante, che uno studio non ce l'ha).
    if (!payload.studioId && payload.role !== 'inviante') return null;
    return {
      id: payload.id as string,
      email: payload.email as string,
      role: payload.role as string,
      studioId: (payload.studioId as string) ?? '',
      studioNome: (payload.studioNome as string) ?? '',
    };
  } catch {
    return null;
  }
}
