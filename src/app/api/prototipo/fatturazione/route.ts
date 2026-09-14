import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { csvPrestazioni, nomeFileCsv, periodoMese, riepilogoPrestazioni, type RigaFattura } from '@/lib/fatturazione';

export const dynamic = 'force-dynamic';

// Prestazioni da fatturare (14.9.2026). GET ?mese=AAAA-MM → le righe del
// mese (appuntamenti già passati) con: paziente dalla cartella se abbinato,
// medico, prestazione (motivo dell'agenda), visita segnata fatta, referto
// confermato della catena nei 3 giorni dopo, medico inviante, già esportata.
// POST {mese, includi_esportate} → il CSV per il gestionale di fatturazione;
// segna le righe come esportate e registra l'esportazione (solo conteggi).
// Segreteria e amministratore: il medico vede, non esporta.

function dCh(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function ora(iso: string): string { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function slug(s: string): string { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

async function righeDelMese(studioId: string, dal: string, al: string): Promise<RigaFattura[]> {
  const appts = await query<{ id: string; starts_at: string; ends_at: string | null; paziente_nome: string | null; titolo: string | null; motivo: string | null; luogo: string | null; completed_at: string | null; esportato: string | null; medico: string | null; patient_id: string | null; inviante: string | null; referto: boolean }>(
    `select a.id, a.starts_at::text, a.ends_at::text, a.paziente_nome, a.titolo, a.motivo, a.luogo, a.completed_at::text, a.fatturazione_esportato_at::text as esportato,
            pr.nome as medico, r.patient_id, rd.nome as inviante,
            exists (select 1 from referti_bozze b where b.studio_id = a.studio_id and b.stato = 'confermata' and b.tipo = 'referto'
                      and b.created_at >= a.starts_at::date and b.created_at < a.starts_at::date + 4
                      and lower(regexp_replace(coalesce(nullif(b.campi_confermati->>'nome_paziente', ''), b.payload->'campi_estratti'->>'nome_paziente', ''), '\\s+', ' ', 'g')) = lower(regexp_replace(coalesce(a.paziente_nome, ''), '\\s+', ' ', 'g'))) as referto
       from appointments a
       left join providers pr on pr.id = a.provider_id
       left join referrals r on r.id = a.referral_id
       left join referring_doctors rd on rd.id = r.referring_doctor_id
      where a.studio_id = $1 and a.starts_at >= $2::date and a.starts_at < $3::date and a.starts_at < now()
      order by a.starts_at`, [studioId, dal, al]);
  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null; assicurazione: string | null; avs: string | null; n_assicurato: string | null }>(
    `select id, cognome, nome, data_nascita::text, assicurazione, avs, n_assicurato from patients where studio_id = $1`, [studioId]);
  const perId = new Map(pazienti.map((p) => [p.id, p]));
  const perNome = new Map(pazienti.map((p) => [slug(`${p.cognome} ${p.nome}`), p]));
  return appts.map((a) => {
    const nome = (a.paziente_nome ?? a.titolo ?? '').trim();
    const p = (a.patient_id && perId.get(a.patient_id)) || perNome.get(slug(nome)) || null;
    const pezzi = nome.split(/\s+/);
    const fine = a.ends_at ? new Date(a.ends_at).getTime() : new Date(a.starts_at).getTime() + 30 * 60000;
    return {
      id: a.id, data: dCh(a.starts_at), ora: ora(a.starts_at), durata: Math.max(5, Math.round((fine - new Date(a.starts_at).getTime()) / 60000)),
      cognome: p ? p.cognome : pezzi[0] ?? '', nome: p ? p.nome : pezzi.slice(1).join(' '), nascita: p ? dCh(p.data_nascita) : '', assicurazione: p?.assicurazione ?? '', avs: p?.avs ?? '', n_assicurato: p?.n_assicurato ?? '', in_cartella: !!p,
      medico: a.medico ?? '', prestazione: a.motivo || a.titolo || 'Appuntamento', luogo: a.luogo ?? '',
      fatta: !!a.completed_at, referto: a.referto, inviante: a.inviante ?? '', esportato_il: dCh(a.esportato),
    };
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const per = periodoMese(req.nextUrl.searchParams.get('mese')) ?? periodoMese(new Date().toISOString().slice(0, 7))!;
  const righe = await righeDelMese(session.studioId, per.dal, per.al);
  const esportazioni = await query<{ dal: string; al: string; righe: number; da: string | null; at: string }>(
    `select e.dal::text, e.al::text, e.righe, split_part(u.email, '@', 1) as da, e.created_at::text as at from fatturazione_esportazioni e left join users u on u.id = e.user_id
      where e.studio_id = $1 order by e.created_at desc limit 12`, [session.studioId]);
  return NextResponse.json({ periodo: per, righe, riepilogo: riepilogoPrestazioni(righe), esportazioni, puo_esportare: session.role !== 'medico' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (session.role === 'medico') return NextResponse.json({ errore: 'L’esportazione la fa la segreteria o l’amministratore.' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const per = periodoMese(String(c?.mese ?? ''));
  if (!per) return NextResponse.json({ errore: 'Mese non valido (AAAA-MM).' }, { status: 400 });
  const tutte = await righeDelMese(session.studioId, per.dal, per.al);
  const righe = c?.includi_esportate ? tutte : tutte.filter((r) => !r.esportato_il);
  if (!righe.length) return NextResponse.json({ errore: 'Nessuna prestazione da esportare in questo mese.' }, { status: 404 });
  const csv = csvPrestazioni(righe);
  const impronta = createHash('sha256').update(csv).digest('hex').slice(0, 16);
  await query(`update appointments set fatturazione_esportato_at = now() where studio_id = $1 and id = any($2::uuid[]) and fatturazione_esportato_at is null`, [session.studioId, righe.map((r) => r.id)]);
  await query(`insert into fatturazione_esportazioni (studio_id, dal, al, righe, user_id, impronta) values ($1, $2, $3, $4, $5, $6)`, [session.studioId, per.dal, per.al, righe.length, session.id, impronta]);
  console.log(`[fatturazione] esportazione ${per.dal}..${per.al} righe=${righe.length} impronta=${impronta}`);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nomeFileCsv(per.dal, per.al)}"`, 'Cache-Control': 'no-store' } });
}
