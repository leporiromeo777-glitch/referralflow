import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { finestreDi } from '@/lib/imaging-ordina';

export const dynamic = 'force-dynamic';

const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// Un esame aperto: le sue serie e, dentro, le immagini in ordine. L'apertura
// finisce nel registro: le immagini sono dati sanitari, e «chi l'ha visto?»
// deve avere una risposta.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const sid = session.studioId;

  const [esame] = await query<{
    id: string; data_esame: string | null; ora_esame: string | null; descrizione: string | null; modalita: string;
    stato: string; n_serie: number; n_immagini: number; byte: string; istituto: string | null; inviante: string | null;
    accession: string | null; paziente_dicom: string | null; paziente_nascita: string | null;
    patient_id: string | null; paziente: string | null; created_at: string;
  }>(
    `select e.id, e.data_esame::text, e.ora_esame, e.descrizione, e.modalita, e.stato, e.n_serie, e.n_immagini,
            e.byte::text, e.istituto, e.inviante, e.accession, e.paziente_dicom, e.paziente_nascita::text,
            e.patient_id, case when p.id is null then null else (p.cognome || ' ' || p.nome) end as paziente,
            e.created_at::text
       from imaging_esami e left join patients p on p.id = e.patient_id
      where e.id = $1 and e.studio_id = $2`, [params.id, sid]);
  if (!esame) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  const serie = await query<{ id: string; modalita: string | null; descrizione: string | null; numero: number | null; parte_corpo: string | null; n_immagini: number }>(
    `select id, modalita, descrizione, numero, parte_corpo, n_immagini from imaging_serie where esame_id = $1 order by numero nulls last, id`, [params.id]);

  const immagini = await query<{ id: string; serie_id: string; numero: number | null; frame: number; righe: number | null; colonne: number | null; ww: number | null; wl: number | null; immagine: boolean; sop_class: string | null; calibrazione: unknown; geometria: unknown }>(
    `select i.id, i.serie_id, i.numero, i.frame, i.righe, i.colonne, i.ww, i.wl, i.immagine, i.sop_class, i.calibrazione, i.geometria
       from imaging_immagini i join imaging_serie s on s.id = i.serie_id
      where s.esame_id = $1 order by s.numero nulls last, i.numero nulls last, i.id`, [params.id]);

  // Le misure fatte da una persona col righello (dispositivo in-house dello
  // studio, docs/legale/dispositivo-in-house/): anche quelle annullate, perché
  // l'annullamento è parte della storia della misura.
  const misureManuali = await query<{
    id: string; immagine_id: string; frame: number; valore: number; unita: string; etichetta: string | null;
    punti: unknown; chi: string | null; quando: string; annullata_at: string | null; annullata_da: string | null;
    riferimento_misura_id: string | null; riferimento_nome: string | null; riferimento_valore: number | null; riferimento_unita: string | null;
  }>(
    `select m.id, m.immagine_id, m.frame, m.valore, m.unita, m.etichetta, m.punti, split_part(u.email, '@', 1) as chi,
            m.created_at::text as quando, m.annullata_at::text, split_part(ua.email, '@', 1) as annullata_da,
            m.riferimento_misura_id, r.nome as riferimento_nome, r.valore as riferimento_valore, r.unita as riferimento_unita
       from imaging_misure_manuali m
       left join users u on u.id = m.user_id
       left join users ua on ua.id = m.annullata_da
       left join imaging_misure r on r.id = m.riferimento_misura_id
      where m.esame_id = $1 order by m.created_at`, [params.id]);

  // Le misure fatte DALL'APPARECCHIO, lette dal suo referto strutturato.
  const misure = await query<{ id: string; gruppo: string | null; nome: string; valore: number; unita: string | null }>(
    `select id, gruppo, nome, valore, unita from imaging_misure where esame_id = $1 order by ordine`, [params.id]);

  try {
    await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,$3,'aperto')`,
      [sid, params.id, session.id]);
  } catch (e) { console.error(`[imaging] registro accessi: ${(e as Error)?.message ?? e}`); }

  const accessi = await query<{ quando: string; chi: string | null; azione: string }>(
    `select a.created_at::text as quando, split_part(u.email, '@', 1) as chi, a.azione
       from imaging_accessi a left join users u on u.id = a.user_id
      where a.esame_id = $1 order by a.created_at desc limit 20`, [params.id]);

  return NextResponse.json(
    { esame, serie: serie.map((s) => ({ ...s, immagini: immagini.filter((i) => i.serie_id === s.id) })), finestre: finestreDi(esame.modalita), misure, misure_manuali: misureManuali, accessi },
    { headers: { 'Cache-Control': 'no-store' } });
}
