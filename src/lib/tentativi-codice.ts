import 'server-only';

// I codici a sei cifre (attivazione dello studio, primo accesso di un inviante) valgono quindici minuti: senza un
// limite ai tentativi, un milione di combinazioni si provano tutte in quel tempo (13.10.2026, controllo di sicurezza).
// Qui si contano gli errori per codice: al quinto il codice va annullato da chi chiama, e se ne chiede uno nuovo.
// In memoria: un riavvio azzera il conto, ma il codice scade comunque da solo.
const MASSIMO = 5;
const errori = new Map<string, { n: number; quando: number }>();

// true = ancora tentativi; false = troppi errori (il chiamante annulla il codice).
export function tentativoAmmesso(chiave: string): boolean {
  const e = errori.get(chiave);
  if (e && Date.now() - e.quando > 20 * 60_000) { errori.delete(chiave); return true; }
  return !e || e.n < MASSIMO;
}
// Segna un errore; restituisce true se con questo si è arrivati al limite.
export function tentativoSbagliato(chiave: string): boolean {
  const e = errori.get(chiave) ?? { n: 0, quando: Date.now() };
  e.n++; errori.set(chiave, e);
  if (errori.size > 2000) errori.delete(errori.keys().next().value as string);
  return e.n >= MASSIMO;
}
export function tentativoRiuscito(chiave: string): void { errori.delete(chiave); }
