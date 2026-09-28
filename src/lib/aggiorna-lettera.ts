// Aggiornamento della lettera vecchia (28.9.2026, richiesta dello studio per
// Marco Moccetti e Moschovitis). Il medico riprende spesso la lettera
// precedente del paziente: la porta alla data di oggi, ne tiene anamnesi e
// fattori di rischio, e sotto mette la visita di oggi, gli esami e la
// valutazione che ha dettato; poi la frase del controllo e la chiusura.
//
// Regole pure, niente AI (si provano in prove-aggiorna-lettera.test.ts con
// lettere inventate):
// - la lettera vecchia e il dettato si dividono nello stesso punto: dove
//   comincia la visita (esame clinico, ECG, eco, esami, valutazione);
// - la parte «anamnesi e rischi» del dettato si CONFRONTA con quella della
//   lettera vecchia («in grandi linee»): quanto si somigliano, e quali frasi
//   dettate la lettera vecchia non ha — segnalate, mai aggiunte da sole;
// - nella parte vecchia si aggiorna solo la data della visita («rivedo in
//   data …»), le altre date (eventi, esami passati) restano;
// - dalla parte nuova si tolgono le frasi del controllo, della disponibilità
//   e del saluto: le rimette la frase finale, con i mesi del dettato (12 se
//   non li dice) e «del paziente» / «della paziente».

import { dateInFrase, type DataCercata } from './cerca-in-cartella';

export type Divisione = { prima: string; dopo: string; punto: string | null };
export type Proposta = {
  testo: string;
  saluto: string;
  vecchia: string;
  nuova: string;
  finale: string;
  somiglianza: number;          // 0-1: quanto dell'anamnesi dettata c'è nella lettera vecchia
  novita: string[];             // frasi dettate che la lettera vecchia non ha
  mesi: number;
  mesi_dal_dettato: boolean;
  femminile: boolean;
  data_vecchia: string | null;  // la data della visita nella lettera vecchia, sostituita
  avvisi: string[];
};

// Dove comincia la visita di oggi. Prima i segnali forti (esame clinico);
// se non ci sono, quelli deboli (ECG, eco, esami, valutazione), ma solo dopo
// le etichette dell'anamnesi (FRCV, Comorbidità, Allergie): «ECG del 2019»
// raccontato nell'anamnesi non è la visita di oggi.
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const segnali = (l: string[]) => new RegExp(`(^|[.;:!?]\\s+|\\n\\s*)(${l.map(esc).join('|')})`, 'i');
const FORTI = segnali(['clinicamente', "all'esame obiettivo", 'all’esame obiettivo', 'esame obiettivo', 'obiettivamente', "all'esame clinico", 'all’esame clinico', 'parametri vitali']);
const DEBOLI = segnali(['elettrocardiogramma', "all'ecg", 'all’ecg', 'ecg', "all'ecocardiogramma", 'all’ecocardiogramma', 'ecocardiogramma', 'esami strumentali', 'esami', 'valutazione', 'procedere']);
const ETICHETTE_ANAMNESI = /\b(frcv|fattori di rischio(?: cardiovascolare)?|comorbidit[aà]|allergie(?: e intolleranze)?)\s*:/gi;
const RX_SALUTO = /^\s*((?:caro|cara|cari|gentile|egregio|egregia|stimato|stimata|lieber|liebe|sehr geehrte[rs]?)\b[^\n,]{0,80},)\s*/i;

export function togliSaluto(testo: string): { saluto: string; corpo: string } {
  const m = RX_SALUTO.exec(testo);
  return m ? { saluto: m[1].trim(), corpo: testo.slice(m[0].length).trim() } : { saluto: '', corpo: testo.trim() };
}

