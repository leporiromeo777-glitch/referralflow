import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { puliscoMedici } from '@/lib/referti-medici';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Elenco dei medici che dettano (2026-09-07): lo pubblica il servizio sul
// Mac dello studio (medici.json è la fonte di verità) col token referti,
// come la coda. La pagina Referti lo usa per far scegliere chi ha dettato;
// la pipeline legge poi il profilo dal marcatore nel nome del file. Solo
// nomi di medici e etichette: mai contenuti clinici, niente nei log.

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: 'json_non_valido' }, { status: 400 });
  }
  const medici = puliscoMedici(body?.medici);
  await query('update studios set referti_medici = $2::jsonb where id = $1', [studio.id, JSON.stringify(medici)]);
  return NextResponse.json({ ok: true, n: medici.length });
}
