import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { filmatoFile } from '@/lib/imaging';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// Un filmato intero (un file con più fotogrammi), per riprodurlo nel browser
// (9.10.2026): un file solo con l'intestazione e i fotogrammi in JPEG. Come
// per il fotogramma singolo, il DICOM originale non esce: escono immagini già
// disegnate, senza l'anagrafica del file. Stessi permessi del fotogramma.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('non autorizzato', { status: 401 });
  const nonPermesso = vietato(session.role, 'imaging');
  if (nonPermesso) return nonPermesso;
  if (!RUOLI.has(session.role)) return new NextResponse('non autorizzato', { status: 403 });
  if (!isUuid(params.id)) return new NextResponse('non trovato', { status: 404 });

  const [img] = await query<{ storage_key: string; ww: number | null; wl: number | null; immagine: boolean; frame: number | null }>(
    `select i.storage_key, i.ww, i.wl, i.immagine, i.frame
       from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id
      where i.id = $1 and e.studio_id = $2`, [params.id, session.studioId]);
  if (!img) return new NextResponse('non trovato', { status: 404 });
  if (!img.immagine || !(Number(img.frame) > 1)) return new NextResponse('non è un filmato', { status: 415 });

  const q = req.nextUrl.searchParams;
  const numero = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const esito = await filmatoFile(img.storage_key, { ww: numero(q.get('ww')) ?? img.ww, wl: numero(q.get('wl')) ?? img.wl, lato: numero(q.get('lato')) ?? 1024 });
  if (typeof esito !== 'string') {
    if (esito.errore === 'archivio_non_collegato') return new NextResponse('archivio non collegato', { status: 503, headers: { 'X-RF-Motivo': 'archivio_non_collegato' } });
    // Troppo lungo per prepararlo in un colpo: la pagina lo fa scorrere a mano.
    if (esito.errore === 'troppo_lungo') return new NextResponse('filmato troppo lungo', { status: 413 });
    console.error(`[imaging] filmato non preparato: ${esito.errore}`);
    return new NextResponse('filmato non leggibile', { status: 422 });
  }
  const corpo = await fs.readFile(esito);
  return new NextResponse(corpo as any, {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(corpo.length), 'Cache-Control': 'private, no-store' },
  });
}
