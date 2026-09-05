import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// La pipeline segnala a che punto è con un dettato della coda (nome della
// fase, nient'altro): la pagina Referti lo mostra come avanzamento. Se la
// fase è «errore», la voce esce dalla coda e viene marcata di conseguenza.

const FASI_VALIDE = new Set([
  'scaricato', 'preprocessing', 'trascrizione_a', 'trascrizione_b',
  'dizionario', 'confronto', 'correzione_llm', 'segreteria',
  'pertinenza', 'senso', 'avvocato', 'riassunto', 'consulto_visita', 'ispezione_llm',
  'bella_copia', 'verificatore', 'rischio', 'struttura', 'estrazione', 'controlli', 'invio', 'errore',
]);

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: 'json_non_valido' }, { status: 400 });
  }
  const fase = typeof body?.fase === 'string' ? body.fase.trim() : '';
  if (!FASI_VALIDE.has(fase)) {
    return NextResponse.json({ errore: 'fase_non_valida' }, { status: 400 });
  }

  await query(
    `update referti_audio
        set fase = $3, fase_at = now(), updated_at = now(),
            stato = case when $3 = 'errore' then 'errore' else 'elaborazione' end
      where id = $1 and studio_id = $2 and stato in ('in_coda', 'elaborazione')`,
    [params.id, studio.id, fase]
  );
  return NextResponse.json({ ok: true });
}
