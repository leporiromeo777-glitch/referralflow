import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { query } from '@/lib/db';
import { analizza, crea, elencoPdf, zipDi } from '@/lib/dividi/server';
import { vietato } from '@/lib/permessi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Dividi cartella (9.10.2026, [[Piattaforma/Dividi cartella]]): da un PDF unico con tutta la
// cartella ai singoli documenti. La proposta la fa il codice (src/lib/dividi/tagli.ts), la
// conferma una persona. La usa chi ha la sezione (src/lib/permessi.ts): gli stessi che vedono i Documenti.
//   GET  ?paziente=<id>  → i PDF di quel paziente
//   GET  ?documento=<id> → { pagine, con_testo, pezzi proposti }
//   POST { azione: 'crea', documento_id, pezzi, proposti } → { creati }
//   POST { azione: 'zip', ids } → il file .zip
async function chi() {
  const session = await getSession();
  if (!session || !session.studioId) return { no: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'dividi');
  if (no) return { no };
  return { session };
}

export async function GET(req: NextRequest) {
  const c = await chi();
  if (c.no) return c.no;
  const sid = c.session.studioId!;
  const q = req.nextUrl.searchParams;
  const paziente = q.get('paziente') ?? '', doc = q.get('documento') ?? '';
  if (isUuid(doc)) {
    const r = await analizza(sid, c.session.id, doc);
    return 'errore' in r ? NextResponse.json({ errore: r.errore }, { status: r.stato }) : NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (isUuid(paziente)) {
    const [p] = await query<{ id: string }>('select id from patients where id = $1 and studio_id = $2', [paziente, sid]);
    if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });
    return NextResponse.json({ documenti: await elencoPdf(sid, paziente) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ errore: 'Scegli un paziente o un documento.' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const c = await chi();
  if (c.no) return c.no;
  const sid = c.session.studioId!;
  const b = await req.json().catch(() => null);
  const azione = String(b?.azione ?? '');
  if (azione === 'crea') {
    const id = String(b?.documento_id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'documento' }, { status: 400 });
    const r = await crea(sid, c.session.id, id, b?.pezzi, b?.proposti);
    return 'errore' in r ? NextResponse.json({ errore: r.errore }, { status: r.stato }) : NextResponse.json(r, { status: 201 });
  }
  if (azione === 'zip') {
    const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).map(String).filter(isUuid) : [];
    const r = await zipDi(sid, c.session.id, ids);
    if (!Buffer.isBuffer(r)) return NextResponse.json({ errore: r.errore }, { status: r.stato });
    return new NextResponse(r as any, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="documenti.zip"', 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
