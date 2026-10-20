import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { vociValide } from '@/lib/formattazione';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// Grassetto, corsivo e sottolineato messi con la barra della revisione (20.10.2026, [[Catena/Revisione guidata]]): l'elenco
// dei pezzi formattati entra in `payload.formattazione` della bozza; il Word li applica (referto-docx.ts). Il testo non
// si tocca. Gli stessi ruoli e lo stesso cancello di chi riscrive il testo: solo finché è una bozza.
//   POST { voci: [{ testo, n, b?, i?, u? }] } → { ok, voci }
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'reports');
  if (no) return no;
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const voci = vociValide(corpo?.voci);
  if (!voci) return NextResponse.json({ errore: 'formattazione non valida' }, { status: 400 });
  const [agg] = await query<{ id: string }>(
    `update referti_bozze set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{formattazione}', $3::jsonb) where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
    [params.id, session.studioId, JSON.stringify(voci)]);
  if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
  return NextResponse.json({ ok: true, voci });
}
