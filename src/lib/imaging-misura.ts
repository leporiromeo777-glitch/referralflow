import 'server-only';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

// Il Measurement Safety Engine, lato server (19.9.2026).
//
// Geometria e algoritmi vivono nei file public/prototipo/mse/*.js: li esegue
// il browser mentre si trascina e li riesegue il server prima di salvare,
// così il numero in tabella è sempre quello del codice provato — non quello
// che un browser qualsiasi ha mandato. Caricarli con `vm` invece di
// importarli è voluto: sono JavaScript semplice senza `export`, perché nel
// prototipo si caricano con <script>, e devono restare uno.

export type Punto = { x: number; y: number };
export type RegioneUs = { x0: number; y0: number; x1: number; y1: number; dx_mm: number; dy_mm: number; tipo_dati?: number };
export type Calibrazione = {
  tipo: 'us_regioni' | 'pixel_spacing' | 'imager_pixel_spacing' | 'nessuna';
  righe: number; colonne: number;
  regioni: RegioneUs[];
  spacing: { dx_mm: number; dy_mm: number; origine: string; taratura: string } | null;
};
export type EsitoMisura = { stato: 'ok'; mm: number; dx_mm: number; dy_mm: number; punti_fisici: Punto[] } | { stato: 'non_calibrata' | 'rivelatore' | 'fuori_regione' | 'regioni_diverse' | 'fuori_immagine' | 'punti_uguali' | 'punti_non_validi' | 'calcolo_non_finito'; mm?: undefined };

// La geometria completa letta dal file (imaging/geometria.py, versione 1).
export type RegioneUsCompleta = {
  indice: number; x0: number; y0: number; x1: number; y1: number; formato: string; tipo_dati: string;
  unita_x: string; unita_y: string; delta_x: number | null; delta_y: number | null;
  rif_x0: number | null; rif_y0: number | null; rif_fisico_x: number | null; rif_fisico_y: number | null;
  flags: { priorita_alta: boolean; scala_protetta: boolean; doppler_frequenza: boolean; scorrimento: number } | null;
};
export type Geometria = {
  versione: number;
  identita: { sop_class: string; sop_uid: string; serie_uid: string; studio_uid: string; modalita: string; frame_totali: number };
  pixel: { righe: number; colonne: number; aspect: [number, number] | null; rescale: { slope: number; intercept: number; tipo: string } | null; fotometria: string; bit: number | null; campioni: number | null };
  spaziatura: { fonte: string | null; dy_mm: number | null; dx_mm: number | null; per_frame: boolean; calibrazione_tipo: string | null; calibrazione_descrizione: string; imager_dy_mm: number | null; imager_dx_mm: number | null };
  regioni_us: RegioneUsCompleta[];
  spazio: { iop: number[] | null; ipp: number[] | null; frame_of_reference: string | null; spessore_mm: number | null; distanza_slice_dichiarata_mm: number | null } | null;
  derivata: boolean; image_type: string[]; avvisi_lettura: string[]; sha256_file: string | null;
};

type Api = {
  VERSIONE: string;
  distanzaMm: (cal: Calibrazione | null, p1: Punto, p2: Punto) => EsitoMisura;
  formattaMm: (mm: number) => string;
  descriviCalibrazione: (cal: Calibrazione | null) => string;
  motivo: (stato: string) => string;
};
export type EsitoGate = {
  stato: 'VALIDATED' | 'CAUTION' | 'NOT_MEASURABLE'; motivi: string[]; avvisi: string[]; testi: string[]; ok: boolean;
  valore: number | null; unita: string | null; valore_mostrato: string | null; punti_fisici: Punto[] | null; extra: Record<string, number> | null;
  dx_mm: number | null; dy_mm: number | null; regione: number | null;
  algoritmo: string | null; versione_algoritmo: string | null; versione_gate: string;
};
type ContestoGate = { cal: Calibrazione | null; geometria?: Geometria | null; frame?: number; frameTotali?: number; punti?: Punto[]; algoritmo?: string; cautionValidati?: string[]; modalita?: string | null };
type Mse = {
  geometria: { VERSIONE: string; versoImmagine: (p: Punto, M: number[][]) => Punto | null; matriceViewer: (v: Record<string, number>) => number[][]; mmPerPixel: (cal: Calibrazione | null, p: Punto) => { stato: string; sx?: number; sy?: number } };
  misure: { VERSIONE: string; ALGORITMI: Record<string, { nome: string; versione: string; unita: string; equazione: string; punti: [number, number]; gesto: string; calcola: (cal: Calibrazione | null, punti: Punto[]) => EsitoMisura }>; formattaMm: (mm: number) => string; formattaValore: (v: number | null, unita: string, extra?: unknown) => string; motivo: (stato: string) => string };
  validazione: { VERSIONE: string; statoImmagine: (ctx: ContestoGate) => Pick<EsitoGate, 'stato' | 'motivi' | 'avvisi' | 'testi'>; valuta: (ctx: ContestoGate) => EsitoGate; testo: (codice: string) => string };
};

