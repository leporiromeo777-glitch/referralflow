import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Voci di dizionario CONFERMATE dall'admin nel cruscotto Qualità AI
// (11.9.2026): il servizio sul Mac dello studio le legge col token referti
// (come la coda e i medici) e le scrive in correzioni-<medico>-piattaforma.json.
// Solo coppie di parole «sbagliato → giusto» per medico: mai cifre, mai
// contenuti clinici, niente nei log.
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

  const righe = await query<{ medico: string; da: string; a: string }>(
    `select medico, da, a from referti_dizionario where studio_id = $1 and stato = 'confermata' order by medico, da`,
    [studio.id]
  );
  const voci: Record<string, Record<string, string>> = {};
  for (const r of righe) {
    if (!/^[a-z0-9-]{1,40}$/.test(r.medico) || /\d/.test(r.da + r.a)) continue;
    (voci[r.medico] ??= {})[r.da] = r.a;
  }
  return NextResponse.json({ voci, n: righe.length });
}
