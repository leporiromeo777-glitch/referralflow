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

