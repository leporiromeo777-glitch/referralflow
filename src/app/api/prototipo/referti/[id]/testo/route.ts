import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { registraEvento, impronta } from '@/lib/referti-eventi';

export const dynamic = 'force-dynamic';

// La revisione fatta nel prototipo torna nella piattaforma (13.9.2026): il
// testo ricomposto entra in `testo_finale` della bozza (working draft, come
// «Inserisci nel referto» del wizard), con un evento; la CONFERMA resta nella
// piattaforma, col suo gate.
const MAX_TESTO = 200_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const testo = String(corpo?.testo ?? '').slice(0, MAX_TESTO).trim();
  if (!testo) return NextResponse.json({ errore: 'testo_vuoto' }, { status: 400 });
  const [agg] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3 where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
    [params.id, session.studioId, testo]
  );
  if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
  await registraEvento(session.studioId, params.id, 'testo_salvato', session.id, {
    impronta_testo: impronta(testo), caratteri: testo.length, origine: 'prototipo',
    correzioni: Number.isInteger(corpo?.correzioni) ? corpo.correzioni : undefined,
    verifiche: Number.isInteger(corpo?.verifiche) ? corpo.verifiche : undefined,
  });
  return NextResponse.json({ ok: true });
}
