import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

const VEDE = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// «Da dove arriva questo numero?» — la provenienza completa di una misura e la
// sua storia (MSE fase 8): tutto ciò che serve a rifare il calcolo senza
// nient'altro, e ogni evento che l'ha toccata.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'imaging');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!VEDE.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  const [m] = await query<Record<string, unknown>>(
    `select m.id, m.esame_id, m.immagine_id, m.frame, split_part(u.email, '@', 1) as chi, m.created_at::text as quando,
            m.tipo, m.punti, m.punti_fisici, m.valore, m.valore_mostrato, m.unita, m.etichetta, m.extra,
            m.algoritmo, m.versione_calcolo as versione_algoritmo, m.versione_gate, m.versione_software,
            m.stato_validazione, m.avvisi, m.verifica_indipendente, m.calibrazione, m.geometria,
            m.riferimento_misura_id, r.nome as riferimento_nome, r.gruppo as riferimento_gruppo, r.valore as riferimento_valore, r.unita as riferimento_unita,
            m.sostituisce_id, m.annullata_at::text, split_part(ua.email, '@', 1) as annullata_da,
            i.sha256 as sha256_file, i.sop_uid, e.study_uid, s.serie_uid, e.modalita
       from imaging_misure_manuali m
       join imaging_immagini i on i.id = m.immagine_id
       join imaging_serie s on s.id = i.serie_id
       join imaging_esami e on e.id = m.esame_id
       left join users u on u.id = m.user_id
       left join users ua on ua.id = m.annullata_da
       left join imaging_misure r on r.id = m.riferimento_misura_id
      where m.id = $1 and m.studio_id = $2`, [params.id, session.studioId]);
  if (!m) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  const eventi = await query<{ evento: string; chi: string | null; quando: string; prima: unknown; dopo: unknown; versione_software: string | null }>(
    `select ev.evento, split_part(u.email, '@', 1) as chi, ev.created_at::text as quando, ev.prima, ev.dopo, ev.versione_software
       from imaging_misure_eventi ev left join users u on u.id = ev.user_id
      where ev.misura_id = $1 order by ev.created_at, ev.id`, [params.id]);
  const sostituita_da = await query<{ id: string }>(`select id from imaging_misure_manuali where sostituisce_id = $1`, [params.id]);

  return NextResponse.json({ misura: m, eventi, sostituita_da: sostituita_da.map((x) => x.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
