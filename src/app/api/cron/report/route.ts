import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendPlain } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// Report mensile (cron il 1° del mese): numeri del mese precedente per ogni
// studio, via email. Solo aggregati — nessun dato dei pazienti.

type Statistiche = {
  studio_id: string;
  studio_nome: string;
  notify_email: string | null;
  ricevute: number;
  fissati: number;
  giorni_medi: string | null;
  chiuse: number;
  richiami_gestiti: number;
  affidi_esterni: number;
  // «Lavoro invisibile»: ciò che la piattaforma ha fatto in automatico.
  promemoria: number;
  aperte_vigilate: number;
  documenti_custoditi: number;
  accessi_registrati: number;
};

export async function GET(req: NextRequest) {
  const secret = process.env.REMINDER_SECRET;
  const key = req.nextUrl.searchParams.get('key');
  if (!secret || key !== secret) {
    return new NextResponse('Not found', { status: 404 });
  }

  const righe = await query<Statistiche>(
    `with mese as (
       select date_trunc('month', now() - interval '1 month') as dal,
              date_trunc('month', now()) as al
     ),
     prenotazioni as (
       select h.referral_id, min(h.changed_at) as prima
         from referral_status_history h
        where h.to_status = 'prenotata'
        group by h.referral_id
     )
     select s.id as studio_id, s.nome as studio_nome, s.notify_email,
            (select count(*)::int from referrals r, mese m
              where r.studio_id = s.id and r.created_at >= m.dal and r.created_at < m.al) as ricevute,
            (select count(*)::int from prenotazioni p
              join referrals r on r.id = p.referral_id, mese m
              where r.studio_id = s.id and p.prima >= m.dal and p.prima < m.al) as fissati,
            (select round(avg(extract(epoch from (p.prima - r.created_at)) / 86400.0)::numeric, 1)::text
               from prenotazioni p
               join referrals r on r.id = p.referral_id, mese m
              where r.studio_id = s.id and p.prima >= m.dal and p.prima < m.al) as giorni_medi,
            (select count(distinct h.referral_id)::int
               from referral_status_history h
               join referrals r on r.id = h.referral_id, mese m
              where r.studio_id = s.id and h.to_status = 'chiusa'
                and h.changed_at >= m.dal and h.changed_at < m.al) as chiuse,
            (select count(*)::int from referrals r, mese m
              where r.studio_id = s.id and r.follow_up_done_at >= m.dal
                and r.follow_up_done_at < m.al) as richiami_gestiti,
            (select count(*)::int from external_referrals er, mese m
              where er.studio_id = s.id and er.created_at >= m.dal and er.created_at < m.al) as affidi_esterni,
            (select count(*)::int from referrals r, mese m
              where r.studio_id = s.id and r.reminder_sent_at >= m.dal and r.reminder_sent_at < m.al) as promemoria,
            (select count(*)::int from referrals r
              where r.studio_id = s.id and r.status <> 'chiusa') as aperte_vigilate,
            (select count(*)::int from patient_documents pd
              where pd.studio_id = s.id) as documenti_custoditi,
            (select count(*)::int from document_access_log dl, mese m
              where dl.studio_id = s.id and dl.at >= m.dal and dl.at < m.al) as accessi_registrati
       from studios s
      where s.attivo`
  );

  const meseLabel = new Date(Date.now() - 15 * 86_400_000)
    .toLocaleDateString('it-CH', { month: 'long', year: 'numeric' });

  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  let inviate = 0;
  for (const r of righe) {
    // Nessuna attività nel mese: niente report.
    const attivita = r.ricevute + r.fissati + r.chiuse + r.richiami_gestiti
      + r.affidi_esterni + r.promemoria + r.accessi_registrati;
    if (attivita === 0) continue;
    const to = r.notify_email || process.env.STUDIO_NOTIFY_EMAIL || '';
    if (!to) continue;

    // «Lavoro invisibile»: righe mostrate solo se non nulle (i backup sono
    // sempre veri). Rende visibile ciò che la piattaforma fa in automatico.
    const lavoro = [
      r.promemoria > 0 && `• Promemoria inviati ai pazienti: ${r.promemoria}`,
      r.aperte_vigilate > 0 && `• Referral tenute sotto controllo contro i ritardi: ${r.aperte_vigilate}`,
      r.documenti_custoditi > 0 && `• Documenti dei pazienti custoditi in sicurezza (Svizzera): ${r.documenti_custoditi}`,
      r.accessi_registrati > 0 && `• Accessi ai documenti registrati (tracciabilità nLPD): ${r.accessi_registrati}`,
      `• Copie di sicurezza dei dati: ogni notte, su server in Svizzera`,
    ].filter(Boolean);

    const testo = [
      `Il mese di ${r.studio_nome} su ReferralFlow — ${meseLabel}.`,
      '',
      `I VOSTRI RISULTATI`,
      `• Referral ricevute: ${r.ricevute}`,
      `• Appuntamenti fissati: ${r.fissati}${r.giorni_medi ? ` (in media ${r.giorni_medi} giorni dalla richiesta)` : ''}`,
      `• Percorsi conclusi: ${r.chiuse}`,
      `• Richiami gestiti: ${r.richiami_gestiti}`,
      `• Pazienti affidati ad altri studi: ${r.affidi_esterni}`,
      '',
      `IL LAVORO CHE REFERRALFLOW HA FATTO PER VOI, IN AUTOMATICO`,
      ...lavoro,
      '',
      `Dettagli e andamento: ${base}/statistiche`,
      `Questo report contiene solo numeri aggregati, nessun dato dei pazienti.`,
    ].join('\n');

    if (await sendPlain(to, `ReferralFlow — il suo mese di ${meseLabel}`, testo)) inviate++;
  }

  return NextResponse.json({ studi: righe.length, report_inviati: inviate });
}
