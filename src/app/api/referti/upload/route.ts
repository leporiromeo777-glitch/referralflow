import { vietato } from '@/lib/permessi';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { putFile } from '@/lib/storage';
import { mediciDelloStudio } from '@/lib/referti-medici';
import { ESTENSIONI_DITTAFONO, wavDaDittafono } from '@/lib/dittafono';
import { TIPI_AUDIO, MAX_BYTES_AUDIO } from '@/lib/referti-audio-tipi';
import { pulisciFoglio } from '@/lib/dittafono-foglio-regole';
import { letteraSubito } from '@/lib/dittafono-foglio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Drag & drop dalla pagina Referti: l'audio entra nella coda di trascrizione
// (referti_audio, stato in_coda); la pipeline sul Mac dello studio lo preleva,
// lo trascrive e restituisce la bozza. Solo utenti dello studio.

const TIPI = TIPI_AUDIO;
const MAX_BYTES = MAX_BYTES_AUDIO;

// I medici dello studio per il dittafono dal telefono (13.9.2026): id e nome,
// con la sessione del browser. Nessun dato clinico.
export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }
  // Non basta essere entrati: serve una sezione che dà diritto a questi dati (13.10.2026, controllo di sicurezza).
  const negato = vietato(session.role, 'reports', 'dittafono');
  if (negato) return negato;
  const medici = (await mediciDelloStudio(session.studioId)).map((m) => ({ id: m.id, nome: m.nome }));
  return NextResponse.json({ medici });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }
  const negato2 = vietato(session.role, 'reports', 'dittafono');
  if (negato2) return negato2;

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ errore: 'file_mancante' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ errore: 'file_troppo_grande' }, { status: 400 });
  }
  const punto = file.name.lastIndexOf('.');
  const ext = punto === -1 ? '' : file.name.slice(punto).toLowerCase();
  if (!TIPI[ext]) {
    return NextResponse.json({ errore: 'formato_non_audio' }, { status: 400 });
  }

  const tipo = String(form?.get('tipo') ?? '') === 'visita' ? 'visita' : 'referto';

  // Chi ha dettato (2026-09-07): obbligatorio quando lo studio ha profili
  // pubblicati dal Mac (studios.referti_medici); deve essere uno di quelli.
  const ids = new Set((await mediciDelloStudio(session.studioId)).map((m) => m.id));
  const medico = String(form?.get('medico') ?? '').trim().toLowerCase();
  if (ids.size > 0 && !ids.has(medico)) {
    return NextResponse.json({ errore: 'medico_mancante' }, { status: 400 });
  }

  // Il paziente, se chi carica lo sceglie (5.10.2026): la bozza nasce collegata.
  const pazienteRaw = String(form?.get('patient_id') ?? '').trim();
  let pazienteId: string | null = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pazienteRaw)) {
    const [pz] = await query<{ id: string }>('select id from patients where id = $1 and studio_id = $2', [pazienteRaw, session.studioId]);
    pazienteId = pz?.id ?? null;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await putFile(buffer, TIPI[ext], ext);
  // File del dittafono: il WAV di riascolto si prepara subito in sottofondo
  // (decoder locale), così il player nel dettaglio parte senza attese.
  // Best-effort: se fallisce, la rotta audio riprova alla prima richiesta.
  if (ESTENSIONI_DITTAFONO.has(ext)) void wavDaDittafono(key, buffer);
  // Dettatura in tempo reale accanto alla registrazione (11.10.2026): il testo che un programma di dettatura
  // (Dragon) ha scritto nella casella del dittafono mentre si registrava, e a che secondo dell'audio era arrivato.
  // Resta accanto al dettato; la catena trascrive l'audio per conto suo e in revisione i due si confrontano.
  const dettatoTesto = String(form?.get('dettato_testo') ?? '').replace(/\u0000/g, '').trim().slice(0, 60_000) || null;
  let dettatoTempi: [number, number][] | null = null;
  if (dettatoTesto) {
    try {
      const grezzi = JSON.parse(String(form?.get('dettato_tempi') ?? '[]'));
      if (Array.isArray(grezzi)) dettatoTempi = grezzi.filter((x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)).slice(0, 5000);
    } catch { dettatoTempi = null; }
  }
  // Il foglio (12.10.2026): le parti della lettera attorno al corpo dettato. Con un foglio, alla consegna della bozza
  // la lettera del foglio diventa il testo da rivedere (src/lib/dittafono-foglio.ts).
  let dettatoFoglio: ReturnType<typeof pulisciFoglio> = null;
  if (dettatoTesto) { try { dettatoFoglio = pulisciFoglio(JSON.parse(String(form?.get('dettato_foglio') ?? 'null'))); } catch { dettatoFoglio = null; } }
  const dettatoFonte = dettatoTesto ? (String(form?.get('dettato_fonte') ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30).toLowerCase() || 'dettatura') : null;
  const [row] = await query<{ id: string }>(
    `insert into referti_audio (studio_id, filename, storage_key, content_type, uploaded_by, tipo, medico, patient_id, dettato_testo, dettato_tempi, dettato_fonte, dettato_foglio)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb) returning id`,
    [session.studioId, file.name.slice(0, 200), key, TIPI[ext], session.id, tipo, ids.has(medico) ? medico : null, pazienteId, dettatoTesto, dettatoTempi ? JSON.stringify(dettatoTempi) : null, dettatoFonte, dettatoFoglio ? JSON.stringify(dettatoFoglio) : null]
  );

  // Lettera dettata sul foglio (19.10.2026): è già la lettera, e va subito in revisione; la catena porta dopo il controllo.
  let bozzaSubito: string | null = null;
  if (dettatoFoglio && dettatoTesto) {
    try { bozzaSubito = await letteraSubito(session.studioId, row.id, session.id); }
    catch (e: any) { console.error(`[foglio] lettera subito: ${e?.code ?? e?.name ?? 'errore'}`); }
  }

  // L'arrivo di un dettato è «visita finita» per quel medico (16.9.2026,
  // Piattaforma/Orchestrazione sale §7): un segnale che esisteva già e nessuno
  // usava. Best-effort, e senza nome del paziente: solo il medico.
  if (ids.has(medico)) {
    const nomeMedico = (await mediciDelloStudio(session.studioId)).find((m) => m.id === medico)?.nome;
    if (nomeMedico) {
      void import('@/lib/orchestrazione/orchestratore')
        .then((o) => o.registraEvento(session.studioId!, { tipo: 'visita_finita', medico: nomeMedico, fonte: 'dettato', user_id: session.id }))
        .catch((e) => console.log(`[orchestrazione] dettato: ${(e as Error).message}`));
    }
  }

  return NextResponse.json({ ok: true, id: row.id, ...(bozzaSubito ? { bozza: bozzaSubito } : {}) }, { status: 201 });
}
