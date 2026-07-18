'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { sendPlain } from '@/lib/notify';
import { isResetLocked, recordResetRequest } from '@/lib/rate-limit';

// IP reale dietro Caddy (X-Forwarded-For); in dev l'header manca.
function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'dev-locale';
}

// Richiesta di reset. Risposta SEMPRE neutra (non si rivela se l'email esiste):
// qualunque cosa succeda si finisce sulla schermata «controlla la tua email».
export async function requestReset(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (email) {
    const ip = clientIp();
    // Se già troppe richieste, non mandiamo altra posta ma restiamo neutri.
    if (!isResetLocked(email, ip)) {
      recordResetRequest(email, ip);
      const [user] = await query<{ id: string }>(
        'select id from users where email = $1 and attivo = true',
        [email]
      );
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        // Un solo link valido per volta: invalida i precedenti non usati.
        await query(
          'update password_resets set used_at = now() where user_id = $1 and used_at is null',
          [user.id]
        );
        await query(
          'insert into password_resets (user_id, token_hash) values ($1, $2)',
          [user.id, tokenHash]
        );
        const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
        const link = `${base}/reimposta-password/${token}`;
        const testo = [
          'Hai chiesto di reimpostare la password del tuo accesso a ReferralFlow.',
          '',
          'Apri questo link per scegliere una nuova password',
          '(scade tra un’ora e vale una volta sola):',
          link,
          '',
          'Se non sei stato tu, ignora questa email: la password resta invariata.',
          'Questo messaggio non contiene dati clinici.',
        ].join('\n');
        await sendPlain(email, 'Reimposta la tua password ReferralFlow', testo);
      }
    }
  }

  redirect('/password-dimenticata?inviata=1');
}
