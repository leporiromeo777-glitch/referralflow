import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { notifySupporto } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// Suggerimenti di modifica dall'interfaccia nuova (14.9.2026). GET: l'elenco
// dello studio. POST `crea`: nuova richiesta (avviso allo sviluppatore senza il
// testo); POST `stato`: l'amministratore la chiude (fatto / no) con risposta.
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const suggerimenti = await query<{ id: string; pagina: string | null; testo: string; stato: string; risposta: string | null; da: string | null; created_at: string; updated_at: string }>(
    `select s.id, s.pagina, s.testo, s.stato, s.risposta, split_part(u.email, '@', 1) as da, s.created_at::text, s.updated_at::text
       from suggerimenti s left join users u on u.id = s.user_id where s.studio_id = $1 order by (s.stato = 'aperto') desc, s.created_at desc limit 200`, [session.studioId]);
  return NextResponse.json({ suggerimenti }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? 'crea');
  if (azione === 'crea') {
    const testo = String(c?.testo ?? '').trim().slice(0, 1000);
    const pagina = String(c?.pagina ?? '').trim().slice(0, 60);
    if (testo.length < 5) return NextResponse.json({ errore: 'Scrivi che cosa vorresti cambiare.' }, { status: 400 });
    const [r] = await query<{ id: string }>(`insert into suggerimenti (studio_id, user_id, pagina, testo) values ($1, $2, nullif($3, ''), $4) returning id`, [session.studioId, session.id, pagina, testo]);
    console.log(`[suggerimenti] nuovo ${r.id.slice(0, 8)} pagina=${pagina || '-'} caratteri=${testo.length}`);
    // Avviso senza il testo: il contenuto si legge nella piattaforma.
    void notifySupporto(`ReferralFlow: suggerimento da ${session.studioNome}`, `Nuovo suggerimento di modifica dallo studio ${session.studioNome}${pagina ? ` (pagina «${pagina}»)` : ''}, ${testo.length} caratteri. Si legge in Studio → Suggerimenti dell'interfaccia nuova.`).catch(() => {});
    return NextResponse.json({ id: r.id }, { status: 201 });
  }
  if (azione === 'stato') {
    if (session.role !== 'admin') return NextResponse.json({ errore: 'Solo l’amministratore.' }, { status: 403 });
    const id = String(c?.id ?? ''); const stato = String(c?.stato ?? '');
    if (!isUuid(id) || !['aperto', 'fatto', 'no'].includes(stato)) return NextResponse.json({ errore: 'dati' }, { status: 400 });
    await query(`update suggerimenti set stato = $3, risposta = nullif($4, ''), updated_at = now() where id = $1 and studio_id = $2`, [id, session.studioId, stato, String(c?.risposta ?? '').trim().slice(0, 500)]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
