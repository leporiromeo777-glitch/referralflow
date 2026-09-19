import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { costruisciRevisione } from '@/lib/prototipo-revisione';
import { formatoPerBozza } from '@/lib/referti-medici';
import { rilevaRichiamo } from '@/lib/referti-richiami';

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
            (select a.id from referti_audio a where a.bozza_id = b.id and a.aggiunge_a is null order by a.created_at asc limit 1) as audio_id
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
  // Formato del medico che ha dettato (lettera o rapporto a sezioni), per il
  // tasto «Impagina» della revisione.
  let formato: 'rapporto' | 'lettera' = 'rapporto';
  try { formato = await formatoPerBozza(session.studioId, p.medico ?? null); } catch { formato = 'rapporto'; }
  // Le tracce (19.9.2026): la prima è l'audio della bozza, le altre sono
  // quelle aggiunte dopo, ognuna con lo spostamento sulla linea del tempo.
  // Il riascolto le suona di seguito come se fossero un file solo.
  const altre = await query<{ id: string; created_at: string }>(
    `select id, created_at::text from referti_audio where bozza_id = $1 and aggiunge_a is not null and stato = 'fatto' order by created_at asc`, [b.id]);
  const spostamenti = new Map<string, number>((Array.isArray(p.tracce) ? p.tracce : []).map((t: any) => [String(t.audio_id), Number(t.offset) || 0]));
  const tracce = [
    ...(b.audio_id ? [{ id: b.audio_id, url: `/api/referti/audio/${b.audio_id}`, offset: 0 }] : []),
    ...altre.filter((a) => spostamenti.has(a.id)).map((a) => ({ id: a.id, url: `/api/referti/audio/${a.id}`, offset: spostamenti.get(a.id) ?? 0 })),
  ];
  const [inArrivo] = await query<{ n: number }>(`select count(*)::int as n from referti_audio where aggiunge_a = $1 and stato in ('in_coda', 'elaborazione')`, [b.id]);

  return NextResponse.json({
    id: b.id,
    stato: b.stato,
    formato,
    tracce,
    tracce_in_arrivo: inArrivo?.n ?? 0,
    campi: { nome_paziente: campo('nome_paziente'), data_nascita: campo('data_nascita'), medico_destinatario: campo('medico_destinatario'), medico_inviante: campo('medico_inviante') },
    richiamo: p.richiamo && typeof p.richiamo === 'object' ? { mesi: Number(p.richiamo.mesi), creato_at: p.richiamo.creato_at ?? null } : null,
    richiamo_proposto: p.richiamo ? null : rilevaRichiamo([(b.testo_finale ?? p.testo_corretto ?? '') as string, ...(Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown) => typeof n === 'string') : [])]),
    revisione_prototipo: p.revisione_prototipo && typeof p.revisione_prototipo === 'object' ? p.revisione_prototipo : null,
    livello_verifica: typeof p.manifesto?.livello_verifica === 'string' ? p.manifesto.livello_verifica : 'pieno',
    medico_id: typeof p.medico?.id === 'string' ? p.medico.id : null,
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
