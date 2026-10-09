import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { pdfArrivo } from '@/lib/ciclo/cartella-server';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// Il PDF di un referto della ciclo che aspetta di essere assegnato: per guardarlo prima di dire di chi è.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('non autorizzato', { status: 401 });
  const no = vietato(session.role, 'patients');
  if (no) return no;
  if (!RUOLI.has(session.role)) return new NextResponse('non autorizzato', { status: 403 });
  if (!isUuid(params.id)) return new NextResponse('non trovato', { status: 404 });
  const pdf = await pdfArrivo(session.studioId, params.id);
  if (!pdf) return new NextResponse('non trovato', { status: 404 });
  return new NextResponse(pdf as any, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="prova-da-sforzo.pdf"', 'Cache-Control': 'private, no-store' } });
}
