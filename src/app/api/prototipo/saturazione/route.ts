import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { assegna, creaCartellaEAssegna, elenco, puoSat, scarta } from '@/lib/saturazione/archivio';

export const dynamic = 'force-dynamic';

// Saturazione notturna (22.10.2026, [[Piattaforma/Saturazione notturna]]).
//   GET                    → le registrazioni nelle cartelle e gli invii da assegnare   GET ?paziente=<id> → quelle di un paziente
//   POST { azione: 'assegna' | 'crea_cartella' | 'scarta', id, patient_id?, cognome?, nome?, data_nascita? }
// I permessi si applicano QUI; nei log nessun valore.
const no = { headers: { 'Cache-Control': 'no-store' } };
const esito = (r: { errore: string; stato?: number } | Record<string, unknown>) =>
  ('errore' in r ? NextResponse.json({ errore: r.errore }, { status: (r as { stato?: number }).stato ?? 400 }) : NextResponse.json(r, no));

async function sessione() {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const v = vietato(session.role, 'saturazione');
  if (v) return { errore: v };
  if (!puoSat(session.role, 'vedere')) return { errore: NextResponse.json({ errore: 'La saturazione la vede chi cura: il tuo ruolo non ci accede.' }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const s = await sessione(); if ('errore' in s) return s.errore;
  const paziente = req.nextUrl.searchParams.get('paziente');
  if (paziente && !isUuid(paziente)) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
  return NextResponse.json({ ...(await elenco(s.session.studioId!, paziente)), puo: { assegnare: puoSat(s.session.role, 'assegnare') } }, no);
}

export async function POST(req: NextRequest) {
  const s = await sessione(); if ('errore' in s) return s.errore;
  const { session } = s;
  if (!puoSat(session.role, 'assegnare')) return NextResponse.json({ errore: 'Il tuo ruolo non assegna gli invii.' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? ''), id = String(c?.id ?? '');
  if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  if (azione === 'assegna') {
    if (!isUuid(String(c?.patient_id ?? ''))) return NextResponse.json({ errore: 'Scegli il paziente.' }, { status: 400 });
    return esito(await assegna(session.studioId!, session.id, id, String(c.patient_id)));
  }
  if (azione === 'crea_cartella') return esito(await creaCartellaEAssegna(session.studioId!, session.id, id, { cognome: c?.cognome, nome: c?.nome, data_nascita: c?.data_nascita }));
  if (azione === 'scarta') return esito(await scarta(session.studioId!, session.id, id));
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
