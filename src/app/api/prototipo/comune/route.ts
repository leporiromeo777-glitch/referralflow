import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { assegna, creaCartellaEAssegna, fileDaGuardare, giroComune, puoComune, scarta, stato } from '@/lib/comune/archivio';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

// Le lettere della cartella comune (22.10.2026, [[Piattaforma/Cartella comune]]).
//   GET   → collegata?, ultimi controlli, conteggi, cartelle da assegnare, lettere caricate negli ultimi sette giorni
//   POST  { azione: 'controlla' }  → un controllo adesso (un lotto)
//         { azione: 'assegna' | 'crea_cartella' | 'scarta', id, patient_id?, cognome?, nome?, data_nascita? }
// I permessi si applicano QUI; nei log nessun valore.
const no = { headers: { 'Cache-Control': 'no-store' } };
const esito = (r: { errore: string; stato?: number } | Record<string, unknown>) =>
  ('errore' in r ? NextResponse.json({ errore: r.errore }, { status: (r as { stato?: number }).stato ?? 400 }) : NextResponse.json(r, no));

async function sessione() {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const v = vietato(session.role, 'comune');
  if (v) return { errore: v };
  if (!puoComune(session.role, 'vedere')) return { errore: NextResponse.json({ errore: 'Il tuo ruolo non accede alla cartella comune.' }, { status: 403 }) };
  return { session };
}

export async function GET(req: Request) {
  const s = await sessione(); if ('errore' in s) return s.errore;
  // ?file=<id>: un file della cartella comune da guardare prima di decidere
  const file = new URL(req.url).searchParams.get('file');
  if (file !== null) {
    if (!isUuid(file)) return NextResponse.json({ errore: 'file' }, { status: 400 });
    const f = await fileDaGuardare(s.session.studioId!, file);
    if ('errore' in f) return NextResponse.json({ errore: f.errore }, { status: f.stato });
    console.log('[comune] file guardato prima di decidere');
    const intestazioni: Record<string, string> = { 'Content-Type': f.tipo, 'Content-Disposition': 'inline', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    // il Word diventato pagina: niente script né risorse esterne (il PDF no: il lettore del browser non partirebbe)
    if (f.tipo.startsWith('text/html')) intestazioni['Content-Security-Policy'] = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";
    return new NextResponse(new Uint8Array(f.corpo), { headers: intestazioni });
  }
  return NextResponse.json({ ...(await stato(s.session.studioId!)), puo: { assegnare: puoComune(s.session.role, 'assegnare') } }, no);
}

export async function POST(req: Request) {
  const s = await sessione(); if ('errore' in s) return s.errore;
  const { session } = s;
  if (!puoComune(session.role, 'assegnare')) return NextResponse.json({ errore: 'Il tuo ruolo non assegna le cartelle.' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  if (azione === 'controlla') {
    const r = await giroComune({ fermoMs: 0 });
    if (r.cartella === 'assente') return NextResponse.json({ errore: 'La cartella comune non è collegata a questo Mac: aprila dal Finder (Vai → Connessione al server) e riprova.' }, { status: 409 });
    return NextResponse.json({ ok: true, ...r }, no);
  }
  const id = String(c?.id ?? '');
  if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  if (azione === 'assegna') {
    if (!isUuid(String(c?.patient_id ?? ''))) return NextResponse.json({ errore: 'Scegli il paziente.' }, { status: 400 });
    return esito(await assegna(session.studioId!, session.id, id, String(c.patient_id)));
  }
  if (azione === 'crea_cartella') return esito(await creaCartellaEAssegna(session.studioId!, session.id, id, { cognome: c?.cognome, nome: c?.nome, data_nascita: c?.data_nascita }));
  if (azione === 'scarta') return esito(await scarta(session.studioId!, session.id, id));
  return NextResponse.json({ errore: 'azione' }, { status: 400 });
}
