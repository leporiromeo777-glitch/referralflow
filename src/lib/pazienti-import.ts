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

// Intestazioni riconosciute (minuscole, senza accenti) → campo.
const INTESTAZIONI: [RegExp, keyof Anagrafica][] = [
  [/^(cognome|nachname|surname|last ?name)$/, 'cognome'], [/^(nome|vorname|first ?name|nome proprio)$/, 'nome'],
  [/^(data di nascita|nascita|nato|nata|geburtsdatum|birth|dob)$/, 'data_nascita'], [/^(sesso|geschlecht|sex|genere)$/, 'sesso'],
  [/^(telefono|tel|phone|cellulare|natel)$/, 'telefono'], [/^(e-?mail|mail)$/, 'email'],
  [/^(via|indirizzo|strasse|street|address)$/, 'via'], [/^(npa|cap|plz|zip)$/, 'npa'], [/^(localita|citta|luogo|ort|city|comune)$/, 'localita'],
  [/^(avs|ahv|n\.? ?avs|numero avs)$/, 'avs'], [/^(cassa|cassa malati|assicurazione|krankenkasse|insurer)$/, 'assicurazione'],
  [/^(n\.? ?assicurato|numero assicurato|veka|versichertennummer|tessera)$/, 'n_assicurato'], [/^(indicazione|diagnosi|indicazione clinica)$/, 'indicazione'], [/^(percorso|percorso id)$/, 'percorso_id'],
];
function chiave(h: string): keyof Anagrafica | null {
  const k = h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[«»"']/g, '').trim();
  for (const [r, c] of INTESTAZIONI) if (r.test(k)) return c;
  return null;
}
function separatore(riga: string): string {
  const conta = (c: string) => riga.split(c).length;
  return [';', '\t', ','].sort((a, b) => conta(b) - conta(a))[0];
}
function celle(riga: string, sep: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < riga.length; i++) {
    const ch = riga[i];
    if (ch === '"') { if (inQ && riga[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export type RigaImport = { n: number; dati: Anagrafica; errori: Record<string, string> };
export function analizzaCsvPazienti(testo: string): { colonne: (keyof Anagrafica | null)[]; ignorate: string[]; righe: RigaImport[] } {
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim());
  if (!righe.length) return { colonne: [], ignorate: [], righe: [] };
  const sep = separatore(righe[0]);
  const testa = celle(righe[0], sep);
  const colonne = testa.map(chiave);
  const ignorate = testa.filter((_, i) => !colonne[i]);
  const out: RigaImport[] = [];
  righe.slice(1).forEach((r, i) => {
    const c = celle(r, sep);
    const grezzo: Record<string, string> = {};
    colonne.forEach((k, j) => { if (k && c[j] !== undefined) grezzo[k] = c[j]; });
    const { dati, errori } = validaAnagrafica(grezzo);
    out.push({ n: i + 2, dati, errori });
  });
  return { colonne, ignorate, righe: out };
}
