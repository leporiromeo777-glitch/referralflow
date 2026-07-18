import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendPlain } from '@/lib/notify';
import { SOGLIE_FERMA } from '@/lib/watchdog';

export const dynamic = 'force-dynamic';

// Cane da guardia (cron giornaliero): trova le referral ferme oltre soglia
// (dall'ultimo movimento) e avvisa la segreteria di ciascuno studio.
// Email neutra nLPD: solo conteggi, nessun dato del paziente.

type Riga = {
  studio_id: string;
  studio_nome: string;
  notify_email: string | null;
  status: string;
  n: number;
};

const LABEL: Record<string, string> = {
  ricevuta: 'da smistare («ricevuta»)',
  triage: 'in triage',
  da_prenotare: 'in attesa di appuntamento («da prenotare»)',
};

export async function GET(req: NextRequest) {
  const secret = process.env.REMINDER_SECRET;
  const key = req.nextUrl.searchParams.get('key');
  if (!secret || key !== secret) {
    return new NextResponse('Not found', { status: 404 });
  }
  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

  // Una riga per (studio, stato) con il conteggio delle referral oltre soglia.
  const casi: Riga[] = [];
  for (const [status, giorni] of Object.entries(SOGLIE_FERMA)) {
    const rows = await query<Riga>(
      `select r.studio_id, s.nome as studio_nome, s.notify_email,
              r.status::text, count(*)::int as n
         from referrals r
         join studios s on s.id = r.studio_id
        where r.status = $1::referral_status
          and r.updated_at < now() - make_interval(days => $2)
        group by r.studio_id, s.nome, s.notify_email, r.status`,
      [status, giorni]
    );
    casi.push(...rows);
  }

  // Raggruppa per studio e invia una email sola.
  const perStudio = new Map<string, { nome: string; email: string | null; righe: string[] }>();
  for (const c of casi) {
    const g = perStudio.get(c.studio_id)
      ?? { nome: c.studio_nome, email: c.notify_email, righe: [] };
    g.righe.push(`- ${c.n} referral ${LABEL[c.status] ?? c.status} da più di ${SOGLIE_FERMA[c.status]} giorni`);
    perStudio.set(c.studio_id, g);
  }

  let inviate = 0;
  for (const [, g] of perStudio) {
    const to = g.email || process.env.STUDIO_NOTIFY_EMAIL || '';
    if (!to) continue;
    const testo = [
      `Controllo giornaliero di ReferralFlow per ${g.nome}:`,
      '',
      ...g.righe,
      '',
      `Le righe interessate sono evidenziate in coda${base ? `: ${base}/` : '.'}`,
      `Questo messaggio non contiene dati dei pazienti.`,
    ].join('\n');
    if (await sendPlain(to, 'Referral ferme da troppo tempo — da controllare', testo)) inviate++;
  }

  return NextResponse.json({
    studi_con_ferme: perStudio.size,
    email_inviate: inviate,
  });
}
