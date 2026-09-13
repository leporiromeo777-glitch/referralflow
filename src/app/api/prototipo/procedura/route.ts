import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { cambiamentiUltimaVisita, controlloPrimaDellaFirma, richiamiMese } from '@/lib/procedure';

export const dynamic = 'force-dynamic';

// Le procedure dell'assistente (13.9.2026): {nome, patient_id?, bozza_id?}.
// Ogni esito porta la sua traccia (src/lib/procedure.ts).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const nome = String(corpo?.nome ?? '');
  const patientId = typeof corpo?.patient_id === 'string' && isUuid(corpo.patient_id) ? corpo.patient_id : null;
  const bozzaId = typeof corpo?.bozza_id === 'string' && isUuid(corpo.bozza_id) ? corpo.bozza_id : null;
  let esito;
  if (nome === 'cambiamenti_ultima_visita') {
    if (!patientId) return NextResponse.json({ errore: 'paziente_mancante' }, { status: 400 });
    esito = await cambiamentiUltimaVisita(session.studioId, patientId, session.id);
  } else if (nome === 'richiami_mese') {
    esito = await richiamiMese(session.studioId, session.id);
  } else if (nome === 'controllo_prefirma') {
    if (!bozzaId) return NextResponse.json({ errore: 'bozza_mancante' }, { status: 400 });
    esito = await controlloPrimaDellaFirma(session.studioId, bozzaId, session.id);
  } else {
    return NextResponse.json({ errore: 'procedura_sconosciuta' }, { status: 400 });
  }
  if (!esito) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  return NextResponse.json(esito, { headers: { 'Cache-Control': 'no-store' } });
}
