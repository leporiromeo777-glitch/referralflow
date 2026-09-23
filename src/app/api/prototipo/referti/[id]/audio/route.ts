import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { putFile } from '@/lib/storage';
import { ESTENSIONI_DITTAFONO, wavDaDittafono } from '@/lib/dittafono';
import { registraEvento } from '@/lib/referti-eventi';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// «Aggiungi traccia audio» (19.9.2026): il secondo file di un dettato spezzato
// in due. Entra nella stessa coda della catena, con lo stesso medico e lo
// stesso tipo della bozza, ma con `aggiunge_a` = questa bozza: alla consegna
// la piattaforma accoda il testo invece di aprire un referto nuovo.
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);
const MAX_BYTES = 200 * 1024 * 1024;
const TIPI: Record<string, string> = {
  '.ds2': 'audio/x-dss', '.dss': 'audio/x-dss', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.caf': 'audio/x-caf', '.mp4': 'audio/mp4',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'reports');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const sid = session.studioId;

  const [b] = await query<{ id: string; stato: string; tipo: string; medico: string | null }>(
    `select id, stato, tipo, medico from referti_bozze where id = $1 and studio_id = $2`, [params.id, sid]);
  if (!b) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (b.stato !== 'bozza') return NextResponse.json({ errore: 'Il referto è già confermato: non si aggiunge più niente.' }, { status: 409 });
  const [inCorso] = await query<{ n: number }>(
    `select count(*)::int as n from referti_audio where aggiunge_a = $1 and stato in ('in_coda', 'elaborazione')`, [b.id]);
  if (inCorso?.n) return NextResponse.json({ errore: 'Una traccia è già in lavorazione per questo referto: aspetta che arrivi.' }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ errore: 'File troppo grande (massimo 200 MB).' }, { status: 413 });
  const punto = file.name.lastIndexOf('.');
  const ext = punto === -1 ? '' : file.name.slice(punto).toLowerCase();
  if (!TIPI[ext]) return NextResponse.json({ errore: `Formato non riconosciuto (${ext || 'senza estensione'}).` }, { status: 415 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await putFile(buffer, TIPI[ext], ext);
  if (ESTENSIONI_DITTAFONO.has(ext)) void wavDaDittafono(key, buffer);
  const [row] = await query<{ id: string }>(
    `insert into referti_audio (studio_id, filename, storage_key, content_type, uploaded_by, tipo, medico, aggiunge_a)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [sid, file.name.slice(0, 200), key, TIPI[ext], session.id, b.tipo, b.medico, b.id]);
  await registraEvento(sid, b.id, 'traccia_in_coda', session.id, { audio_id: row.id, byte: file.size });
  console.log(`[referti] seconda traccia in coda per ${b.id.slice(0, 8)} (${ext}, ${file.size} byte)`);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
