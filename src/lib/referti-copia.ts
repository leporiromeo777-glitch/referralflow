// Copia per conoscenza nella lettera (26.9.2026). Regole pure, niente AI:
// si provano in prove-allegati.test.ts.
//
// Da dove arriva l'elenco:
// 1. dal dettato: «copia al dottor Rossi», «per conoscenza alla dottoressa
//    Bianchi», «p.c. Dr. Verdi», «in copia anche al collega Neri» — nel testo
//    o nelle note per la segreteria, dove la catena sposta le istruzioni di
//    regia;
// 2. da chi rivede: il campo «Copia per conoscenza» della revisione, nomi
//    separati da «;». Se chi rivede ha toccato il campo (anche svuotandolo)
//    vince sempre la persona.
// Ogni nome si cerca nella rubrica degli invianti con la stessa regola del
// destinatario: omonimi mai indovinati. Chi non c'è entra comunque nella
// lettera, senza indirizzo, e la revisione lo segnala.

const INNESCO = /\b(?:(?:in\s+)?copia(?:\s+anche)?(?:\s+per\s+conoscenza)?|per\s+conoscenza|p\.\s?c\.|c\.\s?c\.)\s*(?:anche\s+)?(?:(?:alla|alle|agli|ai|al|a)\s+|all['’])?/gi;
const TITOLO = /^(?:(?:il|la)\s+)?(?:(?:collega|dottor|dottore|dottoressa|dott\.?(?:ssa)?|dr\.?(?:ssa)?|prof\.?(?:essor(?:e|essa))?|med\.?)\s+)+/i;
const PAROLA_NOME = /^(?:[A-ZÀ-Ý][\p{L}'’-]*|d[aei]|de|del|della|von|van)$/u;

// I nomi dopo un innesco: parole con la maiuscola (più le particelle «de»,
// «von»…), fino alla punteggiatura o alla prima parola minuscola; «e» e la
// virgola separano più destinatari.
export function copieDalDettato(testo: string, note: string[] = []): string[] {
  const fonti = [String(testo || ''), ...note.map((n) => String(n || ''))];
  const trovati: string[] = [];
  for (const fonte of fonti) {
    for (const m of fonte.matchAll(INNESCO)) {
      let resto = fonte.slice((m.index ?? 0) + m[0].length);
      // Il punto dei titoli («Dr. med.») non chiude la frase: si toglie prima.
      resto = resto.replace(/\b(dr|dott|prof|med|sig|dr\.?ssa|dott\.?ssa)\./gi, '$1 ').split(/[.;:\n()]/)[0];
      for (let pezzo of resto.split(/\s*,\s*|\s+e\s+(?:(?:alla|alle|agli|ai|al|a)\s+|all['’])?/)) {
        pezzo = pezzo.trim().replace(TITOLO, '');
        const parole: string[] = [];
        for (const w of pezzo.split(/\s+/)) {
          if (!w) continue;
          if (!PAROLA_NOME.test(w)) break;
          parole.push(w);
          if (parole.length >= 4) break;
        }
        // Serve almeno una parola con la maiuscola che non sia una particella.
        if (parole.some((w) => /^[A-ZÀ-Ý]/.test(w))) trovati.push(parole.join(' '));
        else break;
      }
    }
  }
  const visti = new Set<string>();
  return trovati.filter((n) => { const k = n.toLowerCase(); if (visti.has(k)) return false; visti.add(k); return true; });
}

// Il campo della revisione: «Dr. Rossi; Dr.ssa Bianchi».
export function copieDalCampo(campo: string): string[] {
  return String(campo || '').split(/\s*;\s*|\n+/).map((s) => s.trim()).filter(Boolean);
}

export type VoceCopia = { nome: string; indirizzo?: string };

export function bloccoCopiaConoscenza(voci: VoceCopia[]): string {
  if (!voci.length) return '';
  return ['Copia per conoscenza:', ...voci.map((v) => `-${[v.nome, v.indirizzo].filter(Boolean).join(', ')}`)].join('\n');
}
