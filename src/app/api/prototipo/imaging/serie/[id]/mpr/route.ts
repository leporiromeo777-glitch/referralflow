import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { mprPng } from '@/lib/imaging';
import { aggiornaGeometriaSerie, pianoVirtuale } from '@/lib/imaging-serie';
import type { GeometriaSerie } from '@/lib/imaging-misura';

export const dynamic = 'force-dynamic';

const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// Un piano ricostruito (sagittale o coronale) di una serie, in PNG (MSE
// fase 9). Solo se la geometria di serie lo permette: fette uniformi, stesse
// dimensioni e spaziatura, stesso Frame of Reference. Con `?info=1` torna
// la descrizione della griglia virtuale, senza disegnare.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('non autorizzato', { status: 401 });
  if (!RUOLI.has(session.role)) return new NextResponse('non autorizzato', { status: 403 });
  if (!isUuid(params.id)) return new NextResponse('non trovato', { status: 404 });
  const [serie] = await query<{ id: string; geometria: GeometriaSerie | null }>(
    `select s.id, s.geometria from imaging_serie s join imaging_esami e on e.id = s.esame_id where s.id = $1 and e.studio_id = $2`, [params.id, session.studioId]);
  if (!serie) return new NextResponse('non trovato', { status: 404 });
  let g = serie.geometria;
  if (!g) g = await aggiornaGeometriaSerie(serie.id);
  const q = req.nextUrl.searchParams;
  const piano = q.get('piano') === 'coronale' ? 'coronale' : 'sagittale';
  const virt = g ? pianoVirtuale(g, piano) : null;
  if (!virt || !g) return NextResponse.json({ errore: 'serie_non_ricostruibile', avvisi: g?.avvisi ?? [] }, { status: 422 });
  if (q.get('info') === '1') return NextResponse.json({ sagittale: pianoVirtuale(g, 'sagittale'), coronale: pianoVirtuale(g, 'coronale'), n_fette: g.n }, { headers: { 'Cache-Control': 'no-store' } });
  const indice = Math.max(0, Math.min(virt.n_indici - 1, Math.round(Number(q.get('indice') ?? Math.floor(virt.n_indici / 2)))));
  const numero = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const ordine = g.ordine ?? [];
  const righe = await query<{ id: string; storage_key: string }>(`select id, storage_key from imaging_immagini where serie_id = $1`, [serie.id]);
  const perId = new Map(righe.map((r) => [r.id, r.storage_key]));
  const keys = ordine.map((id) => perId.get(id)).filter((k): k is string => !!k);
  if (keys.length !== ordine.length || keys.length < 3) return NextResponse.json({ errore: 'serie_non_ricostruibile' }, { status: 422 });
  const esito = await mprPng(keys, piano, indice, [g.sx as number, g.sy as number], g.distanza_media_mm as number, numero(q.get('ww')), numero(q.get('wl')));
  if ('errore' in esito) {
    console.error(`[imaging] mpr: ${esito.errore} serie=${serie.id}`);
    return NextResponse.json({ errore: esito.errore }, { status: 422 });
  }
  return new NextResponse(esito.png as any, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300, no-store', 'X-RF-MPR': JSON.stringify(esito.info) } });
}
