import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSession, hashPassword, verifyPassword } from '@/lib/auth';
import { query } from '@/lib/db';
import { generateTotpSecret, verifyTotp, generateRecoveryCodes, hashRecoveryCode, totpUri } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Profilo dall'interfaccia nuova (14.9.2026): cambio della propria password
// (serve quella attuale) e 2FA in due tempi come nella piattaforma: si
// genera il segreto (non ancora attiva), si conferma col primo codice
// giusto (nascono i codici di recupero, mostrati una volta sola), si accende
// quando la persona dichiara di averli salvati; si spegne solo con un codice
// valido. Mai password, segreti o codici nei log.
async function stato(userId: string) {
  const [u] = await query<{ email: string; role: string; totp_secret: string | null; totp_enabled_at: string | null; created_at: string }>(
    `select email, role::text, totp_secret, totp_enabled_at, created_at::text from users where id = $1`, [userId]);
  const setupInCorso = !!u.totp_secret && !u.totp_enabled_at;
  const uri = setupInCorso ? totpUri(u.totp_secret as string, u.email) : null;
  const qr = uri ? await QRCode.toDataURL(uri, { width: 220, margin: 1 }) : null;
  const [rec] = await query<{ n: number }>(`select count(*)::int as n from user_recovery_codes where user_id = $1 and used_at is null`, [userId]);
  return { email: u.email, ruolo: u.role, totp_attiva: !!u.totp_enabled_at, totp_dal: u.totp_enabled_at, setup_in_corso: setupInCorso, segreto: setupInCorso ? u.totp_secret : null, qr, codici_recupero_rimasti: rec?.n ?? 0, dal: u.created_at };
}

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  return NextResponse.json(await stato(session.id), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const uid = session.id;
  let extra: Record<string, unknown> = {};
  if (azione === 'password') {
    const attuale = String(c.attuale ?? ''); const nuova = String(c.nuova ?? '');
    if (nuova.length < 8) return NextResponse.json({ errore: 'La nuova password deve avere almeno 8 caratteri.' }, { status: 400 });
    const [u] = await query<{ password_hash: string }>('select password_hash from users where id = $1', [uid]);
    if (!u || !(await verifyPassword(u.password_hash, attuale))) return NextResponse.json({ errore: 'La password attuale non è corretta.' }, { status: 401 });
    await query('update users set password_hash = $1 where id = $2', [await hashPassword(nuova), uid]);
    extra = { messaggio: 'Password cambiata.' };
  } else if (azione === '2fa_avvia') {
    await query(`update users set totp_secret = $2 where id = $1 and totp_enabled_at is null`, [uid, generateTotpSecret()]);
  } else if (azione === '2fa_annulla') {
    await query(`update users set totp_secret = null where id = $1 and totp_enabled_at is null`, [uid]);
  } else if (azione === '2fa_conferma') {
    const code = String(c.codice ?? '').trim();
    const [u] = await query<{ totp_secret: string | null; totp_enabled_at: string | null }>('select totp_secret, totp_enabled_at from users where id = $1', [uid]);
    if (!u?.totp_secret || u.totp_enabled_at) return NextResponse.json({ errore: 'Configurazione non in corso.' }, { status: 409 });
    if (!verifyTotp(u.totp_secret, code)) return NextResponse.json({ errore: 'Codice non valido: controlla l’app e riprova (il codice cambia ogni 30 secondi).' }, { status: 401 });
    const codes = generateRecoveryCodes();
    await query('delete from user_recovery_codes where user_id = $1', [uid]);
    for (const k of codes) await query('insert into user_recovery_codes (user_id, code_hash) values ($1, $2)', [uid, hashRecoveryCode(k)]);
    extra = { codici_recupero: codes };
  } else if (azione === '2fa_fine') {
    await query(`update users set totp_enabled_at = now() where id = $1 and totp_secret is not null and totp_enabled_at is null and exists (select 1 from user_recovery_codes where user_id = $1)`, [uid]);
  } else if (azione === '2fa_disattiva') {
    const code = String(c.codice ?? '').trim();
    const [u] = await query<{ totp_secret: string | null; totp_enabled_at: string | null }>('select totp_secret, totp_enabled_at from users where id = $1', [uid]);
    if (!u?.totp_enabled_at || !u.totp_secret) return NextResponse.json({ errore: '2FA non attiva.' }, { status: 409 });
    let ok = verifyTotp(u.totp_secret, code);
    if (!ok) {
      const [rec] = await query<{ id: string }>(`update user_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id`, [uid, hashRecoveryCode(code)]);
      ok = !!rec;
    }
    if (!ok) return NextResponse.json({ errore: 'Codice non valido.' }, { status: 401 });
    await query('update users set totp_secret = null, totp_enabled_at = null where id = $1', [uid]);
    await query('delete from user_recovery_codes where user_id = $1', [uid]);
  } else {
    return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
  }
  console.log(`[profilo] azione=${azione} utente=${uid.slice(0, 8)}`);
  return NextResponse.json({ ok: true, ...extra, ...(await stato(uid)) }, { headers: { 'Cache-Control': 'no-store' } });
}
