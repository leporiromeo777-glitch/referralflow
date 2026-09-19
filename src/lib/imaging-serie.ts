import 'server-only';
import { query } from './db';
import { mse, type Geometria, type GeometriaSerie } from './imaging-misura';

// La geometria di una serie (MSE fase 9) dalle geometrie delle sue immagini,
// calcolata con mse/serie.js e scritta in imaging_serie.geometria. Si
// ricalcola quando è nulla o quando entrano immagini nuove.
export async function aggiornaGeometriaSerie(serieId: string): Promise<GeometriaSerie | null> {
  const immagini = await query<{ id: string; geometria: Geometria | null; immagine: boolean }>(
    `select id, geometria, immagine from imaging_immagini where serie_id = $1 order by numero nulls last, id`, [serieId]);
  const buone = immagini.filter((i) => i.immagine && i.geometria);
  if (!buone.length) return null;
  const g = mse().serie.analizzaSerie(buone.map((i) => ({ id: i.id, geometria: i.geometria })));
  await query(`update imaging_serie set geometria = $2 where id = $1`, [serieId, JSON.stringify(g)]);
  return g;
}

// La griglia virtuale di un piano MPR e la sua calibrazione: la decide il
// server dalla geometria di serie, mai il browser.
export function pianoVirtuale(g: GeometriaSerie, piano: 'sagittale' | 'coronale') {
  if (!g || g.stato !== 'ok' || !g.volume_possibile || !g.distanza_media_mm || !g.sx || !g.sy || !g.righe || !g.colonne) return null;
  const spX = piano === 'coronale' ? g.sx : g.sy;
  const colonne = piano === 'coronale' ? g.colonne : g.righe;
  const nIndici = piano === 'coronale' ? g.righe : g.colonne;
  return {
    piano, colonne, righe: g.n, sp_x: spX, sp_y: g.distanza_media_mm, n_indici: nIndici,
    calibrazione: { tipo: 'pixel_spacing' as const, righe: g.n, colonne, regioni: [], spacing: { dx_mm: spX, dy_mm: g.distanza_media_mm, origine: 'MPR', taratura: '' }, avvisi: ['immagine_ricostruita'] },
    geometria: {
      versione: 1, identita: { sop_class: '', sop_uid: '', serie_uid: '', studio_uid: '', modalita: 'CT', frame_totali: 1 },
      pixel: { righe: g.n, colonne, aspect: null, rescale: null, fotometria: 'MONOCHROME2', bit: null, campioni: 1 },
      spaziatura: { fonte: 'MPR', dy_mm: g.distanza_media_mm, dx_mm: spX, per_frame: false, calibrazione_tipo: null, calibrazione_descrizione: `ricostruzione ${piano} dalla serie (passo ${g.distanza_media_mm} mm)`, imager_dy_mm: null, imager_dx_mm: null },
      regioni_us: [], spazio: null, derivata: true, image_type: ['DERIVED', 'SECONDARY', 'MPR'], avvisi_lettura: ['immagine_ricostruita', 'immagine_derivata'], sha256_file: null,
    } as Geometria,
  };
}
