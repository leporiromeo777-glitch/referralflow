import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Esito di una fusione (lettera incrementale) consegnato dalla pipeline:
// {testo_fuso} oppure {errore}. Il testo resta una PROPOSTA nel payload:
// entra nel referto solo quando una persona preme «Applica».

const MAX_TESTO = 200_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'id_non_valido' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: 'json_non_valido' }, { status: 400 });
  }
  const testo = typeof body?.testo_fuso === 'string' ? body.testo_fuso.slice(0, MAX_TESTO) : '';
  // Provenienza per riga (dettato / precedente / aggiornato / modello /
  // misto) e riepilogo dei conteggi: alimentano i badge e la vista
  // «cosa è cambiato». Solo valori dell'insieme ammesso.
  const AMMESSE = new Set(['', 'dettato', 'precedente', 'aggiornato', 'modello', 'misto']);
  const provenienza = (Array.isArray(body?.provenienza) ? body.provenienza.slice(0, 4000) : [])
    .map((v: unknown) => (typeof v === 'string' && AMMESSE.has(v) ? v : ''));
  const riepilogo: Record<string, number> = {};
  if (body?.riepilogo && typeof body.riepilogo === 'object') {
    for (const [k, v] of Object.entries(body.riepilogo)) {
      if (AMMESSE.has(k) && typeof v === 'number' && Number.isFinite(v)) riepilogo[k] = Math.round(v);
    }
  }
  // Variazioni delle misure tra lettera precedente e dettato («cosa è
  // cambiato» sui numeri): misura, prima, dopo.
  const variazioni = (Array.isArray(body?.variazioni) ? body.variazioni.slice(0, 20) : [])
    .filter((v: unknown): v is { misura: string; prima: string; dopo: string } =>
      !!v && typeof v === 'object' && typeof (v as any).misura === 'string'
      && typeof (v as any).prima === 'string' && typeof (v as any).dopo === 'string')
    .map((v: { misura: string; prima: string; dopo: string }) => ({ misura: v.misura.slice(0, 40), prima: v.prima.slice(0, 20), dopo: v.dopo.slice(0, 20) }));
  const esito = testo
    ? { stato: 'fatta', testo_fuso: testo, provenienza, riepilogo, variazioni, fatta_at: new Date().toISOString() }
    : { stato: 'fallita', errore: String(body?.errore ?? 'sconosciuto').slice(0, 80), fatta_at: new Date().toISOString() };

  await query(
    `update referti_bozze
        set payload = jsonb_set(payload, '{fusione}', (coalesce(payload->'fusione', '{}'::jsonb) || $3::jsonb))
      where id = $1 and studio_id = $2`,
    [params.id, studio.id, JSON.stringify(esito)]
  );
  return NextResponse.json({ ok: true });
}
