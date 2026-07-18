'use server';

import { redirect } from 'next/navigation';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export type ResetState = { error?: string };

// Imposta la nuova password consumando il token (usa-e-getta). Il token viaggia
// nel form come campo nascosto; qui si ri-verifica sempre lato server.
export async function doReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get('token') ?? '');
  const pw = String(formData.get('password') ?? '');
  const pw2 = String(formData.get('password2') ?? '');

  if (pw.length < 8) return { error: 'La password deve avere almeno 8 caratteri.' };
  if (pw !== pw2) return { error: 'Le due password non coincidono.' };

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [reset] = await query<{ id: string; user_id: string }>(
    `select id, user_id from password_resets
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [tokenHash]
  );
  if (!reset) {
    return { error: 'Il link non è più valido o è scaduto. Richiedine uno nuovo.' };
  }

  const hash = await hashPassword(pw);
  await query('update users set password_hash = $1 where id = $2', [hash, reset.user_id]);
  // Consuma questo token e invalida eventuali altri link pendenti dello stesso utente.
  await query(
    'update password_resets set used_at = now() where user_id = $1 and used_at is null',
    [reset.user_id]
  );

  redirect('/login?reset=1');
}
