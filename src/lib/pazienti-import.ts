// Anagrafica del paziente (14.9.2026): validazione pura dei campi e lettura di
// un CSV di pazienti (intestazioni riconosciute per nome, separatore ; , o
// tabulazione, date 31.12.1950 o 1950-12-31). Nessuna query: il codice qui è
// testabile a secco; l'endpoint decide chi esiste già.
export type Anagrafica = {
  cognome: string; nome: string; data_nascita: string | null; sesso: string; telefono: string; email: string;
  via: string; npa: string; localita: string; avs: string; assicurazione: string; n_assicurato: string; indicazione: string; percorso_id: string;
};
export const CAMPI_ANAGRAFICA: (keyof Anagrafica)[] = ['cognome', 'nome', 'data_nascita', 'sesso', 'telefono', 'email', 'via', 'npa', 'localita', 'avs', 'assicurazione', 'n_assicurato', 'indicazione', 'percorso_id'];

const s = (v: unknown, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// «31.12.1950», «31/12/1950», «1950-12-31» → «1950-12-31»; altrimenti null.
export function normalizzaData(v: unknown): string | null {
  const t = s(v, 20);
  if (!t) return null;
  // Il 31 febbraio non esiste. Senza questo controllo «31.02.1950» passava
  // come data valida e l'insert su una colonna `date` faceva saltare l'import
  // a metà file, senza dire quale riga.
  const vera = (a: number, me: number, g: number) => {
    const d = new Date(Date.UTC(a, me - 1, g));
    return d.getUTCFullYear() === a && d.getUTCMonth() === me - 1 && d.getUTCDate() === g
      ? `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}` : null;
  };
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m) return vera(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return vera(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}
// AVS svizzero: 13 cifre che iniziano con 756, scritto 756.1234.5678.97.
export function normalizzaAvs(v: unknown): string {
  const cifre = s(v, 40).replace(/\D/g, '');
  if (cifre.length === 13 && cifre.startsWith('756')) return `${cifre.slice(0, 3)}.${cifre.slice(3, 7)}.${cifre.slice(7, 11)}.${cifre.slice(11)}`;
  return s(v, 20);
}

export function validaAnagrafica(c: Record<string, unknown>): { dati: Anagrafica; errori: Record<string, string> } {
  const errori: Record<string, string> = {};
  const dataNascita = normalizzaData(c.data_nascita);
  if (s(c.data_nascita) && !dataNascita) errori.data_nascita = 'Data non riconosciuta (31.12.1950).';
  const sesso = s(c.sesso, 1).toUpperCase();
  if (sesso && !['F', 'M'].includes(sesso)) errori.sesso = 'F o M.';
  const email = s(c.email, 160).toLowerCase();
  if (email && !email.includes('@')) errori.email = 'E-mail non valida.';
  const npa = s(c.npa, 10);
  if (npa && !/^\d{4}$/.test(npa)) errori.npa = 'NPA a 4 cifre.';
  const avs = normalizzaAvs(c.avs);
  if (avs && !/^756\.\d{4}\.\d{4}\.\d{2}$/.test(avs)) errori.avs = 'AVS nella forma 756.1234.5678.97.';
  const dati: Anagrafica = {
    cognome: s(c.cognome), nome: s(c.nome), data_nascita: dataNascita, sesso, telefono: s(c.telefono, 40), email,
    via: s(c.via, 160), npa, localita: s(c.localita, 80), avs, assicurazione: s(c.assicurazione, 80), n_assicurato: s(c.n_assicurato, 40),
    indicazione: s(c.indicazione, 120), percorso_id: s(c.percorso_id, 80),
  };
  if (!dati.cognome) errori.cognome = 'Obbligatorio.';
  if (!dati.nome) errori.nome = 'Obbligatorio.';
  return { dati, errori };
}

// Intestazioni riconosciute (minuscole, senza accenti né punti; «n°» → «n») → campo. Dal 22.10.2026 anche quelle
// dell'esportazione dei pazienti di MediOnline (dallo studio: la lista non si importava): «Data nasc.», «M/F»,
// «N° AVS», «N° tel. 1/2/3», «Assicurazione LAMal», «N° assicurato LAMal». Le altre assicurazioni (LAInf, LCA, LAM,
// LAI) e le colonne di gestione restano fuori, e l'anteprima le elenca.
const INTESTAZIONI: [RegExp, keyof Anagrafica][] = [
  [/^(cognome|nachname|surname|last ?name)$/, 'cognome'], [/^(nome|vorname|first ?name|nome proprio)$/, 'nome'],
  [/^(data di nascita|data nascita|data nasc|nascita|nato|nata|nato il|nata il|geburtsdatum|geb datum|birth|dob|date of birth)$/, 'data_nascita'],
  [/^(sesso|geschlecht|sex|genere|m ?\/ ?f|f ?\/ ?m)$/, 'sesso'],
  [/^(telefono|tel|phone|cellulare|natel|n tel ?[1-3]?|numero di telefono|telefono [1-3])$/, 'telefono'], [/^(e-?mail|mail)$/, 'email'],
  [/^(via|indirizzo|strasse|street|address)$/, 'via'], [/^(npa|cap|plz|zip)$/, 'npa'], [/^(localita|citta|luogo|ort|city|comune)$/, 'localita'],
  [/^(avs|ahv|n ?avs|numero avs|n ahv)$/, 'avs'], [/^(cassa|cassa malati|assicurazione|assicurazione lamal|krankenkasse|insurer)$/, 'assicurazione'],
  [/^(n ?assicurato|numero assicurato|n assicurato lamal|veka|versichertennummer|tessera)$/, 'n_assicurato'], [/^(indicazione|diagnosi|indicazione clinica)$/, 'indicazione'], [/^(percorso|percorso id)$/, 'percorso_id'],
];
function chiave(h: string): keyof Anagrafica | null {
  const k = h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»"']/g, '')
    .replace(/\bn\s*[°º�]\s*/g, 'n ').replace(/\bno\.\s*/g, 'n ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  for (const [r, c] of INTESTAZIONI) if (r.test(k)) return c;
  return null;
}
function separatore(riga: string): string {
  const conta = (c: string) => riga.split(c).length;
  return [';', '\t', ','].sort((a, b) => conta(b) - conta(a))[0];
}
// Le righe del file con le loro celle. Un a capo DENTRO le virgolette (una nota su più righe) resta nella cella: prima
// spezzava il paziente in due righe sbagliate.
function tabella(testo: string, sep: string): string[][] {
  const out: string[][] = []; let riga: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (ch === '"') { if (inQ && testo[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === sep && !inQ) { riga.push(cur.trim()); cur = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQ) { if (ch === '\r' && testo[i + 1] === '\n') i++; riga.push(cur.trim()); cur = ''; if (riga.some((x) => x)) out.push(riga); riga = []; }
    else cur += ch;
  }
  riga.push(cur.trim()); if (riga.some((x) => x)) out.push(riga);
  return out;
}

export type RigaImport = { n: number; dati: Anagrafica; errori: Record<string, string>; avvisi?: Record<string, string>; numero?: string };
// Nell'importazione solo cognome e nome bloccano la riga: un campo secondario scritto male (un NPA straniero, un'e-mail
// senza @, un AVS incompleto, una data illeggibile) si lascia vuoto e si dice, e il paziente entra lo stesso.
const BLOCCANO = new Set(['cognome', 'nome']);
// Il numero del paziente di MediOnline (22.10.2026): non fa parte dell'anagrafica che si modifica, si tiene a parte.
const RX_NUMERO = /^(n|nr|numero|n paziente|numero paziente|nr paziente|n pz|id|id paziente|pid|n cartella|numero cartella)$/;
const normaTesta = (h: string) => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[«»"']/g, '')
  .replace(/\bn\s*[°º\ufffd]\s*/g, 'n ').replace(/\bno\.\s*/g, 'n ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

export function analizzaCsvPazienti(testo: string): { colonne: (keyof Anagrafica | null)[]; ignorate: string[]; righe: RigaImport[] } {
  const t = testo.replace(/^﻿/, '');
  const prima = t.split(/\r?\n/, 1)[0] ?? '';
  if (!prima.trim()) return { colonne: [], ignorate: [], righe: [] };
  const sep = separatore(prima);
  const tutte = tabella(t, sep);
  if (!tutte.length) return { colonne: [], ignorate: [], righe: [] };
  const testa = tutte[0];
  const colonne = testa.map(chiave);
  const colNumero = testa.findIndex((h, i) => !colonne[i] && RX_NUMERO.test(normaTesta(h)));
  const ignorate = testa.filter((_, i) => !colonne[i] && i !== colNumero);
  const out: RigaImport[] = [];
  tutte.slice(1).forEach((c, i) => {
    const grezzo: Record<string, string> = {};
    // più colonne per lo stesso campo (i tre numeri di telefono): vale la prima piena
    colonne.forEach((k, j) => { if (k && c[j] !== undefined && c[j] !== '' && !grezzo[k]) grezzo[k] = c[j]; });
    const { dati, errori } = validaAnagrafica(grezzo);
    const bloccano: Record<string, string> = {}, avvisi: Record<string, string> = {};
    for (const [k, v] of Object.entries(errori)) {
      if (BLOCCANO.has(k)) bloccano[k] = v;
      else { avvisi[k] = v; (dati as Record<string, unknown>)[k] = k === 'data_nascita' ? null : ''; }
    }
    const numero = colNumero >= 0 ? (String(c[colNumero] ?? '').match(/^\s*0*(\d{1,10})\s*$/)?.[1] ?? '') : '';
    out.push({ n: i + 2, dati, errori: bloccano, ...(Object.keys(avvisi).length ? { avvisi } : {}), ...(numero ? { numero } : {}) });
  });
  return { colonne, ignorate, righe: out };
}
