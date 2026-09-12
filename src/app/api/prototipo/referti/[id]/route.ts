import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { costruisciRevisione } from '@/lib/prototipo-revisione';

export const dynamic = 'force-dynamic';

// Una bozza vera nel modello della «Guided Review» del prototipo: audio,
// trascrizione a segmenti con i tempi, referto a span con fonte, issue con
// evidenza, marker. Sessione del browser.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const [b] = await query<{
    id: string; stato: string; tipo: string; created_at: string; testo_finale: string | null; payload: any; campi_confermati: any; audio_id: string | null;
  }>(
    `select b.id, b.stato, b.tipo, b.created_at::text, b.testo_finale, b.payload, b.campi_confermati,
            (select a.id from referti_audio a where a.bozza_id = b.id order by a.created_at desc limit 1) as audio_id
       from referti_bozze b where b.id = $1 and b.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!b) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const p = b.payload ?? {};
  const campo = (k: string) => {
    const v = b.campi_confermati?.[k] ?? p.campi_estratti?.[k];
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.toLowerCase() !== 'non indicato' ? s : '';
  };
  const rev = costruisciRevisione({
    testo: (b.testo_finale ?? p.testo_corretto ?? '') as string,
    parole: Array.isArray(p.parole) ? p.parole : [],
    payload: p,
    audioUrl: b.audio_id ? `/api/referti/audio/${b.audio_id}` : null,
  });
  return NextResponse.json({
    id: b.id,
    stato: b.stato,
    tipo: b.tipo,
    paziente: campo('nome_paziente') || null,
    nascita: campo('data_nascita') || null,
    medico: typeof p.medico?.nome === 'string' ? p.medico.nome : null,
    dettato_il: p.dettato_il ?? b.created_at,
    fiducia: p.fiducia ?? null,
    note_segreteria: Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown) => typeof n === 'string') : [],
    ...rev,
  });
}
