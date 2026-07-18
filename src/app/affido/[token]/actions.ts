'use server';

import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { notifyRispostaAffido } from '@/lib/notify';

// Risposta dello studio esterno dal link sicuro: prende in carico (con data
// facoltativa) oppure rifiuta. Una sola risposta; il mittente viene avvisato.
export async function rispondiAffido(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const risposta = String(formData.get('risposta') ?? '');
  if (!token || (risposta !== 'preso_in_carico' && risposta !== 'rifiutato')) redirect('/');

  const appuntamento = String(formData.get('appuntamento_at') ?? '') || null;
  const nota = String(formData.get('nota') ?? '').trim().slice(0, 500) || null;

  const [aff] = await query<{ id: string }>(
    `select id from external_referrals
      where token = $1 and token_expires_at > now() and stato = 'inviato'
        and converted_referral_id is null`,
    [token]
  );
  if (!aff) redirect(`/affido/${token}`);

  await query(
    `update external_referrals
        set stato = $2, appuntamento_at = $3, risposta_nota = $4, responded_at = now()
      where id = $1`,
    [aff.id, risposta, risposta === 'preso_in_carico' ? appuntamento : null, nota]
  );

  await notifyRispostaAffido(aff.id);
  redirect(`/affido/${token}?ok=1`);
}
