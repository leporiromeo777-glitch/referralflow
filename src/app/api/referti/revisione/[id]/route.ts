import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Salvataggio automatico della revisione guidata (2026-09-07, richiesta
// dell'utente: le correzioni non devono sparire uscendo dal referto). Il
// wizard manda il suo stato (frasi, spente, segnalazioni chiuse, passo,
// campi) a ogni modifica; qui finisce in `revisione_stato`, il testo
// composto in `testo_finale` e i campi in `campi_confermati` — come
// «Inserisci nel referto», ma da solo. Solo bozze aperte dello studio.
// Mai contenuti nei log.

const MAX_CORPO = 400_000;
const MAX_TESTO = 200_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  const grezzo = await req.text().catch(() => '');
  if (!grezzo || grezzo.length > MAX_CORPO) return NextResponse.json({ errore: 'corpo' }, { status: 400 });
  let corpo: any;
  try { corpo = JSON.parse(grezzo); } catch { return NextResponse.json({ errore: 'json' }, { status: 400 }); }
  const st = corpo?.stato;
  if (!st || typeof st !== 'object' || st.v !== 1 || typeof st.testo_base !== 'string'
      || !Array.isArray(st.frasi) || !st.frasi.every((f: unknown) => typeof f === 'string')
      || !Array.isArray(st.spente) || !st.spente.every((n: unknown) => Number.isInteger(n))
      || !Array.isArray(st.fatte) || !st.fatte.every((f: unknown) => typeof f === 'string')
      || !Array.isArray(st.modificate) || !st.modificate.every((n: unknown) => Number.isInteger(n))
      || (st.testo_libero !== null && typeof st.testo_libero !== 'string')
      || !Number.isInteger(st.passo) || !Number.isInteger(st.n_frasi)
      || typeof st.campi !== 'object' || st.campi === null) {
    return NextResponse.json({ errore: 'stato' }, { status: 400 });
  }
  const testo = String(corpo.testo ?? '').slice(0, MAX_TESTO);
  const campi: Record<string, string> = {};
  for (const [k, v] of Object.entries(st.campi as Record<string, unknown>)) {
    if (typeof v === 'string') campi[k.slice(0, 80)] = v.trim().slice(0, 2000);
  }
  const stato = {
    v: 1,
    testo_base: st.testo_base,
    n_frasi: st.n_frasi,
    frasi: st.frasi,
    spente: st.spente,
    fatte: st.fatte.slice(0, 2000),
    modificate: st.modificate,
    testo_libero: st.testo_libero,
    passo: st.passo,
    chiuse: Number.isInteger(st.chiuse) ? st.chiuse : 0,
    chiuse_senza_riascolto: Number.isInteger(st.chiuse_senza_riascolto) ? st.chiuse_senza_riascolto : 0,
    riascolti: Number.isInteger(st.riascolti) ? st.riascolti : 0,
    campi,
    salvato_il: new Date().toISOString(),
    utente: session.id,
  };
  const conCampi = Object.keys(campi).length > 0;
  const [agg] = await query<{ id: string }>(
    `update referti_bozze
        set revisione_stato = $3::jsonb,
            testo_finale = case when $4 <> '' then $4 else testo_finale end,
            campi_confermati = case when $5::boolean then $6::jsonb else campi_confermati end
      where id = $1 and studio_id = $2 and stato = 'bozza'
      returning id`,
    [params.id, session.studioId, JSON.stringify(stato), testo.trim() ? testo : '', conCampi, JSON.stringify(campi)]
  );
  if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
  return NextResponse.json({ ok: true, salvato_il: stato.salvato_il });
}
