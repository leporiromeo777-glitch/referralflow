import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { proposteDallaCartella } from '@/lib/cartella-proposte';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pagine della cartella scansionata che il dettato cita (28.9.2026): solo
// proposte, la revisione le conferma con «Estrai e allega».
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'reports');
  if (no) return no;
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const r = await proposteDallaCartella(session.studioId, params.id);
  if (!r) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
