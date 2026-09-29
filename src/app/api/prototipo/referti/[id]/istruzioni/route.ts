import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { registraEvento } from '@/lib/referti-eventi';
import { azioneIstruzioni } from '@/lib/istruzioni-traccia-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Istruzioni della seconda traccia (29.9.2026): dalla revisione
//   POST { azione: 'annulla' | 'in_fondo' | 'rifai' }
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'reports');
  if (no) return no;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const r = await azioneIstruzioni(session.studioId, params.id, azione);
  if ('errore' in r) return NextResponse.json(r, { status: 409 });
  void registraEvento(session.studioId, params.id, `istruzioni_${azione}`, session.id, {});
  return NextResponse.json(r);
}
