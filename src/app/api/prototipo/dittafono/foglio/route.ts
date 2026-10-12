import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { foglioPer } from '@/lib/dittafono-foglio';
import { vietato } from '@/lib/permessi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Il foglio del dittafono (12.10.2026, [[Piattaforma/Dittafono]]): le parti già scritte della lettera — carta
// intestata del medico che detta, destinatario (l'ultimo medico inviante del paziente), data, titolo, paziente,
// saluto, chiusura e firma, copia — dagli stessi ingredienti del Word.
//   GET ?medico=<id del profilo>&paziente=<uuid> → { medico, intestazione, formato, destinatario, data, titolo, paziente, saluto, chiusura, copia }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'dittafono');
  if (no) return no;
  const q = req.nextUrl.searchParams;
  const medico = (q.get('medico') ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) || null;
  const paziente = q.get('paziente') ?? '';
  return NextResponse.json(await foglioPer(session.studioId, medico, isUuid(paziente) ? paziente : null), { headers: { 'Cache-Control': 'no-store' } });
}
