import { daConvertire, inPdf } from '@/lib/immagine-in-pdf';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { CATEGORIE, isUuid, logDocumento } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { putFile } from '@/lib/storage';
import { nomeCartella, rinomina } from '@/lib/cartella-nomi';
import { isAllowedInternalUpload, MAX_CARTELLA_PDF_SIZE, MAX_CARTELLA_SIZE } from '@/lib/upload';
import { dopoCaricamento } from '@/lib/documenti-ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Carica documento» nella scheda del paziente (28.9.2026): prima il tasto
// della nuova interfaccia era dimostrativo e non caricava nulla. Un file per
// chiamata (l'interfaccia li manda uno alla volta, con l'avanzamento), fino a
// 50 MB, un PDF fino a 300 MB (una cartella cartacea scansionata intera, 15.10.2026). Un PDF senza testo
// (scansione senza OCR) va in coda per l'OCR sul Mac (src/lib/documenti-ocr.ts). Nei log solo id abbreviati e numeri.
//   POST multipart { file, categoria?, nota?, cartella? } → { id, pagine?, senza_testo?, ocr? }
// Dal 20.10.2026 il documento si mette subito nella sua sottocartella, e poi si sposta, si rinomina o si toglie
// (PATCH, DELETE qui sotto; regole dei nomi in src/lib/cartella-nomi.ts).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  const massimo = /\.pdf$/i.test(file.name) ? MAX_CARTELLA_PDF_SIZE : MAX_CARTELLA_SIZE;
  if (file.size > massimo) return NextResponse.json({ errore: `Il file supera i ${massimo / 1024 / 1024} MB.` }, { status: 413 });
  if (!isAllowedInternalUpload(file)) return NextResponse.json({ errore: 'Formato non ammesso: PDF, immagini (JPG, PNG, HEIC, TIFF), Word, testo, DICOM.' }, { status: 415 });
  const categoriaRaw = String(form?.get('categoria') ?? '').trim();
  const categoria = categoriaRaw in CATEGORIE ? categoriaRaw : 'altro';
  const nota = String(form?.get('nota') ?? '').trim().slice(0, 200) || null;
  const cartella = nomeCartella(form?.get('cartella'));

  let buffer = Buffer.from(await file.arrayBuffer());
  let ext = path.extname(file.name).toLowerCase();
  let nomeFile = file.name;
  let tipo = file.type || 'application/octet-stream';
  // TIFF e HEIC diventano PDF (si vedono nel visore e passano dall'OCR).
  if (daConvertire(ext)) {
    const pdf = await inPdf(buffer, ext);
    if (pdf) { buffer = Buffer.from(pdf); nomeFile = `${file.name.slice(0, -ext.length)}.pdf`; ext = '.pdf'; tipo = 'application/pdf'; }
  }
  const key = await putFile(buffer, tipo, ext);
  const [doc] = await query<{ id: string }>(
    `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by, cartella)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [sid, params.id, nomeFile, key, categoria, nota, session.id, cartella]);
  await logDocumento(doc.id, 'caricamento', { studioId: sid, userId: session.id });

  const v = await dopoCaricamento(doc.id, buffer, ext);
  console.log(`[cartella] documento ${doc.id.slice(0, 8)} caricato: ${Math.round(file.size / 1024)} KB${v.pagine ? `, ${v.pagine} pagine` : ''}${v.senza_testo ? ', senza testo: in coda per l\'OCR' : ''}`);
  return NextResponse.json({ id: doc.id, ...v }, { status: 201 });
}

async function chi(params: Promise<{ id: string }>) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.studioId) return { no: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'patients');
  if (no) return { no };
  if (!isUuid(id)) return { no: NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 }) };
  return { session, sid: session.studioId, pid: id };
}

// Spostare, rinominare (20.10.2026). Nel registro solo che cosa si è fatto: mai nomi di file o di cartelle.
//   PATCH { azione: 'sposta', ids: [..], cartella: '05_Apparecchi' | null }
//   PATCH { azione: 'rinomina', id, titolo }
//   PATCH { azione: 'rinomina_cartella', da, a }      — tutti i documenti del paziente in «da» passano in «a»
//   PATCH { azione: 'ripristina', id }                — un documento dello storico degli eliminati torna nella cartella
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const c = await chi(props.params);
  if (c.no) return c.no;
  const { session, sid, pid } = c;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const azione = String(b?.azione ?? '');
  if (azione === 'sposta') {
    const ids = (Array.isArray(b?.ids) ? b!.ids : []).map(String).filter(isUuid).slice(0, 500);
    if (!ids.length) return NextResponse.json({ errore: 'Nessun documento.' }, { status: 400 });
    const cartella = nomeCartella(b?.cartella);
    const r = await query<{ id: string }>(
      `update patient_documents set cartella = $4 where studio_id = $1 and patient_id = $2 and id = any($3::uuid[]) and cartella is distinct from $4 returning id`,
      [sid, pid, ids, cartella]);
    for (const x of r) await logDocumento(x.id, 'modifica', { studioId: sid, userId: session.id, dettaglio: 'spostato di sottocartella' });
    return NextResponse.json({ spostati: r.length, cartella });
  }
  if (azione === 'rinomina') {
    const id = String(b?.id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 });
    const [d] = await query<{ filename: string; nota: string | null }>(`select filename, nota from patient_documents where id = $1 and studio_id = $2 and patient_id = $3`, [id, sid, pid]);
    if (!d) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 });
    const nuovo = rinomina(d, b?.titolo);
    if (!nuovo) return NextResponse.json({ errore: 'Scrivi il nome.' }, { status: 400 });
    await query(`update patient_documents set filename = coalesce($2, filename), nota = coalesce($3, nota) where id = $1`, [id, nuovo.filename ?? null, nuovo.nota ?? null]);
    await logDocumento(id, 'modifica', { studioId: sid, userId: session.id, dettaglio: 'rinominato' });
    return NextResponse.json({ ok: true });
  }
  if (azione === 'rinomina_cartella') {
    const da = nomeCartella(b?.da), a = nomeCartella(b?.a);
    if (!da || !a) return NextResponse.json({ errore: 'Scrivi il nome della sottocartella.' }, { status: 400 });
    const r = await query<{ id: string }>(`update patient_documents set cartella = $4 where studio_id = $1 and patient_id = $2 and cartella = $3 returning id`, [sid, pid, da, a]);
    for (const x of r) await logDocumento(x.id, 'modifica', { studioId: sid, userId: session.id, dettaglio: 'sottocartella rinominata' });
    return NextResponse.json({ spostati: r.length });
  }
  if (azione === 'ripristina') {
    // Un documento eliminato torna nella cartella com'era (stesso id, stessa sottocartella), se il file c'è ancora.
    const id = String(b?.id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'Non trovato.' }, { status: 404 });
    const [r] = await query<{ id: string }>(
      `with e as (select * from documenti_eliminati where id = $1 and studio_id = $2 and patient_id = $3 and file_tenuto and ripristinato_at is null
                    and not exists (select 1 from patient_documents d where d.id = documenti_eliminati.document_id)),
            dentro as (insert into patient_documents select (jsonb_populate_record(null::patient_documents, e.riga)).* from e returning id)
       update documenti_eliminati set ripristinato_at = now(), ripristinato_da = $4 where id = $1 and exists (select 1 from dentro) returning document_id as id`,
      [id, sid, pid, session.id]);
    if (!r) return NextResponse.json({ errore: 'Non si può rimettere: è già nella cartella, o il file non c’è più.' }, { status: 409 });
    await logDocumento(r.id, 'modifica', { studioId: sid, userId: session.id, dettaglio: 'rimesso nella cartella dallo storico degli eliminati' });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}

// Eliminare un documento dalla cartella (20.10.2026, chiesto dallo studio). Lo decide una persona, documento per
// documento, dopo una conferma. Non si elimina un documento allegato a un referto (il referto lo cita). Dal 20.10.2026
// (lo studio: «poter rintracciare chi ha eliminato cosa») la riga com'era, chi e quando restano in `documenti_eliminati`
// (migrazione 093) e il file resta nel deposito: dallo storico il documento si può rimettere. Il registro degli accessi
// non si cancella mai.
//   DELETE ?documento=<id>
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const c = await chi(props.params);
  if (c.no) return c.no;
  const { session, sid, pid } = c;
  const id = req.nextUrl.searchParams.get('documento') ?? '';
  if (!isUuid(id)) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 });
  const [d] = await query<{ allegato: boolean }>(
    `select exists (select 1 from referti_allegati a where a.documento_id = d.id) as allegato
       from patient_documents d where id = $1 and studio_id = $2 and patient_id = $3`, [id, sid, pid]);
  if (!d) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 });
  if (d.allegato) return NextResponse.json({ errore: 'È allegato a un referto: non si può eliminare.' }, { status: 409 });
  // nello storico e fuori dalla cartella insieme: o tutte e due o niente
  const [via] = await query<{ id: string }>(
    `with tolto as (delete from patient_documents where id = $1 and studio_id = $2 and patient_id = $3 returning *)
     insert into documenti_eliminati (studio_id, patient_id, document_id, filename, categoria, cartella, riga, eliminato_da, motivo)
     select studio_id, patient_id, id, filename, categoria, cartella, to_jsonb(tolto), $4, 'eliminato dalla cartella del paziente' from tolto
     returning document_id as id`, [id, sid, pid, session.id]);
  if (!via) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 });
  await logDocumento(id, 'cancellazione', { studioId: sid, userId: session.id, dettaglio: 'eliminato dalla cartella del paziente (nello storico)' });
  console.log(`[cartella] documento ${id.slice(0, 8)} eliminato dalla cartella, nello storico`);
  return NextResponse.json({ ok: true });
}

// Lo storico degli eliminati di questo paziente: che cosa, quando, chi; e chi l'ha rimesso.
//   GET ?eliminati=1 → { eliminati: [{ id, filename, cartella, categoria, eliminato_at, eliminato_da, motivo, si_rimette, ripristinato_at, ripristinato_da }] }
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const c = await chi(props.params);
  if (c.no) return c.no;
  const { sid, pid } = c;
  if (req.nextUrl.searchParams.get('eliminati') !== '1') return NextResponse.json({ errore: 'richiesta' }, { status: 400 });
  const eliminati = await query(
    `select e.id, e.filename, e.cartella, e.categoria, e.eliminato_at, e.motivo, ue.email as eliminato_da,
            e.file_tenuto and e.ripristinato_at is null as si_rimette, e.ripristinato_at, ur.email as ripristinato_da
       from documenti_eliminati e left join users ue on ue.id = e.eliminato_da left join users ur on ur.id = e.ripristinato_da
      where e.studio_id = $1 and e.patient_id = $2 order by e.eliminato_at desc limit 200`, [sid, pid]);
  return NextResponse.json({ eliminati }, { headers: { 'Cache-Control': 'no-store' } });
}
