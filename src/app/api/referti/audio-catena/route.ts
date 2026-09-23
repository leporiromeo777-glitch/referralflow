import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { putFile } from '@/lib/storage';
import { ESTENSIONI_DITTAFONO, wavDaDittafono } from '@/lib/dittafono';
import { TIPI_AUDIO, MAX_BYTES_AUDIO } from '@/lib/referti-audio-tipi';
import { RX_MEDICO_ID } from '@/lib/referti-medici';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Audio consegnato dalla catena (23.9.2026). I dettati caricati dalla pagina
// Referti hanno già il loro audio nella piattaforma; quelli entrati dalla
// cartella condivisa (o messi a mano in ingresso/) no, e la revisione non
// poteva riascoltarli. Dopo la bozza, la catena manda qui il file originale:
// si salva nello storage e si collega alla bozza con quell'impronta.
// Autenticazione col token della catena, come /api/referti/bozza. Il nome del
// file originale non arriva mai (può contenere il nome del paziente): si
// salva come «dettato.<ext>». Idempotente: se la bozza ha già un audio, 200.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>('select id from studios where referti_token_hash = $1 and attivo = true', [tokenHash]);
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get('file_id') ?? '';
  const ext = (req.nextUrl.searchParams.get('ext') ?? '').toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(fileId)) return NextResponse.json({ errore: 'file_id' }, { status: 400 });
  if (!TIPI_AUDIO[ext]) return NextResponse.json({ errore: 'formato_non_audio' }, { status: 400 });

  const [bozza] = await query<{ id: string; tipo: string; medico: string | null }>(
    `select id, tipo, payload->'medico'->>'id' as medico from referti_bozze
      where studio_id = $1 and file_id = $2 order by created_at desc limit 1`,
    [studio.id, fileId]
  );
  if (!bozza) return NextResponse.json({ errore: 'bozza_non_trovata' }, { status: 404 });
  const [gia] = await query<{ id: string }>('select id from referti_audio where bozza_id = $1 limit 1', [bozza.id]);
  if (gia) return NextResponse.json({ esito: 'gia_presente', audio_id: gia.id }, { status: 200 });

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length === 0) return NextResponse.json({ errore: 'file_mancante' }, { status: 400 });
  if (buffer.length > MAX_BYTES_AUDIO) return NextResponse.json({ errore: 'file_troppo_grande' }, { status: 400 });
  const key = await putFile(buffer, TIPI_AUDIO[ext], ext);
  if (ESTENSIONI_DITTAFONO.has(ext)) void wavDaDittafono(key, buffer);
  const medico = bozza.medico && RX_MEDICO_ID.test(bozza.medico) ? bozza.medico : null;
  const [row] = await query<{ id: string }>(
    `insert into referti_audio (studio_id, filename, storage_key, content_type, stato, bozza_id, tipo, medico)
     values ($1, $2, $3, $4, 'fatto', $5, $6, $7) returning id`,
    [studio.id, `dettato${ext}`, key, TIPI_AUDIO[ext], bozza.id, bozza.tipo === 'visita' ? 'visita' : 'referto', medico]
  );
  console.log(`[referti] audio della catena collegato: bozza ${bozza.id.slice(0, 8)}, ${buffer.length} byte`);
  return NextResponse.json({ esito: 'collegato', audio_id: row.id }, { status: 201 });
}
