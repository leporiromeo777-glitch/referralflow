import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { attorno, collegaInviante, ricollegaInvianti, scegliInviante } from '@/lib/referti-inviante';

export const dynamic = 'force-dynamic';

// Inviante, copia per conoscenza e allegati di un referto (26.9.2026): quel
// che finirà nel Word, visto e corretto dalla revisione.
// GET  → stato calcolato (collega l'inviante se non è ancora fatto)
// POST → { azione: 'inviante', referring_doctor_id | null }  scelta a mano (null = torna automatico)
//        { azione: 'aggiungi', nome, specialita?, email?, telefono?, via?, npa?, localita? }
//          aggiunge l'inviante nuovo alla rubrica e ricollega i referti che lo aspettavano
// La copia per conoscenza si salva come gli altri campi (campi.copia_conoscenza).
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);

async function sessione(id: string) {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'reports');
  if (no) return { errore: no };
  if (!isUuid(id)) return { errore: NextResponse.json({ errore: 'non_trovato' }, { status: 404 }) };
  return { session };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, errore } = await sessione(params.id);
  if (errore) return errore;
  const [b] = await query<{ inviante_stato: string | null; inviante_manuale: boolean }>(
    'select inviante_stato, inviante_manuale from referti_bozze where id = $1 and studio_id = $2', [params.id, session.studioId]);
  if (!b) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (b.inviante_stato == null && !b.inviante_manuale) await collegaInviante(session.studioId, params.id).catch(() => null);
  const a = await attorno(session.studioId, params.id);
  const rubrica = await query<{ id: string; nome: string; localita: string | null }>(
    'select id, nome, localita from referring_doctors where studio_id = $1 order by nome', [session.studioId]);
  return NextResponse.json({ ...a, rubrica }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, errore } = await sessione(params.id);
  if (errore) return errore;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const s = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max);
  if (c?.azione === 'inviante') {
    const rid = c.referring_doctor_id == null || c.referring_doctor_id === '' ? null : String(c.referring_doctor_id);
    if (rid && !isUuid(rid)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    try { await scegliInviante(session.studioId, params.id, rid); } catch { return NextResponse.json({ errore: 'Inviante non trovato.' }, { status: 404 }); }
    return NextResponse.json({ ok: true });
  }
  if (c?.azione === 'aggiungi') {
    const nome = s(c.nome, 120);
    if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
    const email = s(c.email).toLowerCase();
    if (email && !email.includes('@')) return NextResponse.json({ errore: 'E-mail non valida.' }, { status: 400 });
    const [r] = await query<{ id: string }>(
      `insert into referring_doctors (studio_id, nome, email, telefono, specialita, via, npa, localita)
       values ($1, $2, nullif($3, ''), nullif($4, ''), nullif($5, ''), nullif($6, ''), nullif($7, ''), nullif($8, '')) returning id`,
      [session.studioId, nome, email, s(c.telefono, 40), s(c.specialita, 120).replace(/^m?fmh\s+/i, ''), s(c.via), s(c.npa, 10), s(c.localita, 80)]);
    const ricollegati = await ricollegaInvianti(session.studioId);
    console.log(`[invianti] creato ${r.id.slice(0, 8)} dalla revisione, ricollegati ${ricollegati}`);
    return NextResponse.json({ id: r.id, ricollegati }, { status: 201 });
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
