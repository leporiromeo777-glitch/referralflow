import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { creaRichiamoDaBozza } from '@/lib/referti-richiamo-crea';

export const dynamic = 'force-dynamic';

// Richiamo proposto dal dettato, creato dall'interfaccia nuova alla conferma.
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin']);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const esito = await creaRichiamoDaBozza(session.studioId, session.id, params.id, Number(corpo?.mesi));
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: esito.errore === 'mesi' ? 400 : esito.errore === 'gia_creato' ? 409 : 404 });
  return NextResponse.json({ ok: true, mesi: esito.mesi });
}
