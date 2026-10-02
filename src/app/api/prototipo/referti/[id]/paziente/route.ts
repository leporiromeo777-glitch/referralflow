import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { registraEvento } from '@/lib/referti-eventi';
import { collegaPazienteAMano, statoPaziente } from '@/lib/paziente-bozza';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// La cartella della bozza (2.10.2026): GET → collegata a chi e come, o le
// proposte; POST { azione: 'collega', patient_id } | { azione: 'scollega' }.
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);

async function sessione(id: string) {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'reports');
  if (no) return { errore: no };
  if (!isUuid(id)) return { errore: NextResponse.json({ errore: 'non_trovato' }, { status: 404 }) };
  return { session };
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { session, errore } = await sessione(id);
  if (errore) return errore;
  const s = await statoPaziente(session.studioId, id);
  if (!s) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  return NextResponse.json(s, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { session, errore } = await sessione(id);
  if (errore) return errore;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const c = await req.json().catch(() => null);
  if (c?.azione === 'collega' && !isUuid(String(c.patient_id ?? ''))) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
  if (c?.azione !== 'collega' && c?.azione !== 'scollega') return NextResponse.json({ errore: 'azione' }, { status: 400 });
  const r = await collegaPazienteAMano(session.studioId, id, c.azione === 'collega' ? String(c.patient_id) : null, session.id);
  if ('errore' in r) return NextResponse.json(r, { status: 409 });
  void registraEvento(session.studioId, id, c.azione === 'collega' ? 'paziente_collegato' : 'paziente_scollegato', session.id, {});
  return NextResponse.json(r);
}
