import { NextResponse } from 'next/server';
import { confronta, type Confronto } from '@/lib/dettato-confronto';
import { impronta } from '@/lib/referti-eventi';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { costruisciRevisione } from '@/lib/prototipo-revisione';
import { formatoPerBozza } from '@/lib/referti-medici';
import { rilevaRichiamo } from '@/lib/referti-richiami';
import { vietato } from '@/lib/permessi';
import { vociValide } from '@/lib/formattazione';

export const dynamic = 'force-dynamic';

// Una bozza vera nel modello della «Guided Review» del prototipo: audio,
// trascrizione a segmenti con i tempi, referto a span con fonte, issue con
// evidenza, marker. Sessione del browser.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'reports');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
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
  // Il testo scritto da un programma di dettatura mentre si registrava (11.10.2026), messo a confronto con le parole
  // che la catena ha ricavato dall'audio: dove non coincidono c'è un punto da riascoltare.
  let dettato: (Confronto & { fonte: string; foglio: boolean; in_attesa: boolean }) | null = null;
  if (b.audio_id) {
    const [dt] = await query<{ dettato_testo: string | null; dettato_fonte: string | null }>('select dettato_testo, dettato_fonte from referti_audio where id = $1 and studio_id = $2', [b.audio_id, session.studioId]);
    // `in_attesa` (19.10.2026): la lettera del foglio è già in revisione ma le parole del Mac non sono ancora arrivate —
    // nessun confronto (senza di esse ogni parola risulterebbe «diversa»).
    const inAttesa = !Array.isArray(p.parole) || !p.parole.length;
    if (dt?.dettato_testo) dettato = { ...(inAttesa ? { pezzi: [], parole_dettato: 0, parole_mac: 0, uguali: 0, punti: 0, troncato: false } : confronta(dt.dettato_testo, p.parole)), fonte: dt.dettato_fonte ?? 'dettatura', foglio: !!p.foglio, in_attesa: inAttesa && p.controllo_audio === 'in_corso' };      // foglio: la lettera in revisione È quella dettata (src/lib/dittafono-foglio.ts)
  }
  const [inArrivo] = await query<{ n: number }>(`select count(*)::int as n from referti_audio where aggiunge_a = $1 and stato in ('in_coda', 'elaborazione')`, [b.id]);

  return NextResponse.json({
    id: b.id,
    stato: b.stato,
    impronta: impronta((b.testo_finale ?? p.testo_corretto ?? '') as string),
    // Quale versione si sta guardando (28.9.2026): ora dell'ultimo salvataggio
    // e lunghezza, in testa alla revisione.
    versione: await (async () => {
      const testo = (b.testo_finale ?? p.testo_corretto ?? '') as string;
      const [e] = await query<{ quando: string }>(`select created_at::text as quando from referti_eventi where bozza_id = $1 and azione = 'testo_salvato' order by created_at desc limit 1`, [b.id]);
      return { salvata_il: b.testo_finale != null ? e?.quando ?? null : null, caratteri: testo.length, dalla_catena: b.testo_finale == null };
    })(),
    formato,
    tracce,
    tracce_in_arrivo: inArrivo?.n ?? 0,
    campi: { nome_paziente: campo('nome_paziente'), data_nascita: campo('data_nascita'), medico_destinatario: campo('medico_destinatario'), medico_inviante: campo('medico_inviante'),
      // la copia per conoscenza, solo se scritta (dal foglio o in revisione): vuota non vuol dire «nessuna», vuol dire «dal dettato»
      ...(typeof b.campi_confermati?.copia_conoscenza === 'string' ? { copia_conoscenza: b.campi_confermati.copia_conoscenza } : {}) },
    richiamo: p.richiamo && typeof p.richiamo === 'object' ? { mesi: Number(p.richiamo.mesi), creato_at: p.richiamo.creato_at ?? null } : null,
    richiamo_proposto: p.richiamo ? null : rilevaRichiamo([(b.testo_finale ?? p.testo_corretto ?? '') as string, ...(Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown) => typeof n === 'string') : [])]),
    revisione_prototipo: p.revisione_prototipo && typeof p.revisione_prototipo === 'object' ? p.revisione_prototipo : null,
    // Seconda traccia con istruzioni (29.9.2026): stato ed esiti, senza il testo di prima.
    istruzioni_traccia: p.istruzioni_traccia && typeof p.istruzioni_traccia === 'object'
      ? { stato: p.istruzioni_traccia.stato, testo: p.istruzioni_traccia.testo, note: p.istruzioni_traccia.note ?? [], esiti: p.istruzioni_traccia.esiti ?? [], non_capite: p.istruzioni_traccia.non_capite ?? [], fatta_il: p.istruzioni_traccia.fatta_il ?? null }
      : null,
    // Con la catena leggera il manifesto parla del testo del Mac, che non è la lettera: non vale per la conferma.
    livello_verifica: p.catena_leggera ? 'pieno' : typeof p.manifesto?.livello_verifica === 'string' ? p.manifesto.livello_verifica : 'pieno',
    catena_leggera: p.catena_leggera === true,
    medico_id: typeof p.medico?.id === 'string' ? p.medico.id : null,
    tipo: b.tipo,
    paziente: campo('nome_paziente') || null,
    nascita: campo('data_nascita') || null,
    medico: typeof p.medico?.nome === 'string' ? p.medico.nome : null,
    dettato_il: p.dettato_il ?? b.created_at,
    fiducia: p.fiducia ?? null,
    note_segreteria: Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown) => typeof n === 'string') : [],
    dettato,
    // Il testo com'è, coi suoi paragrafi: la revisione semplice delle lettere dettate sul foglio lo mostra e lo corregge così (15.10.2026).
    testo_attuale: (b.testo_finale ?? p.testo_corretto ?? '') as string,
    // grassetto, corsivo, sottolineato messi con la barra della revisione (20.10.2026)
    formattazione: vociValide(p.formattazione) ?? [],
    ...rev,
  });
}
