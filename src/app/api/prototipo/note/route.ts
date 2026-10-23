import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';

export const dynamic = 'force-dynamic';

// Le note degli aiuti medici (23.10.2026, dallo studio: «nella home dell'aiuto medico una sezione note che vedono
// tutte tra di loro»). Una bacheca per studio, nella home dell'aiuto medico.
//   GET   → le note aperte e quelle fatte negli ultimi sette giorni
//   POST  { azione: 'aggiungi', testo } | { azione: 'fatta', id, fatta } | { azione: 'togli', id }
// Segnare «fatta» lo può chiunque la veda; togliere una nota solo chi l'ha scritta (o il tecnico). Nei log nessun testo.
const RUOLI = new Set(['assistente', 'tecnico']);
const no = { headers: { 'Cache-Control': 'no-store' } };
const nomeDa = (email: string | null) => (email ? email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Un accesso tolto');

async function sessione() {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  if (!RUOLI.has(session.role)) return { errore: NextResponse.json({ errore: 'Le note sono degli aiuti medici.' }, { status: 403 }) };
  return { session };
}

async function elenco(studioId: string, io: string) {
  const righe = await query<{ id: string; testo: string; creata_il: string; fatta_il: string | null; autore_id: string | null; autore: string | null; fatta_da: string | null }>(
    `select n.id, n.testo, n.creata_il, n.fatta_il, n.autore_id, ua.email as autore, uf.email as fatta_da
       from note_bacheca n left join users ua on ua.id = n.autore_id left join users uf on uf.id = n.fatta_da
      where n.studio_id = $1 and (n.fatta_il is null or n.fatta_il > now() - interval '7 days')
      order by (n.fatta_il is not null), n.creata_il desc limit 200`, [studioId]);
  return righe.map((r) => ({ id: r.id, testo: r.testo, creata_il: r.creata_il, fatta_il: r.fatta_il, autore: nomeDa(r.autore), mia: r.autore_id === io, fatta_da: r.fatta_il ? nomeDa(r.fatta_da) : null }));
}

export async function GET() {
  const s = await sessione(); if ('errore' in s) return s.errore;
  return NextResponse.json({ note: await elenco(s.session.studioId, s.session.id) }, no);
}

export async function POST(req: Request) {
  const s = await sessione(); if ('errore' in s) return s.errore;
  const { session } = s;
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  if (azione === 'aggiungi') {
    const testo = String(c?.testo ?? '').replace(/\r/g, '').trim();
    if (!testo) return NextResponse.json({ errore: 'Scrivi la nota.' }, { status: 400 });
    if (testo.length > 2000) return NextResponse.json({ errore: 'La nota è troppo lunga (al massimo 2000 caratteri).' }, { status: 400 });
    await query(`insert into note_bacheca (studio_id, autore_id, testo) values ($1, $2, $3)`, [session.studioId, session.id, testo]);
  } else if (azione === 'fatta' || azione === 'togli') {
    const id = String(c?.id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    const r = azione === 'fatta'
      ? await query(`update note_bacheca set fatta_il = case when $3 then now() end, fatta_da = case when $3 then $4::uuid end where id = $1 and studio_id = $2 returning id`, [id, session.studioId, c?.fatta !== false, session.id])
      : await query(`delete from note_bacheca where id = $1 and studio_id = $2 and (autore_id = $3 or $4) returning id`, [id, session.studioId, session.id, session.role === 'tecnico']);
    if (!r.length) return NextResponse.json({ errore: azione === 'togli' ? 'Una nota la toglie solo chi l’ha scritta.' : 'Nota non trovata.' }, { status: azione === 'togli' ? 403 : 404 });
  } else return NextResponse.json({ errore: 'azione' }, { status: 400 });
  console.log(`[note] ${azione}`);
  return NextResponse.json({ ok: true, note: await elenco(session.studioId, session.id) }, no);
}
