import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { CATEGORIE, isUuid, logDocumento } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { putFile } from '@/lib/storage';
import { isAllowedInternalUpload, MAX_CARTELLA_SIZE } from '@/lib/upload';
import { dopoCaricamento } from '@/lib/documenti-ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Carica documento» nella scheda del paziente (28.9.2026): prima il tasto
// della nuova interfaccia era dimostrativo e non caricava nulla. Un file per
// chiamata (l'interfaccia li manda uno alla volta, con l'avanzamento), fino a
// 50 MB: una cartella cartacea scansionata ci sta. Un PDF senza testo
// (scansione senza OCR) va in coda per l'OCR sul Mac (src/lib/documenti-ocr.ts). Nei log solo id abbreviati e numeri.
//   POST multipart { file, categoria?, nota? } → { id, pagine?, senza_testo?, ocr? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'patients');
  if (no) return no;
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'Questo paziente ha solo la scheda dell\'agenda: crea prima la sua scheda in anagrafica.' }, { status: 409 });
  const sid = session.studioId;
  const [p] = await query<{ id: string }>('select id from patients where id = $1 and studio_id = $2', [params.id, sid]);
  if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });
  if (file.size > MAX_CARTELLA_SIZE) return NextResponse.json({ errore: `Il file supera i ${MAX_CARTELLA_SIZE / 1024 / 1024} MB: dividilo in più parti.` }, { status: 413 });
  if (!isAllowedInternalUpload(file)) return NextResponse.json({ errore: 'Formato non ammesso: PDF, immagini, Word, DICOM.' }, { status: 415 });
  const categoriaRaw = String(form?.get('categoria') ?? '').trim();
  const categoria = categoriaRaw in CATEGORIE ? categoriaRaw : 'altro';
  const nota = String(form?.get('nota') ?? '').trim().slice(0, 200) || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();
  const key = await putFile(buffer, file.type || 'application/octet-stream', ext);
  const [doc] = await query<{ id: string }>(
    `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`, [sid, params.id, file.name, key, categoria, nota, session.id]);
  await logDocumento(doc.id, 'caricamento', { studioId: sid, userId: session.id });

  const v = await dopoCaricamento(doc.id, buffer, ext);
  console.log(`[cartella] documento ${doc.id.slice(0, 8)} caricato: ${Math.round(file.size / 1024)} KB${v.pagine ? `, ${v.pagine} pagine` : ''}${v.senza_testo ? ', senza testo: in coda per l\'OCR' : ''}`);
  return NextResponse.json({ id: doc.id, ...v }, { status: 201 });
}
