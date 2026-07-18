import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Export CSV delle referral (uso interno, autenticato).
// Separatore ; e BOM UTF-8 per aprirsi correttamente in Excel it-CH.

type Row = {
  created_at: string;
  cognome: string;
  nome: string;
  urgenza: string;
  status: string;
  medico: string | null;
  canale: string | null;
  appuntamento_at: string | null;
  giorni_appuntamento: string | null;
  chiusa_at: string | null;
  follow_up_months: number | null;
  follow_up_due: string | null;
};

function cell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role === 'medico') {
    return new NextResponse('Non autorizzato', { status: 401 });
  }

  const rows = await query<Row>(
    `select to_char(r.created_at, 'YYYY-MM-DD HH24:MI') as created_at,
            p.cognome, p.nome, r.urgenza::text, r.status::text,
            d.nome as medico, r.canale,
            to_char(r.appuntamento_at, 'YYYY-MM-DD HH24:MI') as appuntamento_at,
            case when h.first_prenotata is not null
              then round(extract(epoch from (h.first_prenotata - r.created_at)) / 86400.0, 1)::text
              else null end as giorni_appuntamento,
            to_char(hc.chiusa_at, 'YYYY-MM-DD') as chiusa_at,
            r.follow_up_months, r.follow_up_due::text
       from referrals r
       join patients p on p.id = r.patient_id
       left join referring_doctors d on d.id = r.referring_doctor_id
       left join (
         select referral_id, min(changed_at) as first_prenotata
           from referral_status_history where to_status = 'prenotata' group by referral_id
       ) h on h.referral_id = r.id
       left join (
         select referral_id, max(changed_at) as chiusa_at
           from referral_status_history where to_status = 'chiusa' group by referral_id
       ) hc on hc.referral_id = r.id
      where r.studio_id = $1
      order by r.created_at desc`,
    [session.studioId]
  );

  const header = [
    'Ricevuta il', 'Cognome', 'Nome', 'Urgenza', 'Stato', 'Medico inviante', 'Canale',
    'Appuntamento', 'Giorni a appuntamento', 'Chiusa il', 'Follow-up (mesi)', 'Richiamo previsto',
  ].join(';');

  const lines = rows.map((r) =>
    [
      r.created_at, r.cognome, r.nome, r.urgenza, r.status, r.medico, r.canale,
      r.appuntamento_at, r.giorni_appuntamento, r.chiusa_at, r.follow_up_months, r.follow_up_due,
    ].map(cell).join(';')
  );

  const csv = '﻿' + [header, ...lines].join('\r\n');
  const oggi = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="referral-${oggi}.csv"`,
    },
  });
}
