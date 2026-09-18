import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query, transazione } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { putFileAtKey } from '@/lib/storage';
import { leggiMeta, lettoreDisponibile } from '@/lib/imaging';
import { abbinaPaziente, raggruppa, type MetaMinima } from '@/lib/imaging-ordina';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Immagini diagnostiche: elenco e importazione ([[Piattaforma/Immagini]]).
//
// Le immagini sono dati sanitari come i referti: le vede chi cura, non chi
// amministra il sistema. Il tecnico è fuori, come dalla scheda del paziente.
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);
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
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const sid = session.studioId;
  const paziente = req.nextUrl.searchParams.get('paziente') ?? '';

  const esami = await query<{
    id: string; data_esame: string | null; ora_esame: string | null; descrizione: string | null; modalita: string;
    stato: string; n_serie: number; n_immagini: number; byte: string; paziente_dicom: string | null;
    paziente_nascita: string | null; patient_id: string | null; paziente: string | null; istituto: string | null;
    inviante: string | null; accession: string | null; created_at: string;
  }>(
    `select e.id, e.data_esame::text, e.ora_esame, e.descrizione, e.modalita, e.stato, e.n_serie, e.n_immagini,
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

  return NextResponse.json({ esami, conta, lettore: await lettoreDisponibile() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
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

  // Si leggono tutti prima di scrivere qualcosa: un CD contiene anche
  // DICOMDIR, indici e file di servizio, e quelli non sono esami.
  const lette: { indice: number; meta: MetaMinima }[] = [];
  const buffer: Buffer[] = [];
  let scartati = 0; let byteTotali = 0;
  for (const f of files) {
    const b = Buffer.from(await f.arrayBuffer());
    byteTotali += b.length;
    if (byteTotali > MAX_BYTE) return NextResponse.json({ errore: 'Pacchetto troppo grande (massimo 400 MB per volta).' }, { status: 413 });
    const meta = await leggiMeta(b);
    if ('errore' in meta) { scartati++; continue; }
    lette.push({ indice: buffer.length, meta: meta as unknown as MetaMinima });
    buffer.push(b);
  }
  if (!lette.length) return NextResponse.json({ errore: 'Nessun file DICOM riconosciuto.', scartati }, { status: 400 });

  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(
    `select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [sid]);

  const esami = raggruppa(lette);
  let nuoviEsami = 0; let nuoveImmagini = 0; const ids: string[] = [];

  for (const e of esami) {
    const abbinato = abbinaPaziente(e.paziente_nome, e.paziente_nascita, pazienti);
    // I file su disco PRIMA del database: una riga senza il suo file è un
    // esame che non si apre; un file senza riga è solo spazio occupato, e la
    // reimportazione lo ritrova.
    const chiavi = new Map<string, string>();
    for (const s of e.serie) {
      for (const i of s.immagini) {
        const key = `imaging/${sid}/${e.study_uid.replace(/[^0-9.]/g, '').slice(0, 64) || randomUUID()}/${randomUUID()}.dcm`;
        await putFileAtKey(key, buffer[i.indice], 'application/dicom');
        chiavi.set(i.sop_uid, key);
      }
    }

    const fatto = await transazione(async (q) => {
      const [esame] = await q<{ id: string; nuovo: boolean }>(
        `insert into imaging_esami (studio_id, patient_id, study_uid, accession, data_esame, ora_esame, descrizione,
                                    modalita, istituto, inviante, paziente_dicom, paziente_nascita, paziente_id_dicom,
                                    stato, origine, caricato_da)
         values ($1,$2,$3,nullif($4,''),nullif($5,'')::date,nullif($6,''),nullif($7,''),$8,nullif($9,''),nullif($10,''),
                 nullif($11,''),nullif($12,'')::date,nullif($13,''),$14,'import',$15)
         on conflict (studio_id, study_uid) do update set updated_at = now()
         returning id, (xmax = 0) as nuovo`,
        [sid, abbinato.id, e.study_uid, e.accession, e.data_esame, e.ora_esame, e.descrizione, e.modalita,
         e.istituto, e.inviante, e.paziente_nome, e.paziente_nascita, e.paziente_id,
         abbinato.id ? 'disponibile' : 'da_verificare', session.id]);
      if (esame.nuovo) nuoviEsami++;
      for (const s of e.serie) {
        const [serie] = await q<{ id: string }>(
          `insert into imaging_serie (esame_id, serie_uid, modalita, descrizione, numero, parte_corpo)
           values ($1,$2,nullif($3,''),nullif($4,''),$5,nullif($6,''))
           on conflict (esame_id, serie_uid) do update set descrizione = coalesce(nullif(excluded.descrizione,''), imaging_serie.descrizione)
           returning id`, [esame.id, s.serie_uid, s.modalita, s.descrizione, s.numero || null, s.parte_corpo]);
        for (const i of s.immagini) {
          const [img] = await q<{ id: string }>(
            `insert into imaging_immagini (serie_id, sop_uid, numero, frame, righe, colonne, ww, wl, immagine, sop_class, storage_key, byte)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,nullif($10,''),$11,$12)
             on conflict (serie_id, sop_uid) do nothing returning id`,
            [serie.id, i.sop_uid, i.numero || null, i.frame, i.righe || null, i.colonne || null, i.ww, i.wl,
             i.immagine, i.sop_class, chiavi.get(i.sop_uid)!, buffer[i.indice].length]);
          if (img) nuoveImmagini++;
        }
        await q(`update imaging_serie set n_immagini = (select count(*) from imaging_immagini where serie_id = $1) where id = $1`, [serie.id]);
      }
      await q(
        `update imaging_esami set
           n_serie = (select count(*) from imaging_serie where esame_id = $1),
           n_immagini = (select coalesce(sum(n_immagini), 0) from imaging_serie where esame_id = $1),
           byte = (select coalesce(sum(i.byte), 0) from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1),
           updated_at = now()
         where id = $1`, [esame.id]);
      return esame.id;
    });
    ids.push(fatto);
    await registra(sid, fatto, session.id, 'importato');
  }

  console.log(`[imaging] import esami=${esami.length} nuovi=${nuoviEsami} immagini=${nuoveImmagini} scartati=${scartati}`);
  return NextResponse.json({ ok: true, esami: ids.length, nuovi: nuoviEsami, immagini: nuoveImmagini, scartati });
}
