import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { caricaModuli, validaCompilazione } from '@/lib/moduli';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// Una compilazione con le risposte (GET, registra la lettura) e il suo
// aggiornamento (POST; `azione: 'stampa'` registra solo la stampa). Le
// risposte non compaiono mai nei log: solo id abbreviati e conteggi.
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function leggi(id: string, studioId: string) {
  const [c] = await query<{ id: string; modulo: string; codice: string; titolo: string; patient_id: string | null; paziente: string | null; nascita: string | null; da: string | null; dati: Record<string, string>; completo: boolean; created_at: string; updated_at: string }>(
    `select c.id, c.modulo, c.codice, c.titolo, c.patient_id, p.cognome || ' ' || p.nome as paziente, p.data_nascita::text as nascita, split_part(u.email, '@', 1) as da, c.dati, c.completo, c.created_at::text, c.updated_at::text
       from moduli_compilazioni c left join patients p on p.id = c.patient_id left join users u on u.id = c.compilato_da
      where c.id = $1 and c.studio_id = $2`, [id, studioId]);
  return c ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'moduli');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  const c = await leggi(params.id, session.studioId);
  if (!c) return NextResponse.json({ errore: 'Compilazione non trovata.' }, { status: 404 });
  await query(`insert into moduli_accessi (compilazione_id, studio_id, user_id, azione) values ($1, $2, $3, 'lettura')`, [c.id, session.studioId, session.id]);
  const accessi = await query<{ azione: string; da: string | null; at: string }>(
    `select a.azione, split_part(u.email, '@', 1) as da, a.at::text from moduli_accessi a left join users u on u.id = a.user_id where a.compilazione_id = $1 order by a.at desc limit 30`, [c.id]);
  const modulo = caricaModuli().find((m) => m.id === c.modulo) ?? null;
  return NextResponse.json({ compilazione: c, modulo, accessi }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'moduli');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  const c = await leggi(params.id, session.studioId);
  if (!c) return NextResponse.json({ errore: 'Compilazione non trovata.' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  if (corpo?.azione === 'stampa') {
    await query(`insert into moduli_accessi (compilazione_id, studio_id, user_id, azione) values ($1, $2, $3, 'stampa')`, [c.id, session.studioId, session.id]);
    return NextResponse.json({ ok: true });
  }
  const modulo = caricaModuli().find((m) => m.id === c.modulo);
  if (!modulo) return NextResponse.json({ errore: 'Il modulo non è più nella wiki: la compilazione resta leggibile ma non si modifica.' }, { status: 409 });
  const v = validaCompilazione(modulo, corpo?.dati && typeof corpo.dati === 'object' ? corpo.dati : {});
  await query(`update moduli_compilazioni set dati = $3::jsonb, completo = $4, updated_at = now() where id = $1 and studio_id = $2`, [c.id, session.studioId, JSON.stringify(v.dati), v.completo]);
  await query(`insert into moduli_accessi (compilazione_id, studio_id, user_id, azione) values ($1, $2, $3, 'modifica')`, [c.id, session.studioId, session.id]);
  console.log(`[moduli] modifica ${c.codice} compilazione=${c.id.slice(0, 8)} completo=${v.completo} errori=${Object.keys(v.errori).length}`);
  return NextResponse.json({ id: c.id, completo: v.completo, errori: v.errori });
}
