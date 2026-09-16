import { NextResponse, type NextRequest } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { correggiStato, registraEvento } from '@/lib/orchestrazione/orchestratore';
export const dynamic = 'force-dynamic';
const TIPI = new Set(['paziente_arrivato', 'paziente_accolto', 'paziente_in_ritardo', 'paziente_assente', 'paziente_chiamato', 'paziente_richiamato', 'preparazione_iniziata', 'pronto', 'visita_iniziata', 'visita_quasi_finita', 'visita_finita', 'dimesso', 'medico_in_ritardo', 'sala_libera', 'sala_occupata', 'sala_fuori_servizio', 'sala_ripristinata', 'apparecchio_indisponibile', 'urgenza', 'appuntamento_aggiunto', 'appuntamento_annullato']);
const FONTI = new Set(['ui', 'tablet', 'stanza', 'cleo']);
// Un evento dal tablet, dai pulsanti in stanza o dalla mappa. Il corpo porta
// tipo e riferimenti: mai un dato clinico.
export async function POST(req: NextRequest) {
  const a = await sessioneStudio(); if ('r' in a) return a.r;
  const c = await req.json().catch(() => null);
  const tipo = String(c?.tipo ?? '');
  // La correzione di uno stato messo per sbaglio: la fa solo una persona, e
  // resta scritta come correzione (§3.4).
  if (tipo === 'correzione') {
    const esito = await correggiStato(a.s.studioId, String(c?.appointment_id ?? ''), String(c?.stato ?? '') as never, a.s.id);
    return NextResponse.json(esito, { ...senzaCache, status: esito.ok ? 200 : 400 });
  }
  if (!TIPI.has(tipo)) return NextResponse.json({ errore: 'tipo di evento sconosciuto' }, { status: 400 });
  const fonte = FONTI.has(String(c?.fonte)) ? String(c.fonte) : 'ui';
  const esito = await registraEvento(a.s.studioId, {
    tipo: tipo as any, appointment_id: c?.appointment_id ?? null, sala: c?.sala ?? null, medico: c?.medico ?? null,
    minuti: c?.minuti != null ? Number(c.minuti) : null, testo: c?.testo ? String(c.testo).slice(0, 300) : null, fonte, user_id: a.s.id,
  });
  return NextResponse.json(esito, { ...senzaCache, status: esito.ok ? 200 : 409 });
}
