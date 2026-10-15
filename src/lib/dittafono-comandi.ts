// I comandi a voce del dittafono (12.10.2026, [[Piattaforma/Dittafono]]). PURO.
//
// Chi detta sul foglio può chiedere, con la parola d'ordine «per favore», di farsi mettere nel foglio un pezzo di una
// lettera che c'è già: la lettera più recente del paziente, o la sua terapia. Qui le regole per ricavare quel pezzo
// dal testo della lettera trovata: il CORPO (senza carta intestata, destinatario, saluto in testa, saluti e firma in
// fondo: sul foglio ci sono già) e il blocco della TERAPIA. Il riconoscimento della frase detta sta nella pagina
// (public/prototipo/dittafono-comandi.js): è lì che il programma di dettatura scrive.
import { famigliaDi } from './forma-lettera';
import { estraiTerapia } from './referti-terapia';

export const COMANDI = ['lettera_recente', 'parti', 'fino'] as const;
export type Comando = (typeof COMANDI)[number];
// Le PARTI che si possono chiedere una per una (12.10.2026, richiesta dello studio: «se chiedo solo una parte della
// lettera, prendimi solo quella»). Le lettere dello studio vanno così: anamnesi (il primo paragrafo), FRCV,
// comorbidità, poi le conclusioni dei singoli esami, poi la conclusione generale.
export const PARTI_LETTERA = ['anamnesi', 'frcv', 'comorbidita', 'allergie', 'diagnosi', 'esame', 'ecg', 'eco', 'sforzo', 'holter', 'laboratorio', 'conclusione', 'terapia'] as const;
export type ParteLettera = (typeof PARTI_LETTERA)[number];
export const NOME_PARTE: Record<ParteLettera, string> = { anamnesi: 'anamnesi', frcv: 'FRCV', comorbidita: 'comorbidità', allergie: 'allergie', diagnosi: 'diagnosi', esame: 'esame clinico', ecg: 'ECG', eco: 'ecocardiogramma', sforzo: 'test da sforzo', holter: 'Holter', laboratorio: 'laboratorio', conclusione: 'conclusione', terapia: 'terapia' };

