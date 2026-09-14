import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Medici invianti per l'interfaccia nuova (14.9.2026, punto 3 del piano
// CardioOS): anagrafica, referral negli ultimi 12 mesi e in totale, ultima
// referral, le ultime otto con paziente e stato. POST crea un inviante.
function dCh(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const sid = session.studioId;
  const invianti = await query<{ id: string; nome: string; studio: string | null; email: string | null; telefono: string | null; hin: string | null; n_12m: number; n_tot: number; ultimo: string | null }>(
    `select d.id, d.nome, d.studio, d.email, d.telefono, d.hin_address as hin,
            count(r.id) filter (where r.created_at >= now() - interval '12 months')::int as n_12m,
            count(r.id)::int as n_tot, max(r.created_at)::text as ultimo
       from referring_doctors d left join referrals r on r.referring_doctor_id = d.id
      where d.studio_id = $1 group by d.id order by n_12m desc, d.nome`, [sid]);
  const ultime = await query<{ id: string; referring_doctor_id: string; paziente: string; stato: string; quesito: string | null; creata: string; rn: number }>(
    `select * from (
       select r.id, r.referring_doctor_id, p.cognome || ' ' || p.nome as paziente, r.status::text as stato, r.quesito, r.created_at::text as creata,
              row_number() over (partition by r.referring_doctor_id order by r.created_at desc) as rn
         from referrals r join patients p on p.id = r.patient_id where r.studio_id = $1 and r.referring_doctor_id is not null) x
      where rn <= 8`, [sid]);
  const per = new Map<string, typeof ultime>();
  for (const u of ultime) { const l = per.get(u.referring_doctor_id) ?? []; l.push(u); per.set(u.referring_doctor_id, l); }
  const [tot] = await query<{ n: number }>(`select count(*)::int as n from referrals where studio_id = $1 and created_at >= now() - interval '12 months'`, [sid]);
  return NextResponse.json({
    invianti: invianti.map((d) => ({ ...d, ultimo: dCh(d.ultimo), referral: (per.get(d.id) ?? []).map((u) => ({ id: u.id, paziente: u.paziente, stato: u.stato, quesito: u.quesito ?? '', data: dCh(u.creata) })) })),
    referral_12m: tot?.n ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const s = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max);
  const nome = s(c?.nome, 120);
  if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
  const email = s(c?.email).toLowerCase();
  if (email && !email.includes('@')) return NextResponse.json({ errore: 'E-mail non valida.' }, { status: 400 });
  const [r] = await query<{ id: string }>(`insert into referring_doctors (studio_id, nome, studio, email, telefono) values ($1, $2, nullif($3, ''), nullif($4, ''), nullif($5, '')) returning id`, [session.studioId, nome, s(c?.studio, 160), email, s(c?.telefono, 40)]);
  console.log(`[invianti] creato ${r.id.slice(0, 8)}`);
  return NextResponse.json({ id: r.id }, { status: 201 });
}
