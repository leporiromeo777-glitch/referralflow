import 'server-only';

// Blocco tentativi di login falliti: in memoria (l'app gira su un solo
// processo Node), niente dipendenze esterne. Due limiti indipendenti:
// - per EMAIL: blocca chi prova a indovinare la password di un account preciso;
// - per IP: blocca chi prova tante email diverse dallo stesso posto (spray/
//   enumerazione account) — altrimenti il blocco per email da solo si aggira
//   semplicemente cambiando email a ogni tentativo.
type Entry = { count: number; firstAttempt: number; lockedUntil: number };

function makeLimiter(maxAttempts: number, windowMs: number, lockMs: number) {
  const attempts = new Map<string, Entry>();

  // Evita che la mappa cresca senza limite: alla lettura, le voci più vecchie
  // della finestra (e non più bloccate) vengono scartate.
  function prune(key: string): Entry | undefined {
    const e = attempts.get(key);
    if (!e) return undefined;
    if (e.lockedUntil <= Date.now() && Date.now() - e.firstAttempt > windowMs) {
      attempts.delete(key);
      return undefined;
    }
    return e;
  }

  return {
    /** Se bloccato, restituisce il timestamp (ms) di fine blocco. */
    isLocked(key: string): number | null {
      const e = prune(key);
      if (e && e.lockedUntil > Date.now()) return e.lockedUntil;
      return null;
    },
    recordFailure(key: string): void {
      const now = Date.now();
      const e = prune(key);
      if (!e || now - e.firstAttempt > windowMs) {
        attempts.set(key, { count: 1, firstAttempt: now, lockedUntil: 0 });
        return;
      }
      e.count += 1;
      if (e.count >= maxAttempts) e.lockedUntil = now + lockMs;
    },
    clear(key: string): void {
      attempts.delete(key);
    },
  };
}

const byEmail = makeLimiter(5, 15 * 60 * 1000, 15 * 60 * 1000);
// Soglia più larga per IP: più persone reali possono condividere lo stesso
// Wi-Fi di studio, non deve bastare qualche errore di battitura in due a bloccarli.
const byIp = makeLimiter(20, 15 * 60 * 1000, 15 * 60 * 1000);

// Reset password: soglie basse perché ogni richiesta manda un'email (va
// protetto da abuso / email-bombing). Ogni richiesta conta, non solo i fallimenti.
const resetByEmail = makeLimiter(3, 15 * 60 * 1000, 15 * 60 * 1000);
const resetByIp = makeLimiter(15, 15 * 60 * 1000, 15 * 60 * 1000);

/** true se le richieste di reset da questa email o IP sono per ora troppe. */
export function isResetLocked(email: string, ip: string): boolean {
  return resetByEmail.isLocked(email) !== null || resetByIp.isLocked(ip) !== null;
}
export function recordResetRequest(email: string, ip: string): void {
  resetByEmail.recordFailure(email);
  resetByIp.recordFailure(ip);
}

/** Se il login è bloccato (per email o per IP), il timestamp (ms) di fine blocco. */
export function isLoginLocked(email: string, ip: string): number | null {
  const emailLock = byEmail.isLocked(email);
  const ipLock = byIp.isLocked(ip);
  if (emailLock && ipLock) return Math.max(emailLock, ipLock);
  return emailLock ?? ipLock;
}

export function recordFailedLogin(email: string, ip: string): void {
  byEmail.recordFailure(email);
  byIp.recordFailure(ip);
}

export function clearLoginAttempts(email: string): void {
  byEmail.clear(email);
  // L'IP non si azzera al login riuscito: un successo non lo rende fidato per
  // sempre (potrebbe essere una rete condivisa con un tentativo in corso).
}
