'use server';

import { redirect } from 'next/navigation';
import { sendPlain } from '@/lib/notify';

// La richiesta d'accesso arriva al supporto della piattaforma, che verifica
// l'identità professionale (es. registro MedReg) prima di attivare l'accesso.
export async function richiediAccesso(formData: FormData) {
  // Honeypot: i bot compilano il campo invisibile.
  if (String(formData.get('sito_web') ?? '') !== '') redirect('/registrazione?ok=1');

  const nome = String(formData.get('nome') ?? '').trim().slice(0, 120);
  const studio = String(formData.get('studio') ?? '').trim().slice(0, 120);
  const email = String(formData.get('email') ?? '').trim().slice(0, 160);
  const telefono = String(formData.get('telefono') ?? '').trim().slice(0, 40);
  const messaggio = String(formData.get('messaggio') ?? '').trim().slice(0, 1000);
  if (!nome || !email || !email.includes('@')) redirect('/registrazione?error=1');

  const to = process.env.SUPPORT_EMAIL || process.env.STUDIO_NOTIFY_EMAIL || '';
  if (to) {
    await sendPlain(
      to,
      'ReferralFlow — richiesta accesso inviante da verificare',
      [
        `Nuova richiesta di accesso per medico inviante:`,
        '',
        `Nome: ${nome}`,
        `Studio: ${studio || '—'}`,
        `Email: ${email}`,
        `Telefono: ${telefono || '—'}`,
        messaggio ? `Messaggio: ${messaggio}` : '',
        '',
        `Verifica l'identità (es. registro MedReg) prima di attivare l'accesso.`,
      ].filter(Boolean).join('\n')
    );
  }
  redirect('/registrazione?ok=1');
}
