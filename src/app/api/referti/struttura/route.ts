import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { avviaRiorganizzazione, statoRiorganizzazione } from '@/lib/referto-struttura';
import { registraPassoApp } from '@/lib/audit/lineage';
import { ruoloRevisore } from '@/lib/audit/revisione';
import { opzioniRiorganizzazione } from '@/lib/referti-formato';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Riorganizza nel formato standard (AI)» con barra di avanzamento:
// POST avvia il lavoro (uno solo per bozza), GET ne riferisce lo stato.
// Il modello locale impiega minuti sul Mac dello studio: la pagina
// interroga lo stato invece di restare appesa. Mai contenuti nei log.

const MAX_TESTO = 40_000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: 'json_non_valido' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!isUuid(id)) return NextResponse.json({ errore: 'id_non_valido' }, { status: 400 });

  const [b] = await query<{ testo_finale: string | null; payload: any; campi_confermati: Record<string, unknown> | null }>(
    `select testo_finale, payload, campi_confermati from referti_bozze
      where id = $1 and studio_id = $2 and stato = 'bozza'`,
    [id, session.studioId]
  );
  if (!b) return NextResponse.json({ errore: 'non_trovata' }, { status: 404 });

  // Parte dal testo COME LO VEDE l'utente nella casella (correzioni non
  // ancora confermate comprese); in mancanza, da quanto salvato.
  const testo = (
    (typeof body?.testo === 'string' ? body.testo : '').trim() ||
    ((b.testo_finale ?? b.payload?.testo_corretto ?? '') as string).trim()
  ).slice(0, MAX_TESTO);
  if (!testo) return NextResponse.json({ errore: 'testo_mancante' }, { status: 400 });

  const studioId = session.studioId;
  // Formato del medico che ha dettato (rapporto a sezioni o lettera) e, per
  // la lettera, saluto/firma dal profilo e terapia dalla lettera precedente.
  const { formato, opzioni, terapiaRipresa } = await opzioniRiorganizzazione(studioId, id, b.payload, b.campi_confermati, testo);
  const avviato = avviaRiorganizzazione(id, testo, async (nuovo) => {
    await query(
      `update referti_bozze set testo_finale = $3,
              payload = jsonb_set(payload, '{riorganizzazione}', $4::jsonb)
        where id = $1 and studio_id = $2 and stato = 'bozza'`,
      [id, studioId, nuovo, JSON.stringify({ formato, terapia_ripresa: terapiaRipresa, at: new Date().toISOString() })]
    );
  }, formato, opzioni, async (esito, inizio, prompt) => {
    await registraPassoApp({
      studioId, bozzaId: id, nome: formato === 'lettera' ? 'impaginazione_lettera' : 'riorganizzazione_rapporto',
      tipo: 'report_structuring', modello: process.env.REFERTO_STRUTTURA_LLM || 'gemma3:27b', provider: 'local',
      promptNome: formato === 'lettera' ? 'impaginazione_lettera' : 'riorganizzazione_rapporto', promptTesto: prompt,
      ingresso: testo, uscita: esito.ok ? esito.testo : null, inizio, stato: esito.ok ? 'SUCCESS' : 'FAILED',
      errore: esito.ok ? undefined : esito.motivo, producerIngresso: ruoloRevisore(session.role),
      metadata: esito.ok ? { parole_aggiunte: esito.aggiunte } : { motivo: esito.motivo, aggiunte: esito.aggiunte ?? [] },
    });
  });
  // Già in corso = va bene lo stesso: la pagina si aggancia al lavoro vivo.
  return NextResponse.json({ avviato }, { status: avviato ? 202 : 200 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!isUuid(id)) return NextResponse.json({ errore: 'id_non_valido' }, { status: 400 });
  const [b] = await query<{ id: string }>(
    'select id from referti_bozze where id = $1 and studio_id = $2',
    [id, session.studioId]
  );
  if (!b) return NextResponse.json({ errore: 'non_trovata' }, { status: 404 });
  return NextResponse.json(statoRiorganizzazione(id) ?? { stato: 'assente', percento: 0 });
}
