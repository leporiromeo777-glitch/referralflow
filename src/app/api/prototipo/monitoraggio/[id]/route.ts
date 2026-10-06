import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { vistaTecnica } from '@/lib/monitoraggio/catalogo';
import { dettaglio, pezziEcg } from '@/lib/monitoraggio/archivio';

export const dynamic = 'force-dynamic';

// Un paziente monitorato: parametri, serie nell'intervallo, avvisi e azioni.
//   GET ?intervallo=15m | 1h | 24h          oppure  ?da=<ISO>&a=<ISO>
//   GET ?ecg=1&da=<ISO>&secondi=<n>          i pezzi del tracciato da lì in poi
const INTERVALLI: Record<string, number> = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 };

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const v = vietato(session.role, 'monitoraggio');
  if (v) return v;
  if (!isUuid(id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const no = { headers: { 'Cache-Control': 'no-store' } };
  if (q.get('ecg')) {
    if (vistaTecnica(session.role)) return NextResponse.json({ errore: 'Il tracciato lo vede chi cura.' }, { status: 403 });
    const da = new Date(q.get('da') ?? '');
    if (Number.isNaN(da.getTime())) return NextResponse.json({ errore: 'da' }, { status: 400 });
    return NextResponse.json({ ora: new Date(), pezzi: await pezziEcg(session.studioId, id, da, Number(q.get('secondi')) || 30) }, no);
  }
  const adesso = new Date();
  let da = new Date(q.get('da') ?? ''), a = new Date(q.get('a') ?? '');
  if (Number.isNaN(da.getTime()) || Number.isNaN(a.getTime()) || a <= da) {
    a = adesso;
    da = new Date(adesso.getTime() - (INTERVALLI[q.get('intervallo') ?? '1h'] ?? 60) * 60_000);
  }
  if (a.getTime() - da.getTime() > 7 * 86_400_000) da = new Date(a.getTime() - 7 * 86_400_000);
  const d = await dettaglio(session.studioId, id, session.role, { da, a }, adesso);
  return d ? NextResponse.json(d, no) : NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
}
