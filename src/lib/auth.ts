import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { hash, verify } from '@node-rs/argon2';
import { query } from './db';

const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE = 'rf_session';

// La sessione porta con sé lo studio: ogni query dell'area interna è
// recintata su studioId (piattaforma multi-studio).
// Eccezione: il ruolo 'inviante' (medico esterno registrato) non appartiene a
// nessuno studio — studioId/studioNome restano stringhe vuote e il proxy (src/proxy.ts)
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
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
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
  (await cookies()).set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  });
}

export async function getPending2fa(): Promise<string | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.stage !== '2fa' || typeof payload.uid !== 'string') return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export async function destroyPending2fa() {
  (await cookies()).delete(PENDING_COOKIE);
}

// La firma del gettone non basta (13.10.2026, controllo di sicurezza): chi è stato disattivato, o ha cambiato ruolo,
// restava dentro fino a otto ore, e un gettone firmato con lo stesso segreto per un utente che in QUESTO database non
// esiste (le prove sul database demo lo fanno) veniva accettato. Ora a ogni richiesta l'utente si riscontra sul
// database: deve esistere, essere attivo e stare nello studio scritto nel gettone; ruolo ed e-mail valgono quelli del
// database. Per non fare una domanda al database a ogni chiamata, la risposta vale quindici secondi.
type Riscontro = { email: string; role: string; attivo: boolean; studio_id: string | null };
const riscontri = new Map<string, { quando: number; riga: Riscontro | null }>();
const RISCONTRO_MS = 15_000;
async function riscontra(id: string): Promise<Riscontro | null> {
  const c = riscontri.get(id);
  if (c && Date.now() - c.quando < RISCONTRO_MS) return c.riga;
  const [riga] = await query<Riscontro>('select email, role::text as role, attivo, studio_id from users where id = $1', [id]);
  riscontri.set(id, { quando: Date.now(), riga: riga ?? null });
  if (riscontri.size > 500) riscontri.delete(riscontri.keys().next().value as string);
  return riga ?? null;
}
// Chi cambia un utente (ruolo, attivo, password) lo dice qui: il riscontro si rifà subito.
export function dimenticaRiscontro(id?: string) { if (id) riscontri.delete(id); else riscontri.clear(); }

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    // Token emesso prima del multi-studio: senza studio non è più valido
    // (fa eccezione l'inviante, che uno studio non ce l'ha).
    if (!payload.studioId && payload.role !== 'inviante') return null;
    const id = typeof payload.id === 'string' ? payload.id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const utente = await riscontra(id);
    if (!utente || !utente.attivo || (utente.studio_id ?? '') !== ((payload.studioId as string) ?? '')) return null;
    return {
      id,
      email: utente.email,
      role: utente.role,
      studioId: (payload.studioId as string) ?? '',
      studioNome: (payload.studioNome as string) ?? '',
    };
  } catch {
    return null;
  }
}
