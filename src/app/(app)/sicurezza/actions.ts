'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  generateTotpSecret, verifyTotp, generateRecoveryCodes, hashRecoveryCode,
} from '@/lib/totp';

// ─── Attivazione 2FA in due tempi ───
// 1) startSetup genera il segreto (2FA NON ancora attiva: totp_enabled_at nullo);
// 2) confirmSetup accetta il primo codice corretto → attiva e genera i codici
//    di recupero, mostrati una volta sola.

export async function startSetup() {
  const session = await getSession();
  if (!session) redirect('/login');

  await query(
    `update users set totp_secret = $2 where id = $1 and totp_enabled_at is null`,
    [session.id, generateTotpSecret()]
  );
  revalidatePath('/sicurezza');
}

export async function cancelSetup() {
  const session = await getSession();
  if (!session) redirect('/login');

  await query(
    `update users set totp_secret = null where id = $1 and totp_enabled_at is null`,
    [session.id]
  );
  revalidatePath('/sicurezza');
}

export type ConfirmState = { error?: string; recoveryCodes?: string[] };

export async function confirmSetup(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const session = await getSession();
  if (!session) redirect('/login');

  const code = String(formData.get('code') ?? '').trim();
  const [u] = await query<{ totp_secret: string | null; totp_enabled_at: string | null }>(
    'select totp_secret, totp_enabled_at from users where id = $1',
    [session.id]
  );
  if (!u?.totp_secret || u.totp_enabled_at) return { error: 'Configurazione non in corso.' };
  if (!verifyTotp(u.totp_secret, code)) {
    return { error: 'Codice non valido: controlla l’app e riprova (il codice cambia ogni 30 secondi).' };
  }

  // Il codice è giusto: si generano i codici di recupero, ma la 2FA diventa
  // attiva solo con finishSetup (quando l'utente conferma di averli salvati).
  // Così il refresh della pagina non può far sparire i codici prima che
  // vengano letti: il ramo «configurazione in corso» resta montato.
  const codes = generateRecoveryCodes();
  await query('delete from user_recovery_codes where user_id = $1', [session.id]);
  for (const c of codes) {
    await query(
      'insert into user_recovery_codes (user_id, code_hash) values ($1, $2)',
      [session.id, hashRecoveryCode(c)]
    );
  }
  return { recoveryCodes: codes };
}

// Ultimo passo: l'utente ha salvato i codici di recupero → la 2FA si accende.
export async function finishSetup() {
  const session = await getSession();
  if (!session) redirect('/login');

  await query(
    `update users set totp_enabled_at = now()
      where id = $1 and totp_secret is not null and totp_enabled_at is null
        and exists (select 1 from user_recovery_codes where user_id = $1)`,
    [session.id]
  );
  revalidatePath('/sicurezza');
}

export type DisableState = { error?: string };

// Disattivazione: serve un codice valido (dall'app o di recupero) — così un
// PC lasciato sbloccato non basta per spegnere la protezione.
export async function disable2fa(_prev: DisableState, formData: FormData): Promise<DisableState> {
  const session = await getSession();
  if (!session) redirect('/login');

  const code = String(formData.get('code') ?? '').trim();
  const [u] = await query<{ totp_secret: string | null; totp_enabled_at: string | null }>(
    'select totp_secret, totp_enabled_at from users where id = $1',
    [session.id]
  );
  if (!u?.totp_enabled_at || !u.totp_secret) return { error: '2FA non attiva.' };

  let ok = verifyTotp(u.totp_secret, code);
  if (!ok) {
    const [rec] = await query<{ id: string }>(
      `update user_recovery_codes set used_at = now()
        where user_id = $1 and code_hash = $2 and used_at is null
        returning id`,
      [session.id, hashRecoveryCode(code)]
    );
    ok = !!rec;
  }
  if (!ok) return { error: 'Codice non valido.' };

  await query(
    'update users set totp_secret = null, totp_enabled_at = null where id = $1',
    [session.id]
  );
  await query('delete from user_recovery_codes where user_id = $1', [session.id]);
  revalidatePath('/sicurezza');
  return {};
}
