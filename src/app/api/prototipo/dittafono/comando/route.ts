import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { COMANDI, PARTI_LETTERA, type Comando, type ParteLettera } from '@/lib/dittafono-comandi';
import { eseguiComando } from '@/lib/dittafono-comandi-server';
import { vietato } from '@/lib/permessi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// I comandi a voce del dittafono (12.10.2026, [[Piattaforma/Dittafono]]): chi detta dice «per favore, inserisci la
// lettera più recente» e la pagina chiede qui il pezzo da mettere nel foglio.
// Si può chiedere la lettera intera o solo alcune PARTI (anamnesi, FRCV, comorbidità, un esame, la conclusione, la terapia).
//   POST { comando: 'lettera_recente' | 'parti', parti?: [...], paziente: <uuid> } → { testo, fonte, data, cosa, mancanti } | { errore }
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
  const parti = [...new Set((Array.isArray(b?.parti) ? (b.parti as unknown[]) : []).map(String))].filter((k): k is ParteLettera => (PARTI_LETTERA as readonly string[]).includes(k)).slice(0, 8);
  if (comando === 'parti' && !parti.length) return NextResponse.json({ errore: 'Non ho capito quale parte della lettera.' }, { status: 400 });
  const r = await eseguiComando(session.studioId, session.id, paziente, comando, parti);
  return 'errore' in r ? NextResponse.json({ errore: r.errore }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ testo: r.testo, fonte: r.fonte, data: r.data, cosa: r.cosa, mancanti: r.mancanti }, { headers: { 'Cache-Control': 'no-store' } });
}