export function dividi(testo: string): Divisione {
  const t = String(testo || '');
  let da = 0;
  for (const e of t.matchAll(ETICHETTE_ANAMNESI)) da = Math.max(da, (e.index ?? 0) + e[0].length);
  const cerca = (rx: RegExp, dove: number) => { const m = rx.exec(t.slice(dove)); return m ? { i: dove + m.index + m[1].length, punto: m[2] } : null; };
  const forte = cerca(FORTI, da) ?? cerca(FORTI, 0);
  const trovato = forte ?? cerca(DEBOLI, da);
  if (!trovato) return { prima: t.trim(), dopo: '', punto: null };
  return { prima: t.slice(0, trovato.i).trim(), dopo: t.slice(trovato.i).trim(), punto: trovato.punto.trim().toLowerCase() };
}

const STOP = new Set(('alla dalla della delle degli dello nella nelle negli nello sulla sulle sugli sullo come anche ancora sempre però quindi dopo prima circa oltre senza sotto sopra verso contro fino mentre dove quando quale quali questo questa questi queste quello quella quelli quelle essere stato stata stati avere aveva hanno sono egli ella paziente signor signora collega caro cara data anni anno mesi mese giorni giorno ultimo ultima ultimi ultime nostro nostra nostri vostro vostra tuoi tuoi riferisce riferito presenta presente noto nota noti note').split(' '));

function parole(s: string): string[] {
  return (String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]{4,}|\d+(?:[.,]\d+)?/g) ?? [])
    .filter((w) => !STOP.has(w));
}
const radice = (w: string) => (/^\d/.test(w) ? w : w.slice(0, 6));

function frasi(s: string): string[] {
  return String(s || '').replace(/\b(dr|dott|prof|med|sig|ca|es)\./gi, '$1․')
    .split(/(?<=[.;!?])\s+|\n+/).map((x) => x.replace(/․/g, '.').trim()).filter((x) => x.length > 0);
}

// Quanto dell'anamnesi dettata c'è nella lettera vecchia, e quali frasi
// dettate non ci sono (meno della metà delle loro parole piene nella vecchia).
export function confronta(vecchia: string, dettata: string): { somiglianza: number; novita: string[] } {
  const inVecchia = new Set(parole(vecchia).map(radice));
  const tutte = parole(dettata).map(radice);
  const somiglianza = tutte.length ? tutte.filter((w) => inVecchia.has(w)).length / tutte.length : 1;
  const novita = frasi(dettata).filter((f) => {
    const p = parole(f).map(radice);
    if (p.length < 2) return false;
    return p.filter((w) => inVecchia.has(w)).length / p.length < 0.5;
  });
  return { somiglianza: Math.round(somiglianza * 100) / 100, novita };
}

const NUMERI: Record<string, number> = { uno: 1, un: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, diciotto: 18, ventiquattro: 24, trentasei: 36 };

// «non prima di 6 mesi», «tra sei mesi», «fra un anno», «a 12 mesi».
export function mesiDelControllo(testo: string): number | null {
  const t = String(testo || '').toLowerCase();
  const rxMesi = /(?:controllo|rivedere|rivalutazione|rivederl[oa]|visita)[^.]{0,80}?\b(\d{1,2}|uno|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|diciotto|ventiquattro|trentasei)\s+mesi\b/;
  const rxAnni = /(?:controllo|rivedere|rivalutazione|rivederl[oa]|visita)[^.]{0,80}?\b(un|uno|due|tre)\s+ann[oi]\b/;
  let m = rxMesi.exec(t);
  if (m) { const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMERI[m[1]]; if (n >= 1 && n <= 60) return n; }
  m = rxAnni.exec(t);
  if (m) return (NUMERI[m[1]] ?? 1) * 12;
  return null;
}

// Le frasi della parte nuova che la frase finale sostituisce: controllo,
// disponibilità, saluto, firma.
const RX_DA_TOGLIERE = /(prossimo controllo|un controllo|rimanendo a disposizione|rimango a disposizione|resto a disposizione|a disposizione tua|cordiali saluti|distinti saluti|un caro saluto|con i migliori saluti|^\s*marco\s*\.?$)/i;

