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
//   POST { comando: 'lettera_recente' | 'parti' | 'fino', parti?: [...], esclusa?: bool, paziente: <uuid> } → { testo, fonte, data, cosa, mancanti, apri } | { errore }
// `apri` è la lettera di provenienza, che la pagina mostra accanto al foglio.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'dittafono');
  if (no) return no;
  const b = await req.json().catch(() => null);
  // Un «per favore» che la pagina non ha capito: arriva solo la FORMA (c'era un verbo previsto? si nominava la lettera?
  // quali parti?), mai le parole. Va nel log, per capire da qui che cosa non viene riconosciuto.
  if (b?.comando === 'non_capito') {
    const motivo = ['senza_paziente', 'testo_cambiato', 'rete'].find((k) => k === b?.motivo);
    if (motivo) { console.log(`[dittafono-comando] capito ma non eseguito: ${motivo}`); return NextResponse.json({ ok: true }); }
    const f = b?.forma ?? {};
    const parti = (Array.isArray(f.parti) ? (f.parti as unknown[]).map(String) : []).filter((k) => (PARTI_LETTERA as readonly string[]).includes(k)).slice(0, 8);
    console.log(`[dittafono-comando] non capito: verbo=${f.verbo === true ? 'sì' : 'no'} lettera=${f.lettera === true ? 'sì' : 'no'} parti=${parti.join('+') || '-'} caratteri=${Math.min(999, Number(f.caratteri) || 0)} parole=${Math.min(99, Number(f.parole) || 0)}`);
    return NextResponse.json({ ok: true });
  }
  const comando = String(b?.comando ?? '') as Comando;
  const paziente = String(b?.paziente ?? '');
  if (!COMANDI.includes(comando)) return NextResponse.json({ errore: 'Comando non previsto.' }, { status: 400 });
  if (!isUuid(paziente)) return NextResponse.json({ errore: 'Scegli prima il paziente.' }, { status: 400 });
  const parti = [...new Set((Array.isArray(b?.parti) ? (b.parti as unknown[]) : []).map(String))].filter((k): k is ParteLettera => (PARTI_LETTERA as readonly string[]).includes(k)).slice(0, 8);
  if ((comando === 'parti' || comando === 'fino') && !parti.length) return NextResponse.json({ errore: 'Non ho capito quale parte della lettera.' }, { status: 400 });
  const esclusa = comando === 'fino' && b?.esclusa === true;
  const r = await eseguiComando(session.studioId, session.id, paziente, comando, comando === 'fino' ? parti.slice(0, 1) : parti, esclusa);
  console.log(`[dittafono-comando] ${comando}${parti.length ? ` parti=${parti.join('+')}` : ''}${esclusa ? ' esclusa' : ''} → ${'errore' in r ? `niente (${r.errore.replace(/:.*/, '').slice(0, 60)})` : `ok fonte=${r.apri.tipo} pdf=${r.apri.pdf ? 'sì' : 'no'} caratteri=${r.testo.length} mancanti=${r.mancanti.length}`}`);
  return 'errore' in r ? NextResponse.json({ errore: r.errore }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ testo: r.testo, fonte: r.fonte, data: r.data, cosa: r.cosa, mancanti: r.mancanti, apri: r.apri }, { headers: { 'Cache-Control': 'no-store' } });
}
