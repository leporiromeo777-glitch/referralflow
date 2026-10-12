// I comandi a voce del dittafono (12.10.2026, [[Piattaforma/Dittafono]]). PURO.
//
// Chi detta sul foglio può chiedere, con la parola d'ordine «per favore», di farsi mettere nel foglio un pezzo di una
// lettera che c'è già: la lettera più recente del paziente, o la sua terapia. Qui le regole per ricavare quel pezzo
// dal testo della lettera trovata: il CORPO (senza carta intestata, destinatario, saluto in testa, saluti e firma in
// fondo: sul foglio ci sono già) e il blocco della TERAPIA. Il riconoscimento della frase detta sta nella pagina
// (public/prototipo/dittafono-comandi.js): è lì che il programma di dettatura scrive.
import { famigliaDi } from './forma-lettera';
import { estraiTerapia } from './referti-terapia';

export const COMANDI = ['lettera_recente', 'parti'] as const;
export type Comando = (typeof COMANDI)[number];
// Le PARTI che si possono chiedere una per una (12.10.2026, richiesta dello studio: «se chiedo solo una parte della
// lettera, prendimi solo quella»). Le lettere dello studio vanno così: anamnesi (il primo paragrafo), FRCV,
// comorbidità, poi le conclusioni dei singoli esami, poi la conclusione generale.
export const PARTI_LETTERA = ['anamnesi', 'frcv', 'comorbidita', 'allergie', 'diagnosi', 'esame', 'ecg', 'eco', 'sforzo', 'holter', 'laboratorio', 'conclusione', 'terapia'] as const;
export type ParteLettera = (typeof PARTI_LETTERA)[number];
export const NOME_PARTE: Record<ParteLettera, string> = { anamnesi: 'anamnesi', frcv: 'FRCV', comorbidita: 'comorbidità', allergie: 'allergie', diagnosi: 'diagnosi', esame: 'esame clinico', ecg: 'ECG', eco: 'ecocardiogramma', sforzo: 'test da sforzo', holter: 'Holter', laboratorio: 'laboratorio', conclusione: 'conclusione', terapia: 'terapia' };

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

// Dove comincia una parte quando NON ha un'etichetta coi due punti: la frase che la apre («Clinicamente…», «All'ECG…»).
const APERTURE: [ParteLettera, RegExp][] = [
  ['esame', /^(?:clinicamente|all['’]esame (?:clinico|obiettivo)|esame (?:clinico|obiettivo)|obiettivamente|parametri vitali)(?![a-zà-ù])/i],
  ['ecg', /^(?:all['’]\s?ecg|l['’]\s?ecg|ecg|all['’]\s?elettrocardiogramma|l['’]\s?elettrocardiogramma|elettrocardiogramma|il tracciato)(?![a-zà-ù])/i],
  ['eco', /^(?:all['’]\s?ecocardiogra(?:mma|fia)|l['’]\s?ecocardiogra(?:mma|fia)|ecocardiogra(?:mma|fia)|all['’]\s?eco)(?![a-zà-ù])/i],
  ['sforzo', /^(?:(?:all['’]\s?|l['’]\s?)?ergometria|(?:alla |la )?(?:ciclo|spiro)ergometria|(?:al |il )?test da sforzo|(?:alla |la )?prova da sforzo)(?![a-zà-ù])/i],
  ['holter', /^(?:all['’]\s?|l['’]\s?)?holter(?![a-zà-ù])/i],
  ['laboratorio', /^(?:agli |gli )?esami (?:di laboratorio|ematici|ematochimici|del sangue)(?![a-zà-ù])|^(?:al |il )?laboratorio(?![a-zà-ù])/i],
  ['conclusione', /^(?:in conclusione|concludendo|in sintesi|riassumendo)(?![a-zà-ù])/i],
];
// Le parti che sono un elenco o un esame finiscono col loro paragrafo; la conclusione arriva fino alla parte dopo.
const FINO_AL_PARAGRAFO = new Set<string>(['frcv', 'comorbidita', 'allergie', 'diagnosi', 'terapia', 'esame', 'ecg', 'eco', 'sforzo', 'holter', 'laboratorio']);
const DI_FAMIGLIA: Record<string, ParteLettera> = { frcv: 'frcv', comorbidita: 'comorbidita', allergie: 'allergie', diagnosi: 'diagnosi', anamnesi: 'anamnesi', esame: 'esame', ecg: 'ecg', eco: 'eco', sforzo: 'sforzo', holter: 'holter', laboratorio: 'laboratorio', conclusione: 'conclusione', terapia: 'terapia' };

// Le parti del corpo di una lettera. Una parte comincia dove una frase (o una riga) si apre con l'etichetta di una
// categoria («FRCV:», «Comorbidità:» — le stesse famiglie del grassetto, comunque scritte) o con la frase che apre un
// esame o la conclusione. Ciò che viene prima della prima parte è l'ANAMNESI: il primo paragrafo.
export function partiDellaLettera(testo: string): Partial<Record<ParteLettera, string>> {
  const t = corpoDellaLettera(testo);
  const inizi: number[] = [0];
  for (const m of t.matchAll(/\n+[ \t]*|[.!?][ \t]+(?=[\p{Lu}•\-–])/gu)) inizi.push((m.index ?? 0) + m[0].length);
  const confini: { i: number; parte: ParteLettera | null }[] = [];
  for (const i of inizi) {
    const qui = t.slice(i, i + 80);
    const e = /^[\s•\-–]*([^\n:.!?;]{2,45}):/u.exec(qui);
    const fam = e ? famigliaDi(e[1]) : null;
    let parte: ParteLettera | null = fam ? DI_FAMIGLIA[fam] ?? null : null;
    if (!parte && !fam) parte = APERTURE.find(([, rx]) => rx.test(qui.replace(/^[\s•\-–]+/, '')))?.[0] ?? null;
    if (parte && confini[confini.length - 1]?.parte !== parte) confini.push({ i, parte });
    // un'etichetta di un'altra categoria (non fra le parti) chiude comunque la parte prima
    else if (!parte && fam) confini.push({ i, parte: null });
  }
  const out: Partial<Record<ParteLettera, string>> = {};
  const aggiungi = (parte: ParteLettera, pezzo: string) => { const p = pulisci(pezzo); if (p) out[parte] = out[parte] ? `${out[parte]}\n\n${p}` : p; };
  const primo = confini[0]?.i ?? t.length;
  // l'anamnesi senza etichetta: il primo paragrafo di ciò che precede la prima parte
  if (primo > 0 && confini[0]?.parte !== 'anamnesi') aggiungi('anamnesi', t.slice(0, primo).split(/\n[ \t]*\n/)[0]);
  confini.forEach((c, k) => {
    if (!c.parte) return;
    let pezzo = t.slice(c.i, confini[k + 1]?.i ?? t.length);
    if (FINO_AL_PARAGRAFO.has(c.parte)) pezzo = pezzo.split(/\n[ \t]*\n/)[0];
    aggiungi(c.parte, pezzo);
  });
  // La terapia ha il suo lettore (il blocco sotto «Terapia:», riga per riga): vale quello.
  const ter = terapiaDellaLettera(testo);
  if (ter) out.terapia = ter;
  return out;
}
