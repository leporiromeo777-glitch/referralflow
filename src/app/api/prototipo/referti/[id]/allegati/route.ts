import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import path from 'path';
import { attorno, collegaInviante, pazienteDelReferto, ricollegaInvianti, scegliInviante } from '@/lib/referti-inviante';
import { etichettaDocumento } from '@/lib/referti-allegato-blocco';
import { CATEGORIE, logDocumento } from '@/lib/cartella';
import { deleteFile, getFile, putFile } from '@/lib/storage';
import { isAllowedInternalUpload, MAX_UPLOAD_SIZE } from '@/lib/upload';
import { registraEvento } from '@/lib/referti-eventi';
import { dopoCaricamento } from '@/lib/documenti-ocr';

export const dynamic = 'force-dynamic';

// Inviante, copia per conoscenza e allegati di un referto (26.9.2026): quel
// che finirà nel Word, visto e corretto dalla revisione.
// GET  → stato calcolato (collega l'inviante se non è ancora fatto)
// POST → { azione: 'inviante', referring_doctor_id | null }  scelta a mano (null = torna automatico)
//        { azione: 'aggiungi', nome, specialita?, email?, telefono?, via?, npa?, localita? }
//          aggiunge l'inviante nuovo alla rubrica e ricollega i referti che lo aspettavano
//        { azione: 'allegato_aggiungi', documento_id }   un documento della cartella
//        { azione: 'allegato_togli', id? , etichetta? }  un aggiunto (id) o un automatico (etichetta)
//        { azione: 'allegato_rimetti', id }              annulla un «togli» di un automatico
//        multipart { azione: 'allegato_carica', file, categoria?, nota? }
//          paziente in cartella → il file entra nella cartella e nel referto;
//          se no resta solo attaccato a questo referto
// GET ?file=<id> → un file caricato solo per il referto
// La copia per conoscenza si salva come gli altri campi (campi.copia_conoscenza).
// Allegati (27.9.2026): valgono per il Word («Allegato:») e per la mail.
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);

async function sessione(id: string) {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'reports');
  if (no) return { errore: no };
  if (!isUuid(id)) return { errore: NextResponse.json({ errore: 'non_trovato' }, { status: 404 }) };
  return { session };
}

