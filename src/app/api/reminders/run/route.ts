import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';

// Motore dei promemoria: chiamato dal cron (o a mano) con ?key=REMINDER_SECRET.
// Invia l'SMS di promemoria ai pazienti con appuntamento nelle prossime 48 ore.
// Testo neutro nLPD: solo data/ora e link di conferma, nessun nome né dato clinico.

type Row = {
  id: string;
  appuntamento_at: string;
  appt_token: string;
  telefono: string;
  studio_nome: string;
  ha_preparazione: boolean;
};

function dataOraCH(d: string): string {
  return new Date(d).toLocaleString('it-CH', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.REMINDER_SECRET;
  const key = req.nextUrl.searchParams.get('key');
  if (!secret || key !== secret) {
    return new NextResponse('Not found', { status: 404 });
  }

  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const rows = await query<Row>(
    `select r.id, r.appuntamento_at::text, r.appt_token, p.telefono,
            s.nome as studio_nome,
            (r.preparazione_id is not null) as ha_preparazione
       from referrals r
       join patients p on p.id = r.patient_id
       join studios s on s.id = r.studio_id
      where r.status = 'prenotata'
        and r.appuntamento_at between now() and now() + interval '48 hours'
        and r.reminder_sent_at is null
        and (r.appt_response is null or r.appt_response = 'confermato')
        and p.telefono is not null and length(trim(p.telefono)) > 0
        and r.appt_token is not null`
  );

  let inviati = 0;
  let registrati = 0;
  let errori = 0;

  for (const r of rows) {
    // Testo compatto: deve stare in UN solo SMS (160 caratteri GSM), altrimenti
    // il messaggio viaggia spezzato e su alcuni telefoni il link arriva rotto.
    // Il link breve /a/<token> reindirizza alla pagina appuntamento (che mostra
    // anche la preparazione, se assegnata). Nessun dato medico nel testo.
    const testo = [
      `${r.studio_nome}: promemoria appuntamento ${dataOraCH(r.appuntamento_at)}.`,
      base ? `Conferma o disdica: ${base}/a/${r.appt_token}` : '',
    ].filter(Boolean).join(' ');

    const esito = await sendSms(r.telefono.trim(), testo);
    if (esito === 'errore') {
      errori++;
      continue; // riproverà alla prossima esecuzione
    }
    await query('update referrals set reminder_sent_at = now() where id = $1', [r.id]);
    await query(
      `insert into notifications (referral_id, tipo, canale) values ($1, 'promemoria', $2)`,
      [r.id, esito]
    );
    if (esito === 'sms') inviati++;
    else registrati++;
  }

  return NextResponse.json({ candidati: rows.length, inviati, registrati, errori });
}
