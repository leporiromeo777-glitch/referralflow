import { copieDalDettato } from './referti-copia';
// Il foglio del dittafono (12.10.2026, [[Piattaforma/Dittafono]]). PURO.
//
// Chi detta con un programma di dettatura non scrive più in una casella: scrive su un FOGLIO che ha già la carta
// intestata dello studio, il destinatario, la data, il paziente, il saluto e la firma — e vede la lettera prendere
// forma. Decisione dello studio: quel che c'è sul foglio È la lettera da rivedere e firmare; la trascrizione che
// il Mac ricava dall'audio resta come controllo. Qui le regole: che cosa può portare un foglio, e come dal foglio
// si ricava il testo della lettera (saluto, corpo, chiusura e firma), che è la forma che la piattaforma usa già.

export const PARTI = ['destinatario', 'data', 'titolo', 'paziente', 'saluto', 'chiusura', 'copia'] as const;
export type Parte = (typeof PARTI)[number];
export type Foglio = Record<Parte, string>;

const pulita = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max) : '');
// Ciò che arriva dal browser: solo le parti previste, come testo, con un tetto di lunghezza.
export function pulisciFoglio(grezzo: unknown): Foglio | null {
  if (!grezzo || typeof grezzo !== 'object' || Array.isArray(grezzo)) return null;
  const g = grezzo as Record<string, unknown>;
  const f = Object.fromEntries(PARTI.map((k) => [k, pulita(g[k], k === 'destinatario' || k === 'chiusura' || k === 'paziente' ? 600 : 300)])) as Foglio;
  return PARTI.some((k) => f[k]) ? f : null;
}
// Il testo della lettera: saluto, corpo, chiusura con la firma — staccati da una riga vuota. Il resto del foglio
// (destinatario, data, titolo, paziente, copia) sono i campi che il Word mette da sé.
export function letteraDalFoglio(foglio: Pick<Foglio, 'saluto' | 'chiusura'>, corpo: string): string {
  return [foglio.saluto, corpo, foglio.chiusura].map((x) => String(x ?? '').replace(/\r\n?/g, '\n').trim()).filter(Boolean).join('\n\n');
}
// La copia per conoscenza scritta sul foglio (20.10.2026, dallo studio: «la copia per conoscenza non viene salvata»):
// la parte «Copia» del foglio non passava mai alla bozza. Qui se ne prendono i medici: ogni riga, tolti «Copia (per
// conoscenza):», trattini e punti elenco; una riga come «copia al dottor Rossi e alla dottoressa Bianchi» si legge
// come nel dettato. Il paziente e «in sede» non sono una copia per conoscenza (la riga «Copia: alla paziente» la mette
// il profilo del medico). → i nomi, per il campo `copia_conoscenza` della bozza.
const NON_MEDICO = /^(?:(?:al|alla|il|la|lo)\s+)?(?:paziente|pz\.?|signor[ae]?|interessat[oa])\b|^in\s+sede\b|^-+$/i;
export function copieDalFoglio(copia: string): string[] {
  const out: string[] = [];
  const metti = (n: string) => {
    // «… , in sede» è la riga del modello ancora da compilare: i puntini e «in sede» non sono un medico
    const nome = n.replace(/…|\.{3}/g, '').replace(/,?\s*in\s+sede\s*$/i, '').replace(/^[\s\-–•*·,]+/, '').replace(/[\s.,;:]+$/, '').trim();
    if (nome.length < 3 || !/[a-zà-ÿ]/i.test(nome) || NON_MEDICO.test(nome) || nome.length > 120) return;
    if (!out.some((x) => x.toLowerCase() === nome.toLowerCase())) out.push(nome);
  };
  for (const grezza of String(copia ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    let r = grezza.trim().replace(/^[\-–•*·]+\s*/, '');
    if (!r) continue;
    const testa = /^(?:copia(?:\s+per\s+conoscenza)?|c\.\s?c\.|p\.\s?c\.|cc)\s*:\s*/i.exec(r);
    if (testa) r = r.slice(testa[0].length).trim();
    else if (/^(?:in\s+)?copia\b|^per\s+conoscenza\b/i.test(r)) { copieDalDettato(r).forEach(metti); continue; }
    if (!r) continue;
    // «alla paziente e al Dr. Rossi»: più persone sulla stessa riga
    for (const pezzo of r.split(/\s*;\s*|\s+e\s+(?=(?:al|alla|il|la|dr|dott|prof)\b)/i)) metti(pezzo.replace(/^(?:al|alla|allo|ai|alle|a)\s+/i, ''));
  }
  return out;
}

// Il nome del destinatario dalle righe del blocco («Egregio Signor» / «Dr. med. Nome Cognome» / «FMH …» / «Via e-mail…»):
// la riga col titolo, se c'è; se no la prima che non è un appellativo né un recapito. Vuoto se il blocco è ancora da compilare.
export function nomeDestinatario(destinatario: string): string {
  const righe = String(destinatario ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/^(egregi[oa]|gentil[ei]|spettabile|car[oa])\b/i.test(x) && !/^(via e-?mail|fmh\b|via |tel\.?|fax|\d{4}\s)/i.test(x) && !/@/.test(x));
  const conTitolo = righe.find((x) => /^(dr\.?(ssa)?|dott\.?(ssa)?|dottor(e|essa)?|prof\.?)(\s|$)/i.test(x)) ?? righe[0] ?? '';
  const nome = conTitolo.replace(/^(prof\.?\s*)?(dr\.?(ssa)?|dott\.?(ssa)?|dottor(e|essa)?)\.?\s*(med\.?\s*)?/i, '').trim();
  return nome.length >= 3 ? conTitolo : '';
}

// Il paziente scritto sul foglio («Paziente», poi «Cognome Nome – 31.12.1950»): nome e data di nascita per i campi del Word.
export function pazienteDalTesto(testo: string): Record<string, string> {
  const riga = String(testo ?? '').split('\n').map((r) => r.trim()).filter((r) => r && !/^paziente:?$/i.test(r))[0] ?? '';
  const d = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(riga);
  const nome = riga.replace(/^paziente:?\s*/i, '').split(/\s+[–—-]\s+|,\s*|\s+(?=\d{1,2}[./])/)[0].trim();
  return { ...(nome && /[A-Za-zÀ-ÿ]/.test(nome) ? { nome_paziente: nome.slice(0, 120) } : {}), ...(d ? { data_nascita: `${d[1].padStart(2, '0')}.${d[2].padStart(2, '0')}.${d[3]}` } : {}) };
}