// Solo formati che il medico che riceve la mail sa aprire.
const EST_ALLEGATO = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.docx']);

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, errore } = await sessione(params.id);
  if (errore) return errore;
  const fileId = req.nextUrl.searchParams.get('file');
  if (fileId) {
    if (!isUuid(fileId)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const [f] = await query<{ storage_key: string; filename: string; content_type: string | null }>(
      `select storage_key, filename, content_type from referti_allegati where id = $1 and bozza_id = $2 and studio_id = $3 and tipo = 'caricato'`,
      [fileId, params.id, session.studioId]);
    if (!f) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const { body, contentType } = await getFile(f.storage_key);
    return new NextResponse(body, { headers: { 'Content-Type': f.content_type || contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${encodeURIComponent(f.filename)}"`, 'Cache-Control': 'private, no-store' } });
  }
  const [b] = await query<{ inviante_stato: string | null; inviante_manuale: boolean }>(
    'select inviante_stato, inviante_manuale from referti_bozze where id = $1 and studio_id = $2', [params.id, session.studioId]);
  if (!b) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (b.inviante_stato == null && !b.inviante_manuale) await collegaInviante(session.studioId, params.id).catch(() => null);
  const a = await attorno(session.studioId, params.id);
  const rubrica = await query<{ id: string; nome: string; localita: string | null }>(
    'select id, nome, localita from referring_doctors where studio_id = $1 order by nome', [session.studioId]);
  return NextResponse.json({ ...a, rubrica }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, errore } = await sessione(params.id);
  if (errore) return errore;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const s = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max);
  const sid = session.studioId;
  const evento = (azione: string) => void registraEvento(sid, params.id, 'allegati_modificati', session.id, { azione });

  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });
    const ext = path.extname(file.name).toLowerCase();
    if (file.size > MAX_UPLOAD_SIZE) return NextResponse.json({ errore: 'Il file supera i 10 MB.' }, { status: 413 });
    if (!EST_ALLEGATO.has(ext) || !isAllowedInternalUpload(file)) return NextResponse.json({ errore: 'Come allegato va un PDF, un\'immagine (JPG, PNG) o un Word (.docx).' }, { status: 415 });
    const [b] = await query<{ id: string }>('select id from referti_bozze where id = $1 and studio_id = $2', [params.id, sid]);
    if (!b) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await putFile(buffer, file.type || 'application/octet-stream', ext);
    const categoriaRaw = s(form?.get('categoria'), 20);
    const categoria = categoriaRaw in CATEGORIE ? categoriaRaw : 'altro';
    const nota = s(form?.get('nota'), 200) || (categoria !== 'altro' ? CATEGORIE[categoria] : null);
    const patientId = await pazienteDelReferto(sid, params.id);
    if (patientId) {
      const [doc] = await query<{ id: string }>(
        `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`, [sid, patientId, file.name, key, categoria, nota, session.id]);
      await logDocumento(doc.id, 'caricamento', { studioId: sid, userId: session.id });
      await dopoCaricamento(doc.id, buffer, ext);
      await query(`insert into referti_allegati (studio_id, bozza_id, tipo, documento_id, etichetta, created_by) values ($1, $2, 'cartella', $3, $4, $5)`,
        [sid, params.id, doc.id, etichettaDocumento({ filename: file.name, nota }) || file.name, session.id]);
      evento('caricato_in_cartella');
      return NextResponse.json({ ok: true, in_cartella: true }, { status: 201 });
    }
    await query(`insert into referti_allegati (studio_id, bozza_id, tipo, storage_key, filename, content_type, etichetta, created_by) values ($1, $2, 'caricato', $3, $4, $5, $6, $7)`,
      [sid, params.id, key, file.name, file.type || null, nota || etichettaDocumento({ filename: file.name, nota: null }) || file.name, session.id]);
    evento('caricato');
    return NextResponse.json({ ok: true, in_cartella: false }, { status: 201 });
  }

  const c = await req.json().catch(() => null);
  if (c?.azione === 'allegato_aggiungi') {
    const did = String(c.documento_id ?? '');
    if (!isUuid(did)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    const [d] = await query<{ filename: string; nota: string | null }>('select filename, nota from patient_documents where id = $1 and studio_id = $2', [did, sid]);
    if (!d) return NextResponse.json({ errore: 'Documento non trovato.' }, { status: 404 });
    const etichetta = etichettaDocumento(d) || d.filename;
    await query(`delete from referti_allegati where bozza_id = $1 and studio_id = $2 and tipo = 'tolto' and lower(etichetta) = lower($3)`, [params.id, sid, etichetta]);
    await query(`insert into referti_allegati (studio_id, bozza_id, tipo, documento_id, etichetta, created_by)
                 select $1, $2, 'cartella', $3, $4, $5 where not exists (select 1 from referti_allegati where bozza_id = $2 and documento_id = $3)`,
      [sid, params.id, did, etichetta, session.id]);
    evento('aggiunto');
    return NextResponse.json({ ok: true });
  }
  if (c?.azione === 'allegato_togli') {
    const rid = String(c.id ?? '');
    if (rid) {
      if (!isUuid(rid)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      const [x] = await query<{ storage_key: string | null }>(`delete from referti_allegati where id = $1 and bozza_id = $2 and studio_id = $3 and tipo <> 'tolto' returning storage_key`, [rid, params.id, sid]);
      if (x?.storage_key) await deleteFile(x.storage_key).catch(() => null);
    } else {
      const etichetta = s(c.etichetta, 200);
      if (!etichetta) return NextResponse.json({ errore: 'etichetta' }, { status: 400 });
      await query(`insert into referti_allegati (studio_id, bozza_id, tipo, etichetta, created_by)
                   select $1, $2, 'tolto', $3, $4 where not exists (select 1 from referti_allegati where bozza_id = $2 and tipo = 'tolto' and lower(etichetta) = lower($3))`,
        [sid, params.id, etichetta, session.id]);
    }
    evento('tolto');
    return NextResponse.json({ ok: true });
  }
  if (c?.azione === 'allegato_rimetti') {
    const rid = String(c.id ?? '');
    if (!isUuid(rid)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    await query(`delete from referti_allegati where id = $1 and bozza_id = $2 and studio_id = $3 and tipo = 'tolto'`, [rid, params.id, sid]);
    evento('rimesso');
    return NextResponse.json({ ok: true });
  }
  if (c?.azione === 'inviante') {
    const rid = c.referring_doctor_id == null || c.referring_doctor_id === '' ? null : String(c.referring_doctor_id);
    if (rid && !isUuid(rid)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    let nome: string | null = null;
    try { nome = await scegliInviante(session.studioId, params.id, rid); }
    catch (e: any) {
      if (e?.message === 'inviante_non_trovato') return NextResponse.json({ errore: 'Inviante non trovato.' }, { status: 404 });
      console.error(`[invianti] scelta non salvata: ${e?.code ?? e?.name ?? 'errore'}`);
      return NextResponse.json({ errore: 'La scelta non si è salvata: riprova.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, nome });
  }
  if (c?.azione === 'aggiungi') {
    const nome = s(c.nome, 120);
    if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
    const email = s(c.email).toLowerCase();
    if (email && !email.includes('@')) return NextResponse.json({ errore: 'E-mail non valida.' }, { status: 400 });
    const [r] = await query<{ id: string }>(
      `insert into referring_doctors (studio_id, nome, email, telefono, specialita, via, npa, localita)
       values ($1, $2, nullif($3, ''), nullif($4, ''), nullif($5, ''), nullif($6, ''), nullif($7, ''), nullif($8, '')) returning id`,
      [session.studioId, nome, email, s(c.telefono, 40), s(c.specialita, 120).replace(/^m?fmh\s+/i, ''), s(c.via), s(c.npa, 10), s(c.localita, 80)]);
    const ricollegati = await ricollegaInvianti(session.studioId);
    console.log(`[invianti] creato ${r.id.slice(0, 8)} dalla revisione, ricollegati ${ricollegati}`);
    return NextResponse.json({ id: r.id, ricollegati }, { status: 201 });
  }
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
