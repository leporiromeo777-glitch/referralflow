// Dividi cartella: che cosa È una pagina, dal suo contenuto (13.10.2026, [[Piattaforma/Dividi cartella]]). PURO.
//
// I fogli separatori dicono in che sezione sta un documento nella cartella di carta; ma lo studio vuole che alcune
// cose vadano al loro posto qualunque sia la sezione in cui sono finite:
//  - il LABORATORIO è ogni documento fatto di analisi e valori misurati (tabelle di valori con unità e riferimenti);
//  - fra i DOCUMENTI AMMINISTRATIVI vanno anche procure, dispense, deleghe, garanzie di pagamento…;
//  - i PIANI DI MEDICAZIONE vanno sotto RICETTE;
//  - le pagine SCRITTE A MANO (appunti a penna, moduli compilati o contrassegnati a penna — non una firma o due
//    parole) sono tutte APPUNTI. Questo dal testo non si vede: lo dice il modello guardando la pagina (analisi.ts).
// Qui le regole sul testo, e quali pagine vale la pena far guardare.
import { dataIn } from './tagli';

export type Genere = 'laboratorio' | 'amministrativo' | 'ricetta';
// La sezione (il numero in SEZIONI) dove va un documento di quel genere.
export const SEZIONE_DEL_GENERE: Record<Genere, number> = { laboratorio: 9, amministrativo: 11, ricetta: 12 };
export const SEZIONE_APPUNTI = 3;

const lettere = (t: string) => String(t ?? '').replace(/[^A-Za-zÀ-ÿ]/g, '').length;

// Unità che si vedono solo in un referto di laboratorio (non mm, cm/s, mmHg, bpm, W: quelle sono di un'eco o di una
// prova da sforzo; non «%» da solo, che è ovunque).
const RX_UNITA = /(?:mmol|[µμu]mol|nmol|pmol)\s?\/\s?l\b|\b(?:mg|g|[µμu]g|ng|pg)\s?\/\s?(?:dl|l|ml)\b|\b(?:m?U|UI|IU|mUI|mIU|kU)\s?\/\s?(?:l|ml)\b|\b[GT]\s?\/\s?l\b|\b10\s?(?:\^|E|e|x)?\s?\d{1,2}\s?\/\s?[lL]\b|\bmosm(?:ol)?\s?\/\s?kg\b|\bml\s?\/\s?min\s?\/\s?1[.,]73/gi;
const ANALISI = ['emoglobina', 'ematocrito', 'eritrociti', 'leucociti', 'trombociti', 'piastrine', 'neutrofili', 'linfociti', 'monociti', 'eosinofili', 'basofili', 'mcv', 'mch', 'mchc', 'creatinina', 'urea', 'egfr', 'gfr', 'sodio', 'potassio', 'calcio', 'magnesio', 'fosfato', 'cloruro',
  'glucosio', 'glicemia', 'hba1c', 'colesterolo', 'ldl', 'hdl', 'trigliceridi', 'lipoproteina', 'tsh', 'ft4', 'ft3', 'crp', 'pcr', 'ferritina', 'transferrina', 'ferro', 'bilirubina', 'asat', 'alat', 'got', 'gpt', 'ggt', 'gamma-gt', 'fosfatasi', 'ldh', 'ck', 'troponina', 'bnp', 'nt-probnp', 'probnp',
  'albumina', 'proteine', 'acido urico', 'urato', 'inr', 'quick', 'aptt', 'fibrinogeno', 'd-dimero', 'vitamina', 'folati', 'psa', 'amilasi', 'lipasi', 'hämoglobin', 'kreatinin', 'kalium', 'natrium', 'leukozyten', 'thrombozyten', 'cholesterin', 'triglyceride'];
const RX_ANALISI = new RegExp(`(?<![A-Za-zÀ-ÿ])(?:${ANALISI.map((x) => x.replace(/[-]/g, '[- ]?')).join('|')})(?![A-Za-zÀ-ÿ])`, 'gi');
const RX_SALUTO = /^\s*(?:car[oaie]|egregi[oa]|gentil[ei]|stimat[oa]|sehr geehrte|lieber?)\b[^\n]{0,60},/im;

