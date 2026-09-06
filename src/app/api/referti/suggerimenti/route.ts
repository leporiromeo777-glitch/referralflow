import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Suggerimenti per il dizionario della trascrizione, imparati dalle correzioni
// ricorrenti della segreteria. La pipeline sul Mac li legge (GET) e li mostra
// nel pannello: la persona decide se aggiungerli. Quando aggiunti, il pannello
// li segna «applicati» (POST) così spariscono dalla lista.
// Stessa autenticazione dell'endpoint bozze: Bearer token per studio (in tabella
// solo l'hash). I dati restano dentro lo studio (Mac ↔ suo ReferralFlow).

async function studioDaToken(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  return studio?.id ?? null;
}

export async function GET(req: NextRequest) {
  const studioId = await studioDaToken(req);
  if (!studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  const righe = await query<{ da: string; a: string; conteggio: number; tipo: string }>(
    `select da, a, conteggio, tipo from referti_suggerimenti
      where studio_id = $1 and not ignorato and not applicato and conteggio >= 2
      order by conteggio desc, updated_at desc
      limit 100`,
    [studioId]
  );
  return NextResponse.json({ suggerimenti: righe });
}

// Il pannello segnala che una coppia è stata aggiunta al dizionario locale.
export async function POST(req: NextRequest) {
  const studioId = await studioDaToken(req);
  if (!studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: 'json_non_valido' }, { status: 400 });
  }
  const da = typeof body?.da === 'string' ? body.da.trim().slice(0, 200) : '';
  const a = typeof body?.a === 'string' ? body.a.trim().slice(0, 200) : '';
  if (!da || !a) return NextResponse.json({ errore: 'coppia_mancante' }, { status: 400 });

  await query(
    'update referti_suggerimenti set applicato = true where studio_id = $1 and da = $2 and a = $3',
    [studioId, da, a]
  );
  return NextResponse.json({ ok: true });
}
