import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { avvisoProfilo, dettaglio, puoPa } from '@/lib/pressione/archivio';

export const dynamic = 'force-dynamic';

// Un profilo pressorio, con tutti i conti già fatti (7.10.2026).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const v = vietato(session.role, 'pressione');
  if (v) return v;
  if (!puoPa(session.role, 'vedere')) return NextResponse.json({ errore: 'La pressione la vede chi cura: il tuo ruolo non ci accede.' }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  const d = await dettaglio(session.studioId, id, session.role);
  if (!d) return NextResponse.json({ errore: 'Profilo non trovato.' }, { status: 404 });
  return NextResponse.json({ ...d, avviso: await avvisoProfilo(session.studioId, id) }, { headers: { 'Cache-Control': 'no-store' } });
}
