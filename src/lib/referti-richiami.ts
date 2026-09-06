// Richiami dal referto (2026-09-06, quarto documento: le note alla segreteria
// come «oggetti d'azione»). Il codice riconosce nel dettato «controllo tra sei
// mesi», «rivalutazione a 12 mesi», «follow-up tra un anno» e propone un
// richiamo sulla referral del paziente; lo crea solo chi preme il bottone.

const NUMERI: Record<string, number> = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, otto: 8, nove: 9,
  dieci: 10, dodici: 12, diciotto: 18, ventiquattro: 24, trentasei: 36,
};

const RX = /\b(controllo|ricontrollo|rivalutazione|rivalutare|rivedere|rivediamo|rivedrò|follow[- ]?up|visita di controllo|prossima visita)\b[^.;\n]{0,50}?\b(tra|fra|a|in|dopo)\s+(\d{1,2}|un|uno|una|due|tre|quattro|cinque|sei|otto|nove|dieci|dodici|diciotto|ventiquattro|trentasei)\s*(mes[ei]|settiman[ae]|ann[oi])\b/i;

export type RichiamoProposto = { mesi: number; frase: string };

export function rilevaRichiamo(testi: string[]): RichiamoProposto | null {
  for (const testo of testi) {
    if (!testo) continue;
    const m = testo.match(RX);
    if (!m) continue;
    const n = /^\d+$/.test(m[3]) ? parseInt(m[3], 10) : NUMERI[m[3].toLowerCase()];
    if (!n) continue;
    const unita = m[4].toLowerCase();
    let mesi = unita.startsWith('ann') ? n * 12 : unita.startsWith('settiman') ? Math.max(1, Math.round(n / 4)) : n;
    if (mesi < 1 || mesi > 120) continue;
    const inizio = Math.max(0, (m.index ?? 0) - 30);
    return { mesi, frase: testo.slice(inizio, (m.index ?? 0) + m[0].length + 20).trim() };
  }
  return null;
}
