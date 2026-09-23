import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { fotogrammaPng } from '@/lib/imaging';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// Un fotogramma, in PNG. Il DICOM originale non esce mai da qui: esce
// un'immagine già finestrata, che è quello che serve per guardarla nel
// browser — e che non porta con sé l'anagrafica scritta dentro il file.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('non autorizzato', { status: 401 });
  const nonPermesso = vietato(session.role, 'imaging');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!RUOLI.has(session.role)) return new NextResponse('non autorizzato', { status: 403 });
  if (!isUuid(params.id)) return new NextResponse('non trovato', { status: 404 });

  const [img] = await query<{ storage_key: string; ww: number | null; wl: number | null; immagine: boolean }>(
    `select i.storage_key, i.ww, i.wl, i.immagine
       from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id
      where i.id = $1 and e.studio_id = $2`, [params.id, session.studioId]);
  if (!img) return new NextResponse('non trovato', { status: 404 });
  if (!img.immagine) return new NextResponse('non è un’immagine', { status: 415 });

  const q = req.nextUrl.searchParams;
  const numero = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const esito = await fotogrammaPng(img.storage_key, {
    frame: numero(q.get('frame')) ?? 0,
    ww: numero(q.get('ww')) ?? img.ww,
    wl: numero(q.get('wl')) ?? img.wl,
    lato: numero(q.get('lato')) ?? 1024,
    anteprima: q.get('anteprima') === '1',
  });
  if (!Buffer.isBuffer(esito)) {
    console.error(`[imaging] disegno fallito: ${(esito as { errore: string }).errore}`);
    return new NextResponse('immagine non leggibile', { status: 422 });
  }
  return new NextResponse(esito as any, {
    headers: {
      'Content-Type': 'image/png',
      // Privata e breve: il browser la riusa mentre si scorre la serie, ma
      // non resta in giro. Niente cache condivise: è un dato sanitario.
      'Cache-Control': 'private, max-age=300, no-store',
    },
  });
}