// I moduli, nell'ordine in cui il browser li carica (index.html).
export const MODULI_MSE = ['mse/geometria.js', 'mse/misure.js', 'mse/validazione.js'];

// I casi CAUTION in cui si può misurare: li decide il piano di V&V, non il
// codice (imaging/caution-validati.json). Lista vuota = ogni avviso blocca.
let caution: string[] | null = null;
export function cautionValidati(): string[] {
  if (caution) return caution;
  try {
    const j = JSON.parse(readFileSync(path.join(process.cwd(), 'imaging', 'caution-validati.json'), 'utf-8'));
    caution = Array.isArray(j?.validati) ? j.validati.filter((x: unknown) => typeof x === 'string') : [];
  } catch { caution = []; }
  return caution ?? [];
}

// La versione del software che ha prodotto la misura: l'hash del commit
// compilato (mac/aggiorna-server.sh scrive .build-stamp); «sviluppo» altrove.
let versione: string | null = null;
export function versioneSoftware(): string {
  if (versione) return versione;
  try { versione = readFileSync(path.join(process.cwd(), '.build-stamp'), 'utf-8').trim().slice(0, 12) || 'sviluppo'; }
  catch { versione = 'sviluppo'; }
  return versione;
}

// Doppio controllo: la distanza ricalcolata da un'implementazione separata
// (imaging/verifica-indipendente.py, numpy). Torna il valore B e lo stato.
const PY = process.env.IMAGING_PYTHON ?? path.join(os.homedir(), '.referralflow-imaging', 'bin', 'python');
export function verificaIndipendente(cal: Calibrazione | null, punti: Punto[], algoritmo = 'distanza'): Promise<{ stato: string; mm?: number; y_mm?: number }> {
  return new Promise((risolvi) => {
    const figlio = execFile(PY, [path.join(process.cwd(), 'imaging', 'verifica-indipendente.py')], { timeout: 15_000 },
      (errore, stdout) => {
        try {
          const j = JSON.parse(String(stdout || '{}'));
          risolvi(j && typeof j.stato === 'string' ? j : { stato: 'verificatore_non_disponibile' });
        } catch { risolvi({ stato: errore ? 'verificatore_non_disponibile' : 'uscita_illeggibile' }); }
      });
    figlio.stdin?.end(JSON.stringify({ calibrazione: cal, punti, algoritmo }));
  });
}
// Tolleranza tecnica del doppio controllo: un miliardesimo relativo (o
// assoluto sotto 1 mm). Due implementazioni corrette in virgola mobile
// stanno ben dentro; un errore di unità o di asse sta ben fuori.
export function tolleranzaVerifica(valore: number): number { return 1e-9 * Math.max(1, Math.abs(valore)); }

let contesto: Record<string, unknown> | null = null;

function carica(): Record<string, unknown> {
  if (contesto) return contesto;
  const c: Record<string, unknown> = {};
  for (const m of MODULI_MSE) {
    const sorgente = readFileSync(path.join(process.cwd(), 'public', 'prototipo', m), 'utf-8');
    vm.runInNewContext(sorgente, c, { filename: m });
  }
  if (!c.RFMisura || !c.RFMSE) throw new Error('moduli MSE non caricati');
  contesto = c;
  return c;
}

export function misura(): Api { return carica().RFMisura as Api; }
export function mse(): Mse { return carica().RFMSE as Mse; }

export function puntoValido(p: unknown): p is Punto {
  return !!p && typeof p === 'object' && Number.isFinite((p as Punto).x) && Number.isFinite((p as Punto).y);
}

export function calibrata(cal: Calibrazione | null | undefined): boolean {
  if (!cal) return false;
  if (cal.tipo === 'us_regioni') return Array.isArray(cal.regioni) && cal.regioni.length > 0;
  return cal.tipo === 'pixel_spacing' && !!cal.spacing;
}