// Quanto una pagina è una TABELLA DI VALORI: quante unità di laboratorio e quante analisi diverse nomina.
export function valoriDiLaboratorio(testo: string): { unita: number; analisi: number } {
  const t = String(testo ?? '');
  return { unita: (t.match(RX_UNITA) ?? []).length, analisi: new Set((t.match(RX_ANALISI) ?? []).map((x) => x.toLowerCase().replace(/[- ]/g, ''))).size };
}
// Una lettera che RIPORTA qualche valore non è un laboratorio: ha un saluto, o è fatta di righe lunghe di racconto.
function eRacconto(testo: string): boolean {
  const t = String(testo ?? '');
  return RX_SALUTO.test(t.slice(0, 1500)) || t.split('\n').filter((r) => r.trim().length > 95).length >= 6;
}
// Le parole che, in un titolo in cima alla pagina, dicono che cos'è il documento.
const RX_AMMINISTRATIVO = /(?<![A-Za-zÀ-ÿ])(?:procura|delega|dispensa|esonero|liberatoria|svincolo dal segreto|consenso informato|dichiarazione di consenso|garanzia di (?:pagamento|assunzione)|assunzione dei costi|richiesta di garanzia|cassa malati|certificato di (?:incapacit[aà]|inabilit[aà])|incapacit[aà] (?:lavorativa|al lavoro)|modulo d['’ ]?annuncio|notifica d['’ ]?infortunio|tessera d['’ ]?assicurat[oa]|vollmacht|entbindung|kostengutsprache|arbeitsunf[aä]higkeit)(?![A-Za-zÀ-ÿ])/i;
const RX_RICETTA = /(?<![A-Za-zÀ-ÿ])(?:piano di medicazione|piano (?:dei |di )?(?:medicamenti|farmaci)|piano (?:farmacologico|terapeutico)|lista (?:dei |di )?(?:medicamenti|farmaci)|scheda (?:di |della )?terapia|e-?mediplan|medikationsplan|medikamentenplan|ricetta(?: medica| ripetibile| permanente)?|dauerrezept|rezept|prescrizione medica)(?![A-Za-zÀ-ÿ])/i;
function inCima(testo: string, rx: RegExp): boolean {
  const righe = String(testo ?? '').split('\n').map((r) => r.trim()).filter(Boolean).slice(0, 12);
  return righe.some((r) => r.length <= 80 && rx.test(r));
}
// Il genere di una pagina dal suo testo; null se non è nessuno dei tre.
export function genereDaTesto(testo: string): Genere | null {
  const t = String(testo ?? '');
  if (lettere(t) < 40) return null;
  if (inCima(t, RX_RICETTA) && !RX_SALUTO.test(t.slice(0, 1500))) return 'ricetta';
  if (inCima(t, RX_AMMINISTRATIVO) && !RX_SALUTO.test(t.slice(0, 1500))) return 'amministrativo';
  const v = valoriDiLaboratorio(t);
  if (!eRacconto(t) && ((v.unita >= 8 && v.analisi >= 3) || v.analisi >= 7 || v.unita >= 14)) return 'laboratorio';
  return null;
}
// Il genere di un DOCUMENTO dalle sue pagine: ricetta e amministrativo li dice il titolo della prima pagina scritta;
// laboratorio lo è se lo è la prima, o più di metà delle sue pagine scritte.
export function genereDelDocumento(pagine: string[]): Genere | null {
  const scritte = pagine.filter((t) => lettere(t) >= 40);
  if (!scritte.length) return null;
  const primo = genereDaTesto(scritte[0]);
  if (primo) return primo;
  return scritte.filter((t) => genereDaTesto(t) === 'laboratorio').length * 2 > scritte.length ? 'laboratorio' : null;
}

// Vale la pena far GUARDARE la pagina al modello (8-9 secondi l'una)? No se è bianca, e no se è fitta di testo
// stampato pulito — una lettera, un referto: lì di mano c'è al più la firma. Sì per tutto il resto: poco testo, testo
// sporco (l'OCR che inciampa nella penna), moduli.
export function parolePulite(testo: string): number {
  const p = String(testo ?? '').split(/\s+/).filter(Boolean);
  return p.length ? p.filter((w) => /^[A-Za-zÀ-ÿ'’.,;:()-]{3,}$/.test(w) && /[aeiouàèéìòùäöü]/i.test(w)).length / p.length : 0;
}
export function daGuardare(testo: string, inchiostro: number | null | undefined): boolean {
  const n = lettere(testo);
  if (n < 40) return inchiostro == null ? false : inchiostro >= 0.5;      // senza testo: solo se la pagina non è bianca
  return !(n >= 800 && parolePulite(testo) >= 0.55);
}
// Una data letta guardando la pagina (magari scritta a penna) non si può ritrovare nel testo: si accetta se è una
// data possibile — un giorno vero, non nel futuro, non prima del 1990.
export function dataPossibile(scritta: string | null | undefined, oggi = new Date()): string | null {
  const d = scritta ? dataIn(scritta) : null;
  if (!d) return null;
  const quando = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(quando.getTime()) && quando.toISOString().slice(0, 10) === d && d >= '1990-01-01' && quando.getTime() <= oggi.getTime() + 86_400_000 ? d : null;
}
