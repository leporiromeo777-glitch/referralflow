import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { query } from '@/lib/db';
import { vietato } from '@/lib/permessi';
import { getFile } from '@/lib/storage';
import { dettaglio, puoSat } from '@/lib/saturazione/archivio';

export const dynamic = 'force-dynamic';

// Una registrazione della saturazione notturna (22.10.2026): le notti con le curve e i totali.
//   GET              → il dettaglio
//   GET ?referto=1   → il referto di un invio che aspetta di essere assegnato (per guardarlo prima di dire di chi è);
//                      una volta assegnato il referto sta fra i documenti del paziente.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const v = vietato(session.role, 'saturazione');
  if (v) return v;
  if (!puoSat(session.role, 'vedere')) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
  if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  if (req.nextUrl.searchParams.get('referto') === '1') {
    const [r] = await query<{ referto_key: string | null; referto_nome: string | null }>(
      `select referto_key, referto_nome from sat_registrazioni where id = $1 and studio_id = $2 and stato = 'in_attesa'`, [id, session.studioId]);
    if (!r?.referto_key) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    try {
      const f = await getFile(r.referto_key);
      const pdf = /\.pdf$/i.test(r.referto_nome ?? '');
      return new NextResponse(new Uint8Array(f.body), { headers: {
        'Content-Type': pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': pdf ? 'inline; filename="rapporto.pdf"' : 'attachment; filename="rapporto.docx"', 'Cache-Control': 'no-store' } });
    } catch { return NextResponse.json({ errore: 'non_trovato' }, { status: 404 }); }
  }
  const d = await dettaglio(session.studioId, id);
  if (!d) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  return NextResponse.json(d, { headers: { 'Cache-Control': 'no-store' } });
}
