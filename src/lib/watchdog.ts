// Soglie del «cane da guardia»: quanti giorni una referral può restare ferma
// in uno stato prima di essere segnalata (email giornaliera + badge in coda).
// Il tempo si misura dall'ultimo movimento (updated_at).

export const SOGLIE_FERMA: Record<string, number> = {
  ricevuta: 3,
  triage: 3,
  da_prenotare: 14,
};

export function giorniFermaMax(status: string): number | null {
  return SOGLIE_FERMA[status] ?? null;
}

// true se la referral è "ferma": oltre la soglia del suo stato.
export function isFerma(status: string, updatedAt: string | Date): boolean {
  const soglia = SOGLIE_FERMA[status];
  if (!soglia) return false;
  const giorni = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000;
  return giorni >= soglia;
}
