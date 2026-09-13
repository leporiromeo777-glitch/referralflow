import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { PRIORITA, procedurePerRuolo } from '@/lib/procedure-registro';
import { caricaOrganizzazione, responsabileDi } from '@/lib/organizzazione';

export const dynamic = 'force-dynamic';

// Il grafo operativo e organizzativo per il prototipo (13.9.2026): le
// procedure che il ruolo può lanciare (frasi, input, chip, chi ne risponde e
// quando) e l'organizzazione dello studio dalla wiki. Solo ruoli, nessun dato
// clinico.
const RUOLO: Record<string, string> = { segretaria: 'secretary', medico: 'doctor', admin: 'org_admin', inviante: 'inviante' };

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const ruolo = RUOLO[session.role] ?? 'secretary';
  const org = caricaOrganizzazione();
  const procedure = [...procedurePerRuolo(ruolo)].sort((a, b) => PRIORITA.indexOf(a.nome) - PRIORITA.indexOf(b.nome)).map((p) => {
    const r = responsabileDi(org, p.nome);
    return { ...p, responsabile: r ? { ruolo: r.ruolo, quando: r.quando, cosa: r.cosa } : null };
  });
  return NextResponse.json({ ruolo, procedure, organizzazione: org }, { headers: { 'Cache-Control': 'no-store' } });
}
