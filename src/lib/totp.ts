import 'server-only';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';

// TOTP (RFC 6238) con la crittografia nativa di Node: codici a 6 cifre,
// finestra di 30 secondi, compatibile con Google Authenticator, Microsoft
// Authenticator, Authy, ecc. Nessuna dipendenza esterna: il segreto non
// lascia mai il server.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_S = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

// Verifica il codice accettando anche la finestra precedente e successiva
// (±30 s), per assorbire orologi leggermente fuori sincrono.
export function verifyTotp(secretBase32: string, code: string): boolean {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / PERIOD_S);
  for (const delta of [0, -1, 1]) {
    const expected = hotp(secret, counter + delta);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

// URL otpauth per il QR (mostrato solo durante l'attivazione).
export function totpUri(secretBase32: string, accountEmail: string): string {
  const issuer = 'ReferralFlow';
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}` +
    `?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${PERIOD_S}`;
}

// Codici di recupero: 8 codici monouso ad alta entropia. In tabella va solo
// l'hash; i codici in chiaro si mostrano una volta sola, all'attivazione.
export function generateRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase(); // 8 caratteri
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}
