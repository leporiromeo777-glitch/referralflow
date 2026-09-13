import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { confermaBozzaCore } from '@/lib/referti-conferma';

export const dynamic = 'force-dynamic';

// Conferma del referto dall'interfaccia nuova (13.9.2026): stesso cuore della
// piattaforma (gate con presa d'atto, audit, misura, suggerimenti, evento).
// I campi confermati sono quelli già in bozza (confermati, o estratti dalla
// catena), eventualmente corretti nel corpo della richiesta.
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin']);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const testo = String(corpo?.testo ?? '').trim();
  const [b] = await query<{ campi_confermati: Record<string, unknown> | null; payload: any }>(
    `select campi_confermati, payload from referti_bozze where id = $1 and studio_id = $2 and stato = 'bozza'`, [params.id, session.studioId]);
  if (!b) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
  const campi: Record<string, string> = {};
  const base = (b.campi_confermati && Object.keys(b.campi_confermati).length ? b.campi_confermati : b.payload?.campi_estratti) ?? {};
  for (const [k, v] of Object.entries(base as Record<string, unknown>)) if (typeof v === 'string') campi[k] = v;
  if (corpo?.campi && typeof corpo.campi === 'object') for (const [k, v] of Object.entries(corpo.campi as Record<string, unknown>)) if (typeof v === 'string') campi[k] = v;
  const manifesto = b.payload?.manifesto && typeof b.payload.manifesto === 'object' ? b.payload.manifesto : {};
  const esito = await confermaBozzaCore({
    studioId: session.studioId, userId: session.id, ruoloUtente: session.role, id: params.id, testo, campi,
    tele: {
      tempo_revisione_s: corpo?.tempo_revisione_s, flag_totali: corpo?.flag_totali, flag_accettati_senza_riascolto: corpo?.flag_accettati_senza_riascolto,
      flag_critici_totali: corpo?.flag_critici_totali, flag_critici_chiusi: corpo?.flag_critici_chiusi,
      revisione_iniziata_at: typeof corpo?.revisione_iniziata_at === 'string' ? corpo.revisione_iniziata_at : null,
      livello_verifica: typeof manifesto.livello_verifica === 'string' ? manifesto.livello_verifica : '',
      presa_atto: corpo?.presa_atto === true, origine: 'prototipo',
    },
  });
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: esito.errore === 'critici' ? 412 : esito.errore === 'testo' ? 400 : 409 });
  return NextResponse.json({ ok: true });
}
