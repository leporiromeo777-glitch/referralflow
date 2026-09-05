import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lettera incrementale (2026-09-05): la pagina Referti chiede di fondere il
// dettato con la lettera precedente del paziente; la pipeline sul Mac dello
// studio preleva da qui le richieste in attesa (token referti, come la
// coda) e rimanda la lettera aggiornata su /api/referti/fusioni/[id].
// Mai contenuti nei log.
// Il «dettato» è il testo di OGGI: se una fusione è già stata applicata,
// testo_finale contiene la lettera fusa e il dettato vero è in
// payload.testo_prima_della_fusione (altrimenti si fonderebbe due volte).

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  const righe = await query<{ id: string; dettato: string | null; lettera_precedente: string | null }>(
    `select id,
            coalesce(payload->>'testo_prima_della_fusione', testo_finale, payload->>'testo_corretto') as dettato,
            payload->'fusione'->>'lettera_precedente' as lettera_precedente
       from referti_bozze
      where studio_id = $1
        and payload->'fusione'->>'stato' = 'in_attesa'
      order by (payload->'fusione'->>'richiesta_at') asc nulls last
      limit 3`,
    [studio.id]
  );
  // Segnate «in_lavorazione» subito: una sola consegna per richiesta.
  for (const r of righe) {
    await query(
      `update referti_bozze
          set payload = jsonb_set(payload, '{fusione,stato}', '"in_lavorazione"')
        where id = $1 and studio_id = $2`,
      [r.id, studio.id]
    );
  }
  return NextResponse.json({
    fusioni: righe
      .filter((r) => r.dettato && r.lettera_precedente)
      .map((r) => ({ id: r.id, dettato: r.dettato, lettera_precedente: r.lettera_precedente })),
  });
}
