// Di chi è una cartella trascinata in «Dividi cartella» prima di scegliere il paziente (15.10.2026, richiesta dello
// studio: «i file che carico hanno spesso già Cognome Nome e data di nascita, in quest'ordine; riconoscili: se il
// paziente c'è usa la sua cartella, se non c'è creala, se è incerto chiedi a me»). PURO.
//
// Attaccare la cartella alla persona sbagliata è il danno peggiore che questa pagina possa fare. Per questo si decide
// da soli solo nei casi netti:
// - USA una cartella che c'è già solo se nome (le stesse parole, in qualunque ordine) e data di nascita combaciano con
//   UNA persona sola;
// - CREA una cartella nuova solo dal nome del file scritto pulito — due parole e una data di nascita valida, di un
//   adulto — e se nessuno in anagrafica gli somiglia (stesso nome con un'altra data, stessa data con un nome quasi uguale);
// - in tutti gli altri casi CHIEDE, dicendo perché, coi campi già riempiti.
// Se il nome del file e il testo del PDF dicono due persone diverse, chiede.
import { proponiAnagrafica } from '../pazienti-abbina-regole';

export type DalFile = { cognome: string; nome: string; nascita: string; certo: boolean; perche?: string };
export type Decisione = {
  cosa: 'usa' | 'crea' | 'chiedi';
  id: string | null;
  motivo: string | null;
  fonte: 'file' | 'testo' | null;
  proposta: { cognome: string; nome: string; nascita: string | null } | null;
  simile?: string;      // chi c'è già e gli somiglia: la pagina offre di usare la sua cartella
};
type Paziente = { id: string; cognome: string; nome: string; data_nascita: string | null };

