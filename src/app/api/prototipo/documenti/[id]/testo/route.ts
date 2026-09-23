import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { testoDocumento } from '@/lib/documenti-testo';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// Testo estratto di un documento della cartella, per il visualizzatore del
// prototipo (Word e testo) e per mostrare cosa il bot «vede». Sessione.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'documents');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const t = await testoDocumento(session.studioId, params.id, session.id);
  if (!t) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  return NextResponse.json(t);
}
