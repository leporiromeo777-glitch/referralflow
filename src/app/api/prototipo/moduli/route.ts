import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { caricaModuli, validaCompilazione } from '@/lib/moduli';

export const dynamic = 'force-dynamic';

// Moduli dello studio per il prototipo (14.9.2026): le definizioni dalla wiki
// e l'elenco delle compilazioni (senza le risposte: quelle stanno nel dettaglio
// e ogni lettura lascia una riga in `moduli_accessi`). POST crea una
// compilazione; la validazione è quella pura di `moduli.ts`.
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const moduli = caricaModuli();
  const compilazioni = await query<{ id: string; modulo: string; codice: string; titolo: string; patient_id: string | null; paziente: string | null; da: string | null; completo: boolean; created_at: string; updated_at: string }>(
    `select c.id, c.modulo, c.codice, c.titolo, c.patient_id, p.cognome || ' ' || p.nome as paziente, split_part(u.email, '@', 1) as da, c.completo, c.created_at::text, c.updated_at::text
       from moduli_compilazioni c left join patients p on p.id = c.patient_id left join users u on u.id = c.compilato_da
      where c.studio_id = $1 order by c.updated_at desc limit 200`, [session.studioId]);
  return NextResponse.json({ moduli, compilazioni }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const modulo = caricaModuli().find((m) => m.id === String(c?.modulo ?? ''));
  if (!modulo) return NextResponse.json({ errore: 'Modulo sconosciuto.' }, { status: 400 });
  const patientId = typeof c?.patient_id === 'string' && isUuid(c.patient_id) ? c.patient_id : null;
  if (patientId) {
    const [p] = await query<{ id: string }>('select id from patients where id = $1 and studio_id = $2', [patientId, session.studioId]);
    if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 400 });
  }
  const v = validaCompilazione(modulo, c?.dati && typeof c.dati === 'object' ? c.dati : {});
  const [riga] = await query<{ id: string }>(
    `insert into moduli_compilazioni (studio_id, modulo, codice, titolo, patient_id, compilato_da, dati, completo) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) returning id`,
    [session.studioId, modulo.id, modulo.codice, modulo.titolo, patientId, session.id, JSON.stringify(v.dati), v.completo]);
  await query(`insert into moduli_accessi (compilazione_id, studio_id, user_id, azione) values ($1, $2, $3, 'creazione')`, [riga.id, session.studioId, session.id]);
  console.log(`[moduli] creazione ${modulo.codice} compilazione=${riga.id.slice(0, 8)} completo=${v.completo} errori=${Object.keys(v.errori).length}`);
  return NextResponse.json({ id: riga.id, completo: v.completo, errori: v.errori }, { status: 201 });
}
