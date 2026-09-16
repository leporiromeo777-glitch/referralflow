import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';

// Chi può fare cosa nell'orchestrazione (§12): la segreteria e i medici
// registrano eventi e comandi; i parametri li cambia l'amministratore. Un
// inviante non entra.
export async function sessioneStudio(ruoli: string[] = ['segretaria', 'medico', 'admin']): Promise<{ s: SessionUser } | { r: NextResponse }> {
  const s = await getSession();
  if (!s || !s.studioId) return { r: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  if (!ruoli.includes(s.role)) return { r: NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 }) };
  return { s };
}
export const senzaCache = { headers: { 'Cache-Control': 'no-store' } };
