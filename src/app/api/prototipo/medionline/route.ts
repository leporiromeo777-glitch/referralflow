import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { vietato, puo } from '@/lib/permessi';
import { abbina, aggiornaCalendari, annulla, controllo, ErroreCaldav, recuperaPassato, scrivi, stato } from '@/lib/caldav';

export const dynamic = 'force-dynamic';

// MediOnline via CalDAV (23.9.2026): stato dei calendari, fissare e annullare
// un appuntamento, controllo incrociato col robot, recupero del passato.
// - leggere: chi vede l'agenda;
// - fissare e annullare: segreteria, medici, amministrazione, tecnico (non
//   l'aiuto medico);
// - configurare, controllare, recuperare: amministrazione e tecnico.
const SCRIVONO = new Set(['segretaria', 'medico', 'admin', 'tecnico']);
const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function errore(e: unknown) {
  if (e instanceof ErroreCaldav) return NextResponse.json({ errore: e.message }, { status: e.stato });
  const msg = (e as Error)?.message || 'errore';
  console.error(`[medionline] ${msg}`);
  // I messaggi del client CalDAV sono già in italiano e senza dati.
  return NextResponse.json({ errore: /MediOnline/.test(msg) ? msg : 'Errore nel collegamento con MediOnline.' }, { status: 502 });
}

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'agenda');
  if (no) return no;
  try {
    const s = await stato(session.studioId);
    return NextResponse.json({ ...s, puoScrivere: SCRIVONO.has(session.role), puoConfigurare: puo(session.role, 'administration') });
  } catch (e) { return errore(e); }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'agenda');
  if (no) return no;
  const sid = session.studioId;
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const configura = puo(session.role, 'administration');
  try {
    switch (azione) {
      case 'scrivi': {
        if (!SCRIVONO.has(session.role)) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
        if (!isUuid(c?.calendario_id)) return NextResponse.json({ errore: 'Scegli il calendario.' }, { status: 400 });
        if (c?.patient_id != null && c.patient_id !== '' && !isUuid(c.patient_id)) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
        if (c?.conferma !== true) return NextResponse.json({ errore: 'Manca la conferma.' }, { status: 400 });
        const r = await scrivi(sid, session.id, {
          calendario_id: c.calendario_id, data: String(c.data ?? ''), ora: String(c.ora ?? ''), durata: Number(c.durata),
          titolo: String(c.titolo ?? ''), note: String(c.note ?? ''), patient_id: c.patient_id || null,
        });
        return NextResponse.json(r, { status: 201 });
      }
      case 'annulla': {
        if (!SCRIVONO.has(session.role)) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
        if (!isUuid(c?.id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
        return NextResponse.json(await annulla(sid, session.id, c.id));
      }
      case 'aggiorna':
        if (!configura) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
        return NextResponse.json(await aggiornaCalendari(sid));
      case 'abbina':
        if (!configura) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
        if (!isUuid(c?.calendario_id) || (c?.provider_id && !isUuid(c.provider_id))) return NextResponse.json({ errore: 'id' }, { status: 400 });
        await abbina(sid, c.calendario_id, c.provider_id || null);
        return NextResponse.json({ ok: true });
      case 'controllo':
        if (!configura) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
        return NextResponse.json(await controllo(sid));
      case 'recupera':
        if (!configura) return NextResponse.json({ errore: 'non_permesso' }, { status: 403 });
        return NextResponse.json(await recuperaPassato(sid));
      default:
        return NextResponse.json({ errore: 'azione' }, { status: 400 });
    }
  } catch (e) { return errore(e); }
}
