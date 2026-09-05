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
  const esito = testo
    ? { stato: 'fatta', testo_fuso: testo, fatta_at: new Date().toISOString() }
    : { stato: 'fallita', errore: String(body?.errore ?? 'sconosciuto').slice(0, 80), fatta_at: new Date().toISOString() };

  await query(
    `update referti_bozze
        set payload = jsonb_set(payload, '{fusione}', (coalesce(payload->'fusione', '{}'::jsonb) || $3::jsonb))
      where id = $1 and studio_id = $2`,
    [params.id, studio.id, JSON.stringify(esito)]
  );
  return NextResponse.json({ ok: true });
}
