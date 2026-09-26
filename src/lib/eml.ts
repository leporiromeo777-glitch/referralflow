// Una mail pronta da aprire nel programma di posta (26.9.2026): file .eml con
// destinatari, oggetto, testo e allegati. Puro, senza rete: la piattaforma
// NON spedisce (regola nLPD: mai dati clinici in mail dalla piattaforma), la
// mail la manda chi la apre, dal suo programma — nello studio, HIN.
// «X-Unsent: 1» fa aprire il file come bozza da inviare (Outlook; in Apple Mail
// «Invia di nuovo», in Thunderbird «Modifica come nuovo messaggio»).

export type AllegatoEml = { nome: string; tipo: string; dati: Buffer };

const RX_EMAIL = /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[a-z]{2,}$/i;

export function emailValida(s: string): boolean {
  return RX_EMAIL.test(String(s || '').trim());
}

// RFC 2047: un'intestazione con caratteri non ASCII va codificata.
export function intestazione(s: string): string {
  const pulito = String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(pulito) ? pulito : `=?UTF-8?B?${Buffer.from(pulito, 'utf8').toString('base64')}?=`;
}

function base64aRighe(b: Buffer): string {
  return (b.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}

// Nome del file: ASCII per i programmi vecchi, RFC 2231 per gli altri.
function nomeFile(nome: string): string {
  const ascii = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const pct = encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `filename="${ascii}"; filename*=UTF-8''${pct}`;
}

export function componiEml(m: { a: string[]; cc?: string[]; oggetto: string; testo: string; allegati: AllegatoEml[]; data?: Date; confine?: string }): string {
  const a = m.a.map((x) => x.trim()).filter(emailValida);
  const cc = (m.cc ?? []).map((x) => x.trim()).filter(emailValida).filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()));
  const confine = m.confine ?? `rf-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const righe = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    `Date: ${(m.data ?? new Date()).toUTCString().replace('GMT', '+0000')}`,
    `To: ${a.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${intestazione(m.oggetto)}`,
    `Content-Type: multipart/mixed; boundary="${confine}"`,
    '',
    `--${confine}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64aRighe(Buffer.from(m.testo.replace(/\r?\n/g, '\r\n'), 'utf8')),
  ];
  for (const al of m.allegati) {
    righe.push(
      `--${confine}`,
      `Content-Type: ${al.tipo}; name="${al.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${nomeFile(al.nome)}`,
      '',
      base64aRighe(al.dati),
    );
  }
  righe.push(`--${confine}--`, '');
  return righe.join('\r\n');
}

// HIN cifra la posta fra membri: un indirizzo che non è HIN riceve in chiaro.
export function eHin(email: string): boolean {
  return /@hin\.ch$/i.test(String(email || '').trim());
}