const PAROLA = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*$/;
const piana = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Le parole di un nome, senza accenti e in ordine alfabetico: «Rossi Anna» e «Anna Rossi» sono la stessa persona.
export function paroleDelNome(s: string): string[] {
  return piana(s).split(/[^a-z]+/).filter((w) => w.length > 0).sort();
}
const bello = (s: string) => s.split(/([\s'’-])/).map((x) => (/^[\s'’-]$/.test(x) ? x : x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())).join('');
const iso = (a: number, m: number, g: number) => `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
function dataVera(a: number, m: number, g: number): boolean {
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}
function anni(nascita: string, oggi: Date): number {
  const [a, m, g] = nascita.split('-').map(Number);
  let n = oggi.getUTCFullYear() - a;
  if (oggi.getUTCMonth() + 1 < m || (oggi.getUTCMonth() + 1 === m && oggi.getUTCDate() < g)) n--;
  return n;
}

// «Rossi Anna 03.04.1950.pdf», «Rossi_Anna_03-04-1950 cartella.pdf», «Rossi Anna 1950-04-03.pdf», «Rossi Anna 03041950.pdf».
// Prima della data solo il nome (da due a quattro parole); dopo, qualunque cosa. Null se non è scritto così.
export function chiDalNomeFile(filename: string, oggi = new Date()): DalFile | null {
  const t = String(filename ?? '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ').trim();
  const m = /(?:^|[\s,;-])(?:(\d{1,2})[.-](\d{1,2})[.-](\d{4}|\d{2})|(\d{4})-(\d{2})-(\d{2})|(\d{2})(\d{2})(\d{4}))(?!\d)/.exec(t);
  if (!m) return null;
  let a: number, me: number, g: number, anno2 = false;
  if (m[1]) { g = +m[1]; me = +m[2]; a = +m[3]; if (m[3].length === 2) { anno2 = true; const yy = oggi.getUTCFullYear() % 100; a += a > yy ? 1900 : 2000; } }
  else if (m[4]) { a = +m[4]; me = +m[5]; g = +m[6]; }
  else { g = +m[7]; me = +m[8]; a = +m[9]; }
  if (!dataVera(a, me, g)) return null;
  const parole = t.slice(0, m.index).replace(/[\s,;-]+$/, '').split(/[\s,;]+/).filter(Boolean);
  if (parole.length < 2 || parole.length > 4 || !parole.every((w) => PAROLA.test(w))) return null;
  const nascita = iso(a, me, g), eta = anni(nascita, oggi);
  if (a < 1900 || eta < 0) return null;
  // Il cognome: le parole in MAIUSCOLO in testa, se ci sono («DE LUCA Anna»); se no la prima.
  let k = 0;
  while (k < parole.length && parole[k].length > 1 && parole[k] === parole[k].toUpperCase()) k++;
  if (k === 0 || k === parole.length) k = 1;
  const perche = anno2 ? 'l’anno di nascita è scritto con due cifre'
    : eta < 18 ? 'la data nel nome del file darebbe meno di 18 anni: forse non è la data di nascita'
    : parole.length > 2 && !(k > 1) ? 'nel nome del file ci sono più di due nomi: non so dove finisce il cognome'
    : undefined;
  return { cognome: bello(parole.slice(0, k).join(' ')), nome: bello(parole.slice(k).join(' ')), nascita, certo: !perche, perche };
}

function distanza(a: string, b: string): number {
  const r: number[] = []; for (let j = 0; j <= b.length; j++) r[j] = j;
  for (let i = 1; i <= a.length; i++) { let su = r[0]; r[0] = i; for (let j = 1; j <= b.length; j++) { const t = r[j]; r[j] = Math.min(r[j] + 1, r[j - 1] + 1, su + (a[i - 1] === b[j - 1] ? 0 : 1)); su = t; } }
  return r[b.length];
}
const nascitaDi = (p: Paziente) => (p.data_nascita ?? '').slice(0, 10);
const nomeDi = (p: Paziente) => `${p.cognome} ${p.nome}`.trim();

// `testo`: ciò che leggiPaziente ha trovato nelle prime pagine (nome intero, data di nascita se c'è).
export function decidiChi(file: DalFile | null, testo: { nome: string; nascita: string | null } | null, pazienti: Paziente[]): Decisione {
  const daTesto = testo ? (() => { const an = proponiAnagrafica(testo.nome); return { cognome: an.cognome, nome: an.nome, nascita: testo.nascita }; })() : null;
  if (file && testo) {
    const stessoNome = paroleDelNome(testo.nome).join(' ') === paroleDelNome(`${file.cognome} ${file.nome}`).join(' ');
    if (!stessoNome || (testo.nascita && testo.nascita !== file.nascita)) {
      return { cosa: 'chiedi', id: null, fonte: 'file', proposta: file, motivo: `Il nome del file dice ${file.cognome} ${file.nome}, ${giorno(file.nascita)}; nel PDF c’è scritto ${testo.nome}${testo.nascita ? `, ${giorno(testo.nascita)}` : ''}. Controlla di chi è.` };
    }
  }
  const fonte: 'file' | 'testo' | null = file ? 'file' : daTesto ? 'testo' : null;
  const proposta = file ? { cognome: file.cognome, nome: file.nome, nascita: file.nascita } : daTesto;
  if (!proposta) return { cosa: 'chiedi', id: null, fonte: null, proposta: null, motivo: null };
  if (!proposta.nascita) return { cosa: 'chiedi', id: null, fonte, proposta, motivo: 'Manca la data di nascita: scrivila tu.' };
  const chiave = paroleDelNome(`${proposta.cognome} ${proposta.nome}`).join(' ');
  const stessi = pazienti.filter((p) => paroleDelNome(nomeDi(p)).join(' ') === chiave);
  const uguali = stessi.filter((p) => nascitaDi(p) === proposta.nascita);
  if (uguali.length === 1) return { cosa: 'usa', id: uguali[0].id, fonte, proposta, motivo: null };
  if (uguali.length > 1) return { cosa: 'chiedi', id: null, fonte, proposta, motivo: `In ReferralFlow ci sono ${uguali.length} cartelle con questo nome e questa data di nascita: scegli quella giusta.` };
  // Nessuno uguale: qualcuno che gli somiglia vuol dire un errore di battitura o un doppione — chiede.
  const omonimo = stessi[0];
  if (omonimo) return { cosa: 'chiedi', id: null, fonte, proposta, simile: omonimo.id, motivo: nascitaDi(omonimo) ? `C’è già ${nomeDi(omonimo)} nato/a il ${giorno(nascitaDi(omonimo))}: è la stessa persona con la data scritta diversa?` : `C’è già ${nomeDi(omonimo)}, senza data di nascita: è la stessa persona?` };
  const simile = pazienti.find((p) => nascitaDi(p) === proposta.nascita && distanza(paroleDelNome(nomeDi(p)).join(' '), chiave) <= 3);
  if (simile) return { cosa: 'chiedi', id: null, fonte, proposta, simile: simile.id, motivo: `C’è già ${nomeDi(simile)}, con la stessa data di nascita: è la stessa persona scritta diversa?` };
  if (file && file.certo) return { cosa: 'crea', id: null, fonte, proposta, motivo: null };
  return { cosa: 'chiedi', id: null, fonte, proposta, motivo: file?.perche ? `Non è ancora in ReferralFlow, e ${file.perche}: controlla i dati.` : null };
}

function giorno(iso: string): string { const [a, m, g] = String(iso).split('-'); return g && m && a ? `${g}.${m}.${a}` : iso; }
