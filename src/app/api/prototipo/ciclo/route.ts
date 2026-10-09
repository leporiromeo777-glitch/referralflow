import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { assegnaCiclo, creaCartellaCiclo, elencoCiclo, scartaCiclo } from '@/lib/ciclo/cartella-server';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// Prova da sforzo (9.10.2026, [[Piattaforma/Prova da sforzo]]): i referti PDF arrivati dalla
// ciclo che non si sono agganciati da soli a un paziente. Li vede e li assegna chi lavora
// sulle cartelle dei pazienti (il tecnico tiene in piedi il sistema e non vede dati clinici).
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'patients');
  if (no) return no;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  return NextResponse.json(await elencoCiclo(session.studioId), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'patients');
  if (no) return no;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? ''), id = String(c?.id ?? '');
  if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  const esito = (r: Record<string, unknown>) => ('errore' in r ? NextResponse.json({ errore: r.errore }, { status: (r.stato as number) || 400 }) : NextResponse.json(r));
  if (azione === 'assegna') {
    if (!isUuid(String(c?.patient_id ?? ''))) return NextResponse.json({ errore: 'Scegli il paziente.' }, { status: 400 });
    return esito(await assegnaCiclo(session.studioId, session.id, id, String(c.patient_id)));
  }
  if (azione === 'crea_cartella') return esito(await creaCartellaCiclo(session.studioId, session.id, id, { cognome: c?.cognome, nome: c?.nome, data_nascita: c?.data_nascita }));
  if (azione === 'scarta') return esito(await scartaCiclo(session.studioId, session.id, id));
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