export function frasePerIlControllo(mesi: number, femminile: boolean, giaInConclusione: boolean): string {
  const apertura = giaInConclusione ? 'Propongo' : 'In conclusione, alla luce degli elementi di cui sopra, propongo';
  return `${apertura} un prossimo controllo non prima di ${mesi} mesi rimanendo a disposizione Tua e ${femminile ? 'della paziente' : 'del paziente'} qualora la clinica richiedesse una rivalutazione anticipata.`;
}

const RX_DATA_VISITA = /\b((?:rivedo|rivediamo|ho rivisto|vedo|visito|ho visitato|ho rivalutato|rivaluto)\b[^.]{0,60}?\bin data\s+)(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i;

// `unParagrafo`: la lettera di Moccetti è un paragrafo solo; il rapporto a
// sezioni (Moschovitis) tiene i suoi a capo.
export function aggiorna(opts: { lettera: string; dettato: string; oggi: string; femminile: boolean; unParagrafo?: boolean }): Proposta | { errore: string } {
  const unParagrafo = opts.unParagrafo !== false;
  const avvisi: string[] = [];
  const v = togliSaluto(opts.lettera);
  // Le frasi di regia («lettera al dottor…», «riprendimi la lettera del…»)
  // non sono della lettera: fuori prima del confronto.
  const regia = (f: string) => RX_RICHIESTA.test(f) || /^lettera\s+(?:al|alla|allo|per)\b/i.test(f);
  const d = togliSaluto(String(opts.dettato || '').split(/\n/).map((riga) => frasi(riga).filter((f) => !regia(f)).join(' ')).join('\n'));
  const dv = dividi(v.corpo);
  const dd = dividi(d.corpo);
  if (!dv.punto) return { errore: 'Nella lettera vecchia non trovo dove comincia la visita (esame clinico, ECG, esami…): non so dove finiscono anamnesi e fattori di rischio.' };
  if (!dd.punto) return { errore: 'Nel dettato non trovo dove comincia la visita di oggi (esame clinico, ECG, esami…).' };
  if (dv.prima.length < 40) return { errore: 'La parte «anamnesi e fattori di rischio» della lettera vecchia è troppo corta per essere ripresa.' };

  let vecchia = dv.prima;
  let dataVecchia: string | null = null;
  const md = RX_DATA_VISITA.exec(vecchia);
  if (md) { dataVecchia = md[2]; vecchia = vecchia.replace(RX_DATA_VISITA, `$1${opts.oggi}`); }
  else avvisi.push('Nella lettera vecchia non c\'è «rivedo in data …»: controlla le date della parte ripresa.');

  const { somiglianza, novita } = confronta(dv.prima, dd.prima);
  if (somiglianza < 0.35) avvisi.push(`L'anamnesi dettata e quella della lettera vecchia si somigliano poco (${Math.round(somiglianza * 100)}%): controlla che la lettera vecchia sia del paziente giusto.`);

  const mesiDettato = mesiDelControllo(dd.dopo);
  const mesi = mesiDettato ?? 12;
  const nuova = dd.dopo.split(/\n/).map((riga) => frasi(riga).filter((f) => !RX_DA_TOGLIERE.test(f)).join(' '))
    .filter((r, i, tutte) => r.trim() || (i > 0 && tutte[i - 1].trim())).join('\n').trim();
  const giaInConclusione = /in conclusione,?\s+alla luce degli elementi di cui sopra/i.test(nuova);
  const finale = frasePerIlControllo(mesi, opts.femminile, giaInConclusione);
  const saluto = d.saluto || v.saluto;
  const corpo = unParagrafo
    ? [vecchia, nuova, finale].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    : [vecchia, nuova, finale].filter(Boolean).join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return {
    testo: saluto ? `${saluto}\n\n${corpo}` : corpo,
    saluto, vecchia, nuova, finale, somiglianza, novita, mesi, mesi_dal_dettato: mesiDettato != null,
    femminile: opts.femminile, data_vecchia: dataVecchia, avvisi,
  };
}

// Lo step parte solo se il medico lo chiede (28.9.2026, decisione dello
// studio): «riprendimi la lettera del 14 marzo», «aggiorna la lettera
// precedente», «riapri l'ultima lettera». Si cerca nella prima frase del
// dettato e nelle note per la segreteria (dove la catena sposta la regia).
// Con la data si sceglie quella lettera; senza, l'ultima.
// Il punto fra due cifre (14.03.2025) non chiude la frase.
const RX_RICHIESTA = /\b(?:riprend\w*|aggiorn\w*|riapr\w*|rifamm\w*|rifai|riusa\w*|ripart\w*\s+dalla)\b(?:[^.;\n]|(?<=\d)\.(?=\d)){0,40}?\blettera\b((?:[^.;\n]|(?<=\d)\.(?=\d)){0,60})/i;

export function richiestaAggiornamento(primaFrase: string, note: string[], dettatoIl: Date): { data: DataCercata | null } | null {
  for (const fonte of [String(primaFrase || ''), ...note.map((n) => String(n || ''))]) {
    const m = RX_RICHIESTA.exec(fonte);
    if (!m) continue;
    const date = dateInFrase(m[0], dettatoIl);
    return { data: date[0] ?? null };
  }
  return null;
}

// «della paziente»: dal sesso in cartella se c'è, se no dal testo.
export function eFemminile(sesso: string | null | undefined, testo: string): boolean {
  const s = String(sesso || '').trim().toLowerCase();
  if (s === 'f' || s === 'femmina' || s === 'donna') return true;
  if (s === 'm' || s === 'maschio' || s === 'uomo') return false;
  const t = String(testo || '').toLowerCase();
  const f = (t.match(/\b(la paziente|la signora|ella|della paziente|alla paziente|la stessa)\b/g) ?? []).length;
  const m = (t.match(/\b(il paziente|il signor|egli|del paziente|al paziente|lo stesso)\b/g) ?? []).length;
  return f > m;
}

// Una lettera che viene da una SCANSIONE (testo dell'OCR) arriva spezzata in
// righe corte, con intestazione, data e piè di pagina in mezzo (28.9.2026,
// prima lettera vera: 236 righe per 3181 caratteri, il saluto spezzato su
// più righe, telefono ed e-mail del piè di pagina dentro l'anamnesi). Qui:
// via le righe di intestazione e piè di pagina e quelle ripetute a ogni
// pagina, righe riunite (anche le parole spezzate col trattino), e tutto ciò
// che sta prima del saluto tagliato.
const RX_RIGA_CARTA = /(\btel\.?\b|\btelefono\b|\bfax\b|e-?mail|@|www\.|https?:|\bCH-\d{4}\b|\bpagina\s+\d+|\bpag\.\s*\d+|\b\d+\s*\/\s*\d+\s*$|^\s*\d{4}\s+[A-ZÀ-Ý][a-zà-ý]+\s*$|\bFMH\b|\bIBAN\b|\bGLN\b|\bZSR\b|\bRCC\b)/i;
const RX_SALUTO_DENTRO = /\b(?:caro|cara|cari|gentile|egregio|egregia|stimato|stimata|lieber|liebe|sehr geehrte[rs]?)\s+[^,.;:\n]{1,60},/i;

export function pulisciScansione(testo: string): string {
  const righe = String(testo || '').split(/\r?\n/).map((r) => r.replace(/\s+/g, ' ').trim());
  const conta = new Map<string, number>();
  for (const r of righe) if (r.length > 3) conta.set(r.toLowerCase(), (conta.get(r.toLowerCase()) ?? 0) + 1);
  const tenute = righe.filter((r) => !r || (!RX_RIGA_CARTA.test(r) && (conta.get(r.toLowerCase()) ?? 0) < 2));
  let unito = '';
  for (const r of tenute) {
    if (!r) { unito += '\n\n'; continue; }
    if (/\p{L}-$/u.test(unito) && /^\p{Ll}/u.test(r)) unito = unito.slice(0, -1) + r;
    else unito += (unito && !unito.endsWith('\n') ? ' ' : '') + r;
  }
  unito = unito.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  const s = RX_SALUTO_DENTRO.exec(unito.slice(0, 1200));
  return s ? unito.slice(s.index) : unito;
}
