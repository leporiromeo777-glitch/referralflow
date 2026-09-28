import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { CATEGORIE, isUuid, logDocumento } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { putFile } from '@/lib/storage';
import { isAllowedInternalUpload, MAX_CARTELLA_SIZE } from '@/lib/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Carica documento» nella scheda del paziente (28.9.2026): prima il tasto
// della nuova interfaccia era dimostrativo e non caricava nulla. Un file per
// chiamata (l'interfaccia li manda uno alla volta, con l'avanzamento), fino a
// 50 MB: una cartella cartacea scansionata ci sta. Per i PDF controlla se c'è
// testo: una scansione senza OCR è un'immagine che nessuno può cercare, e la
// segreteria deve saperlo subito. Nei log solo id abbreviati e numeri.
//   POST multipart { file, categoria?, nota? } → { id, pagine?, senza_testo? }
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

  let pagine: number | undefined;
  let senzaTesto: boolean | undefined;
  if (ext === '.pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const r: any = await parser.getText();
      try { await parser.destroy(); } catch { /* ignora */ }
      const testo = typeof r === 'string' ? r : String(r?.text ?? '');
      pagine = typeof r?.total === 'number' ? r.total : Array.isArray(r?.pages) ? r.pages.length : undefined;
      const caratteri = testo.replace(/\s+/g, '').replace(/--\d+of\d+--/g, '').length;
      senzaTesto = caratteri < Math.max(50, 20 * (pagine ?? 1));
    } catch { /* PDF che non si legge: resta caricato, senza controllo */ }
  }
  console.log(`[cartella] documento ${doc.id.slice(0, 8)} caricato: ${Math.round(file.size / 1024)} KB${pagine ? `, ${pagine} pagine` : ''}${senzaTesto ? ', senza testo' : ''}`);
  return NextResponse.json({ id: doc.id, pagine, senza_testo: senzaTesto }, { status: 201 });
}
