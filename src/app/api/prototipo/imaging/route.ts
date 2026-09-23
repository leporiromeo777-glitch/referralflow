import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { lettoreDisponibile, statoRicezione } from '@/lib/imaging';
import { ingestaDicom } from '@/lib/imaging-ingest';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Immagini diagnostiche: elenco e importazione ([[Piattaforma/Immagini]]).
//
// Le immagini sono dati sanitari come i referti: le vede chi cura, non chi
// amministra il sistema. Il tecnico è fuori, come dalla scheda del paziente.
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente', 'tecnico']);  // tecnico: vede tutto (23.9.2026); misurare no
const MAX_FILE = 300;
const MAX_BYTE = 400 * 1024 * 1024;

async function registra(studioId: string, esameId: string | null, userId: string, azione: string) {
  try {
    await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,$3,$4)`,
      [studioId, esameId, userId, azione.slice(0, 40)]);
  } catch (e) { console.error(`[imaging] registro accessi: ${(e as Error)?.message ?? e}`); }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'imaging');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const sid = session.studioId;
  const paziente = req.nextUrl.searchParams.get('paziente') ?? '';

  const esami = await query<{
    id: string; data_esame: string | null; ora_esame: string | null; descrizione: string | null; modalita: string;
    stato: string; origine: string; n_serie: number; n_immagini: number; byte: string; paziente_dicom: string | null;
    paziente_nascita: string | null; patient_id: string | null; paziente: string | null; istituto: string | null;
    inviante: string | null; accession: string | null; created_at: string;
  }>(
    `select e.id, e.data_esame::text, e.ora_esame, e.descrizione, e.modalita, e.stato, e.origine, e.n_serie, e.n_immagini,
            e.byte::text, e.paziente_dicom, e.paziente_nascita::text, e.patient_id,
            case when p.id is null then null else (p.cognome || ' ' || p.nome) end as paziente,
            e.istituto, e.inviante, e.accession, e.created_at::text
       from imaging_esami e left join patients p on p.id = e.patient_id
      where e.studio_id = $1 and e.stato <> 'nascosto'
        and ($2 = '' or e.patient_id = $2::uuid)
      order by e.data_esame desc nulls last, e.created_at desc limit 200`,
    [sid, isUuid(paziente) ? paziente : '']);

  const [conta] = await query<{ da_verificare: number; senza_paziente: number }>(
    `select count(*) filter (where stato = 'da_verificare')::int as da_verificare,
            count(*) filter (where patient_id is null)::int as senza_paziente
       from imaging_esami where studio_id = $1 and stato <> 'nascosto'`, [sid]);

  return NextResponse.json(
    { esami, conta, lettore: await lettoreDisponibile(), ricezione: await statoRicezione() },
    { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'imaging');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const sid = session.studioId;
  const tipo = req.headers.get('content-type') ?? '';

  // ── azioni sulle righe (JSON) ─────────────────────────────────────────────
  if (!tipo.includes('multipart/form-data')) {
    const c = await req.json().catch(() => null);
    const azione = String(c?.azione ?? '');
    const id = String(c?.id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });

    if (azione === 'abbina') {
      const pid = String(c?.patient_id ?? '');
      if (pid && !isUuid(pid)) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
      if (pid) {
        const [p] = await query<{ id: string }>(`select id from patients where id = $1 and studio_id = $2`, [pid, sid]);
        if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });
      }
      const [agg] = await query<{ id: string }>(
        `update imaging_esami set patient_id = $3, stato = case when $3 is null then stato else 'disponibile' end, updated_at = now()
          where id = $1 and studio_id = $2 returning id`, [id, sid, pid || null]);
      if (!agg) return NextResponse.json({ errore: 'Esame non trovato.' }, { status: 404 });
      await registra(sid, id, session.id, pid ? 'abbinato' : 'staccato');
      return NextResponse.json({ ok: true });
    }

    if (azione === 'stato') {
      const stato = ['da_verificare', 'disponibile', 'nascosto'].includes(String(c?.stato)) ? String(c.stato) : null;
      if (!stato) return NextResponse.json({ errore: 'stato' }, { status: 400 });
      const [agg] = await query<{ id: string }>(
        `update imaging_esami set stato = $3, updated_at = now() where id = $1 and studio_id = $2 returning id`, [id, sid, stato]);
      if (!agg) return NextResponse.json({ errore: 'Esame non trovato.' }, { status: 404 });
      await registra(sid, id, session.id, `stato:${stato}`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
  }

  // ── importazione dei file ─────────────────────────────────────────────────
  if (!(await lettoreDisponibile())) {
    return NextResponse.json({ errore: 'Il lettore DICOM non è installato su questo server.' }, { status: 503 });
  }
  const form = await req.formData().catch(() => null);
  const files = form ? form.getAll('file').filter((f): f is File => f instanceof File) : [];
  if (!files.length) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });
  if (files.length > MAX_FILE) return NextResponse.json({ errore: `Troppi file in una volta (massimo ${MAX_FILE}).` }, { status: 413 });

  // Leggere, raggruppare e scrivere lo fa `ingestaDicom`: la stessa strada
  // dei file che arrivano dall'ecografo con un C-STORE.
  const file: Buffer[] = [];
  let byteTotali = 0;
  for (const f of files) {
    const b = Buffer.from(await f.arrayBuffer());
    byteTotali += b.length;
    if (byteTotali > MAX_BYTE) return NextResponse.json({ errore: 'Pacchetto troppo grande (massimo 400 MB per volta).' }, { status: 413 });
    file.push(b);
  }
  const r = await ingestaDicom(sid, file, { origine: 'import', userId: session.id });
  if (!r.esami.length) return NextResponse.json({ errore: 'Nessun file DICOM riconosciuto.', scartati: r.scartati }, { status: 400 });

  console.log(`[imaging] import esami=${r.esami.length} nuovi=${r.nuovi} immagini=${r.immagini} scartati=${r.scartati}`);
  return NextResponse.json({ ok: true, esami: r.esami.length, nuovi: r.nuovi, immagini: r.immagini, scartati: r.scartati });
}
