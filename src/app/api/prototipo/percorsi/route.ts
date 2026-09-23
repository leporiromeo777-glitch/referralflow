import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { caricaPercorsi } from '@/lib/percorsi';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// I percorsi diagnostico-terapeutici dalla wiki per il prototipo (14.9.2026):
// sequenze standard per indicazione, con stato «proposta» o «validato». Solo
// criteri generali, nessun dato di paziente.
export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'percorsi');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  const percorsi = caricaPercorsi();
  return NextResponse.json({ percorsi, pagina: 'docs/wiki/Medici/Percorsi.md' }, { headers: { 'Cache-Control': 'no-store' } });
}
