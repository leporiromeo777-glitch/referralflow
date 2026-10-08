import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { PUO_ORCH, type CapacitaOrch } from '@/lib/orchestrazione/ruoli';

// Chi può fare cosa nell'orchestrazione (§12) sta in lib/orchestrazione/ruoli.ts:
// chi sta coi pazienti (aiuto medico compreso) guarda e registra ciò che succede;
// i comandi che cambiano il piano li dà segreteria, medico o amministrazione; i
// parametri li cambia l'amministratore. Un inviante non entra.
export async function sessioneStudio(cosa: CapacitaOrch = 'decidere'): Promise<{ s: SessionUser } | { r: NextResponse }> {
  const s = await getSession();
  if (!s || !s.studioId) return { r: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  if (!(PUO_ORCH[cosa] as readonly string[]).includes(s.role)) return { r: NextResponse.json({ errore: 'Il tuo ruolo non può farlo.', codice: 'ruolo_non_ammesso' }, { status: 403 }) };
  return { s };
}
export const senzaCache = { headers: { 'Cache-Control': 'no-store' } };