const RX_SALUTO_RIGA = /^[ \t]*(?:caro|cara|cari|gentile|gentili|egregio|egregia|stimato|stimata|lieber|liebe|sehr geehrte[rs]?)\b[^\n,]{0,80},[ \t]*/im;
// …o una riga corta che è solo il saluto, senza la virgola («Caro Mirko» e a capo: 3 lettere vere su 36, 15.10.2026)
const RX_SALUTO_NUDO = /^[ \t]*(?:caro|cara|cari|gentile|gentili|egregio|egregia|stimato|stimata|lieber|liebe|sehr geehrte[rs]?)\b[^\n,.;:!?]{1,50}[ \t]*\n/im;
// Vale quello con la virgola, se c'è; quello senza solo in mancanza, e mai la riga del destinatario («Egregio Signor»
// e a capo il nome: è l'indirizzo della lettera, non il saluto).
function salutoIn(t: string): RegExpExecArray | null {
  const a = RX_SALUTO_RIGA.exec(t); if (a) return a;
  const b = RX_SALUTO_NUDO.exec(t);
  return b && !/^\s*(?:egregi[oa]|gentile|spettabile|stimat[oa])\s+(?:signor[ae]?|sig\.?(?:ra|na)?|dott(?:\.|ore|oressa)?(?:ssa)?|prof(?:\.|essore|essoressa)?)\s*$/i.test(b[0]) ? b : null;
}
const RX_CHIUSURA = /(rimanendo a (?:tua |sua |vostra )?disposizione|rimango a (?:tua |sua |vostra )?disposizione|resto a (?:tua |sua |vostra )?disposizione|cordiali saluti|distinti saluti|migliori saluti|cari saluti|un cordiale saluto|collegiali saluti|un caro saluto|con stima\b|freundliche[nm]? gr[uü](?:ss|ß)e?n?)/i;
const pulisci = (t: string) => t.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// I Word letti dal file hanno una riga vuota dopo OGNI paragrafo: lì la riga vuota non separa niente, e chi si ferma
// «alla fine del paragrafo» si ferma dopo la prima riga (misurato sulle lettere vere, 12.10.2026: la terapia usciva di
// una riga sola). Se TUTTI gli a capo sono doppi (in un testo scritto a paragrafi veri ce n'è sempre qualcuno semplice),
// un a capo doppio torna semplice — e i paragrafi vuoti lasciati apposta, che erano quattro a capo, tornano una riga vuota.
export function righeVere(testo: string): string {
  const t = String(testo ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n');
  const stacchi = t.match(/\n+/g) ?? [];
  if (stacchi.length < 6 || stacchi.some((x) => x.length < 2)) return t;
  return t.replace(/\n\n/g, '\n');
}

// Il corpo: da dopo il saluto (cercato in testa) a prima dei saluti finali (cercati nella seconda metà: «cordiali
// saluti» citato in mezzo a una lettera non è la fine). Se così resta troppo poco, vale la lettera intera.
export function corpoDellaLettera(testo: string): string {
  const t = pulisci(righeVere(testo));
  const s = salutoIn(t.slice(0, 2500));
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

// Il saluto in testa alla lettera («Caro Mirko,»): con la lettera intera, o «fino a…», va nel campo del saluto del
// foglio (15.10.2026, dallo studio: «se dico riprendimi la lettera deve prendermi anche il saluto iniziale»). Vuoto se non c'è.
export function salutoDellaLettera(testo: string): string {
  const s = salutoIn(pulisci(righeVere(testo)).slice(0, 2500));
  if (!s) return '';
  const r = s[0].replace(/\s+/g, ' ').trim().slice(0, 120);
  return /,$/.test(r) ? r : `${r},`;
}

// La terapia: il blocco sotto «Terapia:» a riga propria (come nelle lettere dello studio), o ciò che segue
// «Terapia…:» sulla stessa riga, fino alla riga vuota o ai saluti. Vuoto se non c'è.
export function terapiaDellaLettera(testo: string): string {
  const t = pulisci(righeVere(testo));
  let righe = estraiTerapia(t);
  // Senza una riga vuota dopo l'elenco (i Word): i farmaci sono righe brevi, e l'elenco finisce dove comincia un'altra
  // parte («In conclusione…», «ECG:») o riprende il racconto.
  const fuori = righe.findIndex((r) => r.length > 110 || APERTURE.some(([, rx]) => rx.test(r)) || (() => { const e = /^([^\n:.!?;]{2,45}):/.exec(r); return !!e && !!famigliaDi(e[1]); })());
  if (fuori >= 0) righe = righe.slice(0, fuori);
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
  // a inizio frase e seguiti da «:» o «(» anche se l'etichetta è scritta in un modo che le famiglie non conoscono
  // (misurato il 15.10.2026 sulle lettere vere: 1 su 36)
  ['frcv', /^(?:fattor[ei] di rischio(?:\s+cardio[\s-]?vascolar[ei])?|f\.?\s?r\.?\s?c\.?\s?v\.?)\s*[:(]/i],
  ['comorbidita', /^(?:co-?morbi[dl]it[aàá])\s*[:(]/i],
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
const ELENCHI = new Set<string>(['frcv', 'comorbidita', 'allergie', 'diagnosi']);
const DI_FAMIGLIA: Record<string, ParteLettera> = { frcv: 'frcv', comorbidita: 'comorbidita', allergie: 'allergie', diagnosi: 'diagnosi', anamnesi: 'anamnesi', esame: 'esame', ecg: 'ecg', eco: 'eco', sforzo: 'sforzo', holter: 'holter', laboratorio: 'laboratorio', conclusione: 'conclusione', terapia: 'terapia' };

// Le parti del corpo di una lettera. Una parte comincia dove una frase (o una riga) si apre con l'etichetta di una
// categoria («FRCV:», «Comorbidità:» — le stesse famiglie del grassetto, comunque scritte) o con la frase che apre un
// esame o la conclusione. Ciò che viene prima della prima parte è l'ANAMNESI: il primo paragrafo.
type Confine = { i: number; parte: ParteLettera | null };
function confiniDelCorpo(t: string): Confine[] {
  const inizi: number[] = [0];
  for (const m of t.matchAll(/\n+[ \t]*|[.!?][ \t]+(?=[\p{Lu}•\-–])/gu)) inizi.push((m.index ?? 0) + m[0].length);
  const confini: { i: number; parte: ParteLettera | null }[] = [];
  for (const i of inizi) {
    const qui = t.slice(i, i + 80);
    const e = /^[\s•\-–]*([^\n:.!?;]{2,45}):/u.exec(qui);
    const fam = e ? famigliaDi(e[1]) : null;
    let parte: ParteLettera | null = fam ? DI_FAMIGLIA[fam] ?? null : null;
    if (!parte && !fam) parte = APERTURE.find(([, rx]) => rx.test(qui.replace(/^[\s•\-–]+/, '')))?.[0] ?? null;
    const aRiga = i === 0 || t[i - 1] === '\n' || /\n[ \t]*$/.test(t.slice(Math.max(0, i - 4), i));
    if (parte && confini[confini.length - 1]?.parte !== parte) confini.push({ i, parte });
    // un'etichetta di un'altra categoria (non fra le parti), o un'etichetta qualunque a inizio riga («Coronarografia
    // 2019:»), chiude comunque la parte prima
    else if (!parte && (fam || (e && aRiga))) confini.push({ i, parte: null });
  }
  return confini;
}
// Il pezzo di una parte che comincia al confine k: fin dove arriva la parte dopo, ma un esame o un elenco finisce col
// suo paragrafo, e un elenco (FRCV, comorbidità…) è fatto di righe brevi: una riga lunga dopo è già il racconto che riprende.
function pezzoDelConfine(t: string, confini: Confine[], k: number): string {
  const c = confini[k];
  let pezzo = t.slice(c.i, confini[k + 1]?.i ?? t.length);
  if (c.parte && FINO_AL_PARAGRAFO.has(c.parte)) pezzo = pezzo.split(/\n[ \t]*\n/)[0];
  if (c.parte && ELENCHI.has(c.parte)) { const righe = pezzo.split('\n'); const stop = righe.findIndex((r, n) => n > 0 && r.trim().length > 160); if (stop > 0) pezzo = righe.slice(0, stop).join('\n'); }
  // un elenco dentro un paragrafo lungo tutto di fila (una scansione): finisce con la sua frase
  if (c.parte && ELENCHI.has(c.parte) && pezzo.length > 300 && !pezzo.slice(0, 300).includes('\n')) { const f = /[.!?](?=\s|$)/.exec(pezzo); if (f) pezzo = pezzo.slice(0, f.index + 1); }
  return pezzo;
}

export function partiDellaLettera(testo: string): Partial<Record<ParteLettera, string>> {
  const t = corpoDellaLettera(testo);
  const confini = confiniDelCorpo(t);
  const out: Partial<Record<ParteLettera, string>> = {};
  const aggiungi = (parte: ParteLettera, pezzo: string) => { const p = pulisci(pezzo); if (p) out[parte] = out[parte] ? `${out[parte]}\n\n${p}` : p; };
  const primo = confini[0]?.i ?? t.length;
  // L'anamnesi senza etichetta: tutto ciò che precede la prima parte (nelle lettere dello studio è il primo paragrafo,
  // poi vengono FRCV e il resto). Se la lettera non ha nessuna parte riconoscibile, solo il primo paragrafo — o la
  // prima riga, dove i paragrafi sono righe — e non la lettera intera.
  if (primo > 0 && confini[0]?.parte !== 'anamnesi') {
    const prima = t.slice(0, primo);
    if (confini.length) aggiungi('anamnesi', prima);
    else { const blocchi = prima.split(/\n[ \t]*\n/); aggiungi('anamnesi', blocchi.length > 1 ? blocchi[0] : prima.split('\n').find((r) => r.trim().length >= 40) ?? prima.split('\n')[0]); }
  }
  confini.forEach((c, k) => { if (c.parte) aggiungi(c.parte, pezzoDelConfine(t, confini, k)); });
  // La terapia ha il suo lettore (il blocco sotto «Terapia:», riga per riga): vale quello.
  const ter = terapiaDellaLettera(testo);
  if (ter) out.terapia = ter;
  return out;
}

// «Riprendimi la lettera fino a…» (15.10.2026, richiesta dello studio): il corpo della lettera dall'inizio fino alla
// fine di una parte (`esclusa` = fino a dove quella parte comincia). Vuoto se la lettera quella parte non ce l'ha.
export function letteraFinoA(testo: string, parte: ParteLettera, esclusa = false): string {
  const t = corpoDellaLettera(testo);
  const confini = confiniDelCorpo(t);
  let k = confini.findIndex((c) => c.parte === parte);
  let fine = -1;
  if (parte === 'anamnesi' && (k < 0 || k === 0 && confini[0].i === 0)) {
    // l'anamnesi senza etichetta è ciò che precede la prima parte (o il primo paragrafo); prima di lei non c'è niente
    if (esclusa) return '';
    if (k < 0) { const primo = confini[0]?.i ?? 0; fine = primo > 0 ? primo : t.split(/\n[ \t]*\n/)[0].length; }
  }
  if (fine < 0) {
    if (k < 0 && parte === 'terapia') { const m = /(?:^|\n)[ \t]*terapia[^\n:]{0,30}:/i.exec(t); if (m) { const i = m.index + (m[0].startsWith('\n') ? 1 : 0); confini.push({ i, parte: 'terapia' }); confini.sort((a, b) => a.i - b.i); k = confini.findIndex((c) => c.i === i); } }
    if (k < 0) return '';
    if (esclusa) fine = confini[k].i;
    else {
      fine = confini[k].i + pezzoDelConfine(t, confini, k).length;
      // la terapia ha il suo lettore: l'elenco finisce con la sua ultima riga
      if (parte === 'terapia') { const ultima = terapiaDellaLettera(testo).split('\n').pop()?.trim(); const j = ultima ? t.indexOf(ultima, confini[k].i) : -1; if (j >= 0) fine = j + ultima!.length; }
    }
  }
  return pulisci(t.slice(0, fine));
}
