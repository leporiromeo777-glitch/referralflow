import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { registraEvento } from '@/lib/referti-eventi';
import { query } from '@/lib/db';
import { aggiungiNovita, annullaAggiornamento, applicaAggiornamento, applicaStampella, scegliLettera, statoAggiornamento } from '@/lib/aggiorna-lettera-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Aggiornamento della lettera vecchia (28.9.2026): la revisione legge la
// proposta, sceglie a mano la lettera se serve, applica o annulla.
//   GET  → stato (richiesta del medico, lettera trovata, proposta, scelte)
//   POST { azione: 'applica', novita: [indici] } | { azione: 'annulla' }
//        { azione: 'scegli', fonte: { tipo, id } | null }
//        { azione: 'stampella' }: la lettera più recente come aiuto (1.10.2026)
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);

async function sessione(id: string) {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'reports');
  if (no) return { errore: no };
  if (!isUuid(id)) return { errore: NextResponse.json({ errore: 'non_trovato' }, { status: 404 }) };
  return { session };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, errore } = await sessione(params.id);
  if (errore) return errore;
  // «Guarda» (2.10.2026): il testo della lettera vecchia quando è un referto
  // confermato dello studio (le lettere in cartella si aprono nel visore).
  const lettera = req.nextUrl.searchParams.get('lettera');
  if (lettera) {
    if (!isUuid(lettera)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const [r] = await query<{ testo: string }>(`select testo_finale as testo from referti_bozze where id = $1 and studio_id = $2 and stato = 'confermata' and testo_finale is not null`, [lettera, session.studioId]);
    if (!r) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    return NextResponse.json({ testo: r.testo }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const s = await statoAggiornamento(session.studioId, params.id);
  if (!s) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  return NextResponse.json(s, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, errore } = await sessione(params.id);
  if (errore) return errore;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const sid = session.studioId;
  if (c?.azione === 'scegli') {
    const f = c.fonte && typeof c.fonte === 'object' && isUuid(String(c.fonte.id ?? '')) && ['referto', 'documento'].includes(String(c.fonte.tipo)) ? { tipo: String(c.fonte.tipo), id: String(c.fonte.id) } : null;
    await scegliLettera(sid, params.id, f);
    return NextResponse.json({ ok: true });
  }
  if (c?.azione === 'applica') {
    const r = await applicaAggiornamento(sid, params.id, session.id, Array.isArray(c.novita) ? c.novita.map(Number) : []);
    if ('errore' in r) return NextResponse.json(r, { status: 409 });
    void registraEvento(sid, params.id, 'lettera_aggiornata', session.id, { novita: Array.isArray(c.novita) ? c.novita.length : 0 });
    return NextResponse.json(r);
  }
  if (c?.azione === 'stampella') {
    const r = await applicaStampella(sid, params.id, session.id, false, true);
    if ('errore' in r) return NextResponse.json(r, { status: 409 });
    void registraEvento(sid, params.id, 'lettera_aggiornata', session.id, { stampella: true });
    return NextResponse.json(r);
  }
  if (c?.azione === 'aggiungi') {
    const r = await aggiungiNovita(sid, params.id, Array.isArray(c.novita) ? c.novita.map(Number) : []);
    if ('errore' in r) return NextResponse.json(r, { status: 409 });
    void registraEvento(sid, params.id, 'lettera_frasi_aggiunte', session.id, { frasi: Array.isArray(c.novita) ? c.novita.length : 0 });
    return NextResponse.json(r);
  }
  if (c?.azione === 'annulla') {
    const r = await annullaAggiornamento(sid, params.id);
    if ('errore' in r) return NextResponse.json(r, { status: 409 });
    void registraEvento(sid, params.id, 'aggiornamento_annullato', session.id, {});
    return NextResponse.json(r);
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
