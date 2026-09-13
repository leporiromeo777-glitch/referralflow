import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createSession, getPending2fa, destroyPending2fa } from '@/lib/auth';
import { verifyTotp, hashRecoveryCode } from '@/lib/totp';
import { isLoginLocked, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Secondo passaggio dell'accesso dall'interfaccia nuova: codice dell'app di
// autenticazione o codice di recupero monouso. Stessa logica di /login/verifica.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'dev-locale';
}

export async function POST(req: NextRequest) {
  const uid = await getPending2fa();
  if (!uid) return NextResponse.json({ errore: 'Sessione di verifica scaduta: ricomincia dall’accesso.', ricomincia: true }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const code = String(corpo?.codice ?? '').trim();
  if (!code) return NextResponse.json({ errore: 'Inserisci il codice.' }, { status: 400 });
  const [user] = await query<{ id: string; email: string; role: string; attivo: boolean; totp_secret: string | null; totp_enabled_at: string | null; studio_id: string | null; studio_nome: string | null; studio_attivo: boolean | null }>(
    `select u.id, u.email, u.role, u.attivo, u.totp_secret, u.totp_enabled_at, u.studio_id, s.nome as studio_nome, s.attivo as studio_attivo
       from users u left join studios s on s.id = u.studio_id where u.id = $1`,
    [uid]
  );
  if (!user || !user.attivo || !user.totp_enabled_at || !user.totp_secret || (user.studio_id && user.studio_attivo === false)) {
    return NextResponse.json({ errore: 'Accesso non possibile: ricomincia.', ricomincia: true }, { status: 401 });
  }
  const ip = clientIp(req);
  const key = `2fa:${user.email.toLowerCase()}`;
  const lockedUntil = isLoginLocked(key, ip);
  if (lockedUntil) {
    const minuti = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    return NextResponse.json({ errore: `Troppi tentativi falliti. Riprova tra ${minuti} minuti.` }, { status: 429 });
  }
  let ok = verifyTotp(user.totp_secret, code);
  if (!ok) {
    const [rec] = await query<{ id: string }>(
      `update user_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id`,
      [user.id, hashRecoveryCode(code)]
    );
    ok = !!rec;
  }
  if (!ok) {
    recordFailedLogin(key, ip);
    return NextResponse.json({ errore: 'Codice non valido. Usa l’app di autenticazione o un codice di recupero.' }, { status: 401 });
  }
  clearLoginAttempts(key);
  destroyPending2fa();
  await createSession({ id: user.id, email: user.email, role: user.role, studioId: user.studio_id ?? '', studioNome: user.studio_nome ?? '' });
  return NextResponse.json({ ok: true });
}
