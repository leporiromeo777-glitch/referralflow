import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Il righello, lato server (19.9.2026).
//
// Il calcolo della distanza vive in UN file solo, public/prototipo/misura.js:
// lo esegue il browser mentre si trascina e lo riesegue qui prima di salvare,
// così il numero in tabella è sempre quello del codice provato — non quello
// che un browser qualsiasi ha mandato. Caricarlo con `vm` invece di
// importarlo è voluto: il file è JavaScript semplice senza `export`, perché
// nel prototipo si carica con <script>, e deve restare uno.

export type Punto = { x: number; y: number };
export type RegioneUs = { x0: number; y0: number; x1: number; y1: number; dx_mm: number; dy_mm: number; tipo_dati?: number };
export type Calibrazione = {
  tipo: 'us_regioni' | 'pixel_spacing' | 'imager_pixel_spacing' | 'nessuna';
  righe: number; colonne: number;
  regioni: RegioneUs[];
  spacing: { dx_mm: number; dy_mm: number; origine: string; taratura: string } | null;
};
export type EsitoMisura = { stato: 'ok'; mm: number; dx_mm: number; dy_mm: number } | { stato: 'non_calibrata' | 'rivelatore' | 'fuori_regione' | 'regioni_diverse' | 'fuori_immagine' | 'punti_uguali' | 'punti_non_validi'; mm?: undefined };

type Api = {
  VERSIONE: string;
  distanzaMm: (cal: Calibrazione | null, p1: Punto, p2: Punto) => EsitoMisura;
  formattaMm: (mm: number) => string;
  descriviCalibrazione: (cal: Calibrazione | null) => string;
  motivo: (stato: string) => string;
};

let api: Api | null = null;

export function misura(): Api {
  if (api) return api;
  const sorgente = readFileSync(path.join(process.cwd(), 'public', 'prototipo', 'misura.js'), 'utf-8');
  const contesto: Record<string, unknown> = {};
  vm.runInNewContext(sorgente, contesto, { filename: 'misura.js' });
  api = contesto.RFMisura as Api;
  if (!api || typeof api.distanzaMm !== 'function') throw new Error('misura.js non caricato');
  return api;
}

export function puntoValido(p: unknown): p is Punto {
  return !!p && typeof p === 'object' && Number.isFinite((p as Punto).x) && Number.isFinite((p as Punto).y);
}

export function calibrata(cal: Calibrazione | null | undefined): boolean {
  if (!cal) return false;
  if (cal.tipo === 'us_regioni') return Array.isArray(cal.regioni) && cal.regioni.length > 0;
  return cal.tipo === 'pixel_spacing' && !!cal.spacing;
}
