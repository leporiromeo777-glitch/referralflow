import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { COMANDI, type Comando } from '@/lib/dittafono-comandi';
import { eseguiComando } from '@/lib/dittafono-comandi-server';
import { vietato } from '@/lib/permessi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// I comandi a voce del dittafono (12.10.2026, [[Piattaforma/Dittafono]]): chi detta dice «per favore, inserisci la
// lettera più recente» e la pagina chiede qui il pezzo da mettere nel foglio.
//   POST { comando: 'lettera_recente' | 'terapia_recente', paziente: <uuid> } → { testo, fonte, data } | { errore }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'dittafono');
  if (no) return no;
  const b = await req.json().catch(() => null);
  const comando = String(b?.comando ?? '') as Comando;
  const paziente = String(b?.paziente ?? '');
  if (!COMANDI.includes(comando)) return NextResponse.json({ errore: 'Comando non previsto.' }, { status: 400 });
  if (!isUuid(paziente)) return NextResponse.json({ errore: 'Scegli prima il paziente.' }, { status: 400 });
  const r = await eseguiComando(session.studioId, session.id, paziente, comando);
  return 'errore' in r ? NextResponse.json({ errore: r.errore }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ testo: r.testo, fonte: r.fonte, data: r.data }, { headers: { 'Cache-Control': 'no-store' } });
}
