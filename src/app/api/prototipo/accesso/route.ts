import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, createSession, createPending2fa } from '@/lib/auth';
import { isLoginLocked, recordFailedLogin, clearLoginAttempts } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accesso dall'interfaccia nuova (14.9.2026): stessa logica della pagina di
// login della piattaforma (blocchi anti-forza-bruta, studio attivo, 2FA),
// ma in JSON: la schermata è quella del prototipo. Con la 2FA attiva la
// sessione vera nasce solo in /api/prototipo/accesso/verifica. Mai la
// password nei log.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'dev-locale';
}

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null);
  const email = String(corpo?.email ?? '').trim().toLowerCase().slice(0, 160);
  const password = String(corpo?.password ?? '');
  if (!email || !password) return NextResponse.json({ errore: 'Inserisci email e password.' }, { status: 400 });
  const ip = clientIp(req);
  const lockedUntil = isLoginLocked(email, ip);
  if (lockedUntil) {
    const minuti = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
    return NextResponse.json({ errore: `Troppi tentativi falliti. Riprova tra ${minuti} minuti.` }, { status: 429 });
  }
  const [user] = await query<{ id: string; email: string; password_hash: string; role: string; attivo: boolean; studio_id: string | null; studio_nome: string | null; studio_attivo: boolean | null; totp_enabled_at: string | null }>(
    `select u.id, u.email, u.password_hash, u.role, u.attivo, u.totp_enabled_at, u.studio_id, s.nome as studio_nome, s.attivo as studio_attivo
       from users u left join studios s on s.id = u.studio_id where u.email = $1`,
    [email]
  );
  if (!user || !user.attivo || !(await verifyPassword(user.password_hash, password))) {
    recordFailedLogin(email, ip);
    return NextResponse.json({ errore: 'Credenziali non valide.' }, { status: 401 });
  }
  if (user.studio_id && user.studio_attivo === false) return NextResponse.json({ errore: 'Lo studio non è attivo: contatti l’assistenza.' }, { status: 403 });
  if (user.role === 'inviante') return NextResponse.json({ errore: 'Questa interfaccia è per il personale dello studio.' }, { status: 403 });
  if (user.totp_enabled_at) {
    await createPending2fa(user.id);
    return NextResponse.json({ ok: true, richiede_codice: true });
  }
  clearLoginAttempts(email);
  await createSession({ id: user.id, email: user.email, role: user.role, studioId: user.studio_id ?? '', studioNome: user.studio_nome ?? '' });
  return NextResponse.json({ ok: true, richiede_codice: false });
}
