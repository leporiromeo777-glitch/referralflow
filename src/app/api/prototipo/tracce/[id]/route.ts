import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { leggiTraccia } from '@/lib/tracce';

export const dynamic = 'force-dynamic';

// La traccia di una risposta dell'assistente (passi, fonti, mancanze, modello,
// tempo): il prototipo la mostra sotto la risposta come «Da dove viene».
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ errore: 'id_non_valido' }, { status: 400 });
  const t = await leggiTraccia(session.studioId, id);
  if (!t) return NextResponse.json({ errore: 'non_trovata' }, { status: 404 });
  return NextResponse.json(t, { headers: { 'Cache-Control': 'no-store' } });
}
