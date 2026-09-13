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
const MAX_STATO = 300_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const testo = String(corpo?.testo ?? '').slice(0, MAX_TESTO).trim();
  // Stato della revisione del prototipo (verifiche chiuse, correzioni per
  // frase, frasi tolte/aggiunte, metriche): vive in payload.revisione_prototipo
  // così la coda lo vede come «rivisto» e la riapertura riparte da lì.
  const stato = corpo?.stato && typeof corpo.stato === 'object' ? corpo.stato : null;
  const statoJson = stato ? JSON.stringify({ ...stato, salvato_il: new Date().toISOString(), utente: session.id }).slice(0, MAX_STATO) : null;
  if (statoJson && statoJson.length >= MAX_STATO) return NextResponse.json({ errore: 'stato_troppo_grande' }, { status: 413 });
  // Campi estratti confermati o corretti (paziente, nascita, destinatario…).
  const campi: Record<string, string> = {};
  if (corpo?.campi && typeof corpo.campi === 'object') for (const [k, v] of Object.entries(corpo.campi as Record<string, unknown>)) if (typeof v === 'string' && /^[a-z_]{1,40}$/.test(k)) campi[k] = v.trim().slice(0, 2000);
  if (Object.keys(campi).length) {
    await query(`update referti_bozze set campi_confermati = coalesce(campi_confermati, '{}'::jsonb) || $3::jsonb where id = $1 and studio_id = $2 and stato = 'bozza'`, [params.id, session.studioId, JSON.stringify(campi)]);
    if (!testo && !statoJson) return NextResponse.json({ ok: true, solo_campi: true });
  }
  if (!testo && !statoJson) return NextResponse.json({ errore: 'testo_vuoto' }, { status: 400 });
  if (!testo) {
    const [agg] = await query<{ id: string }>(
      `update referti_bozze set payload = jsonb_set(payload, '{revisione_prototipo}', $3::jsonb) where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
      [params.id, session.studioId, statoJson]);
    if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
    return NextResponse.json({ ok: true, solo_stato: true });
  }
  const [agg] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3, payload = case when $4::jsonb is null then payload else jsonb_set(payload, '{revisione_prototipo}', $4::jsonb) end
      where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
    [params.id, session.studioId, testo, statoJson]
  );
  if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
  await registraEvento(session.studioId, params.id, 'testo_salvato', session.id, {
    impronta_testo: impronta(testo), caratteri: testo.length, origine: 'prototipo',
    correzioni: Number.isInteger(corpo?.correzioni) ? corpo.correzioni : undefined,
    verifiche: Number.isInteger(corpo?.verifiche) ? corpo.verifiche : undefined,
  });
  return NextResponse.json({ ok: true });
}
