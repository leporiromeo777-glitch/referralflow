import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { briefingPreVisita } from '@/lib/briefing';
import { proceduraPerNome } from '@/lib/procedure-registro';

const RUOLO: Record<string, string> = { segretaria: 'secretary', medico: 'doctor', admin: 'org_admin', inviante: 'inviante' };

export const dynamic = 'force-dynamic';

// Briefing pre-visita per il prototipo (13.9.2026): procedura del codice +
// sintesi del modello locale, con traccia e fatti nel grafo (src/lib/briefing.ts).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!(proceduraPerNome('briefing_previsita')!.ruoli as string[]).includes(RUOLO[session.role] ?? 'secretary')) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const corpo = await req.json().catch(() => null);
  const patientId = typeof corpo?.patient_id === 'string' && isUuid(corpo.patient_id) ? corpo.patient_id : null;
  if (!patientId) return NextResponse.json({ errore: 'paziente_mancante' }, { status: 400 });
  const esito = await briefingPreVisita(session.studioId, patientId, { userId: session.id, conModello: corpo?.con_modello !== false });
  if (!esito) return NextResponse.json({ errore: 'paziente_non_trovato' }, { status: 404 });
  return NextResponse.json(esito, { headers: { 'Cache-Control': 'no-store' } });
}
