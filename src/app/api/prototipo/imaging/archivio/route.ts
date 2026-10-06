import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { cercaLibera, cercaPerPaziente, chiediEsame, statoArchivio, statoRichiesta } from '@/lib/imaging-archivio';
import { spiegaErrore, uidValido } from '@/lib/imaging-archivio-regole';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// L'archivio dello studio (6.10.2026, [[Piattaforma/Immagini]]): cercare gli
// esami di un paziente nel software Philips e farsene mandare uno da guardare.
//   GET ?paziente=<id>   gli esami di quel paziente della cartella
//   GET ?q=<testo>       ricerca libera: un cognome o una data di nascita
//   GET ?richiesta=<id>  a che punto è un recupero
//   GET ?prova=1         l'archivio risponde? la ricezione è accesa?
//   POST { azione: 'recupera', study_uid, patient_id? }
// Chi cura, come per l'esame aperto: il tecnico no. Ogni ricerca finisce nel
// registro degli accessi, senza dire chi si è cercato.
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

async function sessione() {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const no = vietato(session.role, 'imaging');
  if (no) return { errore: no };
  if (!RUOLI.has(session.role)) return { errore: NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 }) };
  return { session };
}
const registra = (studioId: string, userId: string, azione: string) =>
  query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,null,$2,$3)`, [studioId, userId, azione]).catch(() => null);
const no = { headers: { 'Cache-Control': 'no-store' } };

export async function GET(req: NextRequest) {
  const { session, errore } = await sessione();
  if (errore) return errore;
  const sid = session.studioId;
  const p = req.nextUrl.searchParams;
  if (p.get('prova')) return NextResponse.json(await statoArchivio(true), no);
  const richiesta = p.get('richiesta');
  if (richiesta) {
    const r = isUuid(richiesta) ? await statoRichiesta(sid, richiesta) : null;
    if (!r) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    return NextResponse.json({ ...r, messaggio: r.stato === 'fallito' ? spiegaErrore(r.motivo) : null }, no);
  }
  const paziente = p.get('paziente');
  if (paziente) {
    if (!isUuid(paziente)) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
    const r = await cercaPerPaziente(sid, paziente);
    if (r.errore === 'paziente') return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    await registra(sid, session.id, 'archivio_cerca');
    return NextResponse.json({ esami: r.esami, errore: r.errore ?? null, messaggio: r.errore ? spiegaErrore(r.errore) : null }, no);
  }
  const q = (p.get('q') ?? '').slice(0, 80);
  const r = await cercaLibera(sid, q);
  if (r.errore === 'cosa_cercare') return NextResponse.json({ esami: [], errore: r.errore, messaggio: 'Scrivi un cognome (almeno tre lettere) o una data di nascita.' }, no);
  await registra(sid, session.id, 'archivio_cerca');
  return NextResponse.json({ esami: r.esami, troncata: !!r.troncata, errore: r.errore ?? null, messaggio: r.errore ? spiegaErrore(r.errore) : null }, no);
}

export async function POST(req: NextRequest) {
  const { session, errore } = await sessione();
  if (errore) return errore;
  const c = await req.json().catch(() => null);
  if (c?.azione !== 'recupera') return NextResponse.json({ errore: 'azione' }, { status: 400 });
  if (!uidValido(c.study_uid)) return NextResponse.json({ errore: 'study_uid' }, { status: 400 });
  const pid = c.patient_id ? String(c.patient_id) : null;
  if (pid && !isUuid(pid)) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
  const r = await chiediEsame(session.studioId, session.id, c.study_uid, pid);
  if ('errore' in r) return NextResponse.json({ errore: r.errore, messaggio: spiegaErrore(r.errore) }, { status: r.errore === 'paziente' ? 404 : 409 });
  return NextResponse.json(r);
}
