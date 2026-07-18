import 'server-only';

// Invio SMS via provider svizzero (eCall REST v2: POST https://rest.ecall.ch/api/v2/message,
// autenticazione HTTP Basic con utente API). Config via env:
// - SMS_API_TOKEN: credenziali nel formato "utente:password" (utente API creato nel
//   portale eCall, Interfacce → Panoramica). Senza, non invia nulla: 'registrata'.
// - SMS_FROM: mittente (max 11 caratteri alfanumerici, es. "CCTicino").
// - SMS_API_URL: sovrascrivibile, in dev punta a un sink locale.
// Vincoli nLPD: mai dati clinici nel testo; il numero non finisce mai nei log.

export type SmsEsito = 'sms' | 'registrata' | 'errore';

// eCall vuole il numero in formato internazionale tipo 0041791234567.
function normalizzaNumero(raw: string): string {
  let n = raw.replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = '00' + n.slice(1);
  else if (n.startsWith('0') && !n.startsWith('00')) n = '0041' + n.slice(1);
  return n;
}

export async function sendSms(to: string, text: string): Promise<SmsEsito> {
  const cred = process.env.SMS_API_TOKEN;
  if (!cred) return 'registrata';

  const url = (process.env.SMS_API_URL || 'https://rest.ecall.ch/api/v2/message').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // "utente:password" → Basic; altrimenti Bearer (per sink di test).
        Authorization: cred.includes(':')
          ? `Basic ${Buffer.from(cred).toString('base64')}`
          : `Bearer ${cred}`,
      },
      body: JSON.stringify({
        channel: 'Sms',
        // Mittente: numerico max 16 cifre, alfanumerico max 11 caratteri.
        from: /^\d+$/.test(process.env.SMS_FROM || '')
          ? (process.env.SMS_FROM as string).slice(0, 16)
          : (process.env.SMS_FROM || 'ReferralFlow').slice(0, 11),
        to: normalizzaNumero(to),
        content: { type: 'Text', text },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return 'sms';
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'errore di rete');
    console.error('Invio SMS fallito:', msg);
    return 'errore';
  }
}
