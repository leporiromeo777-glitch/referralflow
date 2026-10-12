// I comandi a voce del dittafono (12.10.2026, [[Piattaforma/Dittafono]]). PURO.
//
// Chi detta sul foglio può chiedere, con la parola d'ordine «per favore», di farsi mettere nel foglio un pezzo di una
// lettera che c'è già: la lettera più recente del paziente, o la sua terapia. Qui le regole per ricavare quel pezzo
// dal testo della lettera trovata: il CORPO (senza carta intestata, destinatario, saluto in testa, saluti e firma in
// fondo: sul foglio ci sono già) e il blocco della TERAPIA. Il riconoscimento della frase detta sta nella pagina
// (public/prototipo/dittafono-comandi.js): è lì che il programma di dettatura scrive.
import { estraiTerapia } from './referti-terapia';

export const COMANDI = ['lettera_recente', 'terapia_recente'] as const;
export type Comando = (typeof COMANDI)[number];

const RX_SALUTO_RIGA = /^[ \t]*(?:caro|cara|cari|gentile|gentili|egregio|egregia|stimato|stimata|lieber|liebe|sehr geehrte[rs]?)\b[^\n,]{0,80},[ \t]*/im;
const RX_CHIUSURA = /(rimanendo a (?:tua |sua |vostra )?disposizione|rimango a (?:tua |sua |vostra )?disposizione|resto a (?:tua |sua |vostra )?disposizione|cordiali saluti|distinti saluti|migliori saluti|cari saluti|un cordiale saluto|collegiali saluti|un caro saluto|con stima\b|freundliche[nm]? gr[uü](?:ss|ß)e?n?)/i;
const pulisci = (t: string) => t.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// Il corpo: da dopo il saluto (cercato in testa) a prima dei saluti finali (cercati nella seconda metà: «cordiali
// saluti» citato in mezzo a una lettera non è la fine). Se così resta troppo poco, vale la lettera intera.
export function corpoDellaLettera(testo: string): string {
  const t = pulisci(String(testo ?? ''));
  const s = RX_SALUTO_RIGA.exec(t.slice(0, 2500));
  let corpo = s ? t.slice(s.index + s[0].length) : t;
  const meta = Math.floor(corpo.length / 2);
  const c = RX_CHIUSURA.exec(corpo.slice(meta));
  if (c) {
    const dove = meta + c.index;
    // si taglia dall'inizio della frase che porta i saluti
    const inizioFrase = Math.max(corpo.lastIndexOf('\n', dove - 1), corpo.lastIndexOf('. ', dove - 1) + 1);
    corpo = corpo.slice(0, inizioFrase < 0 ? dove : inizioFrase + 1);
  }
  corpo = pulisci(corpo);
  return corpo.length >= 80 ? corpo : t;
}

// La terapia: il blocco sotto «Terapia:» a riga propria (come nelle lettere dello studio), o ciò che segue
// «Terapia…:» sulla stessa riga, fino alla riga vuota o ai saluti. Vuoto se non c'è.
export function terapiaDellaLettera(testo: string): string {
  const t = pulisci(String(testo ?? ''));
  const righe = estraiTerapia(t);
  if (righe.length) return `Terapia:\n${righe.join('\n')}`;
  const m = /(?:^|[\n.;]\s*)(terapia(?:\s+(?:domiciliare|attuale|in corso|in atto|farmacologica|abituale))?\s*:)[ \t]*([^\n]+(?:\n(?![ \t]*\n)[^\n]+)*)/i.exec(t);
  if (!m) return '';
  let blocco = m[2];
  const c = RX_CHIUSURA.exec(blocco);
  if (c) blocco = blocco.slice(0, Math.max(blocco.lastIndexOf('. ', c.index) + 1, 0) || c.index);
  blocco = pulisci(blocco).slice(0, 2000);
  return blocco.length >= 5 ? `Terapia: ${blocco}` : '';
}
