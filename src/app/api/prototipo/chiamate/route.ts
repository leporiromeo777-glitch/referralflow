import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Registro delle chiamate di preparazione (14.9.2026, punto 4 del piano
// CardioOS): una riga per chiamata, con esito e nota breve. La lista «Da
// chiamare» sta in `dati`. Nei log solo id abbreviati.
const ESITI = new Set(['raggiunto', 'segreteria_telefonica', 'non_risponde', 'da_richiamare', 'non_serve']);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const esito = String(c?.esito ?? '');
  if (!ESITI.has(esito)) return NextResponse.json({ errore: 'Esito non valido.' }, { status: 400 });
  const id = (v: unknown) => (typeof v === 'string' && isUuid(v) ? v : null);
  const appointmentId = id(c?.appointment_id), referralId = id(c?.referral_id), patientId = id(c?.patient_id);
  if (!appointmentId && !referralId && !patientId) return NextResponse.json({ errore: 'Serve un appuntamento, una referral o un paziente.' }, { status: 400 });
  const nota = String(c?.nota ?? '').trim().slice(0, 200);
  const [r] = await query<{ id: string }>(
    `insert into preparazione_chiamate (studio_id, appointment_id, referral_id, patient_id, user_id, esito, nota) values ($1, $2, $3, $4, $5, $6, nullif($7, '')) returning id`,
    [session.studioId, appointmentId, referralId, patientId, session.id, esito, nota]);
  console.log(`[chiamate] ${esito} chiamata=${r.id.slice(0, 8)}`);
  return NextResponse.json({ id: r.id }, { status: 201 });
}
