import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import { indirizzoSmb, leggiCondivisioni, scriptWindows } from '@/lib/cartella-dettati';
import { cartellaPressione } from '@/lib/pressione/cartella-server';
import {
  assegnaArrivo, elencoArrivi, scartaArrivo,
  caricaProfilo, decidiProposta, elencoFarmaci, elencoProfili, eliminaProfilo, generaProposte, proposteAccese, puoPa,
  salvaFarmaco, salvaImpostazioni, salvaTerapia, togliConferma,
} from '@/lib/pressione/archivio';

export const dynamic = 'force-dynamic';

// Pressione (7.10.2026, [[Piattaforma/Pressione]]): il profilo pressorio delle
// 24 ore con la terapia sopra.
//   GET                      → gli ultimi profili      GET ?paziente=<id> → quelli di un paziente
//   GET ?vista=farmaci       → la tabella dei farmaci
//   POST { azione: 'carica' | 'terapia' | 'impostazioni' | 'elimina' | 'farmaco' | 'farmaco_togli' | 'proponi' | 'decidi', … }
// I permessi si applicano QUI. Il file del profilo arriva nel corpo, mai
// nell'indirizzo; nei log non entra nessun valore.
const no = { headers: { 'Cache-Control': 'no-store' } };

async function sessione() {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const v = vietato(session.role, 'pressione');
  if (v) return { errore: v };
  // Il tecnico vede il menu (tiene in piedi il sistema) ma non i dati clinici.
  if (!puoPa(session.role, 'vedere')) return { errore: NextResponse.json({ errore: 'La pressione la vede chi cura: il tuo ruolo non ci accede.' }, { status: 403 }) };
  return { session };
}
const esito = (r: { errore: string; stato?: number } | Record<string, unknown>) =>
  ('errore' in r ? NextResponse.json({ errore: r.errore }, { status: (r as { stato?: number }).stato ?? 400 }) : NextResponse.json(r, no));
const nonPuoi = (che: string) => NextResponse.json({ errore: che }, { status: 403 });

// La cartella condivisa (8.10.2026): dov'è, se il Mac la condivide in rete e con che nome.
// Nessuna credenziale: utente e password li chiede il computer che si collega.
const nomeHost = (): string => { const h = process.env.CARTELLA_DETTATI_HOST || os.hostname(); return h.endsWith('.local') || process.env.CARTELLA_DETTATI_HOST ? h : `${h}.local`; };
function ipLocale(): string | null {
  for (const lista of Object.values(os.networkInterfaces())) for (const a of lista ?? []) if (a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
  return null;
}
const condivisioni = (): Promise<string> => new Promise((ok) => execFile('/usr/sbin/sharing', ['-l'], { timeout: 10_000 }, (_e, out) => ok(String(out ?? ''))));
async function statoCartella() {
  const percorso = cartellaPressione();
  const c = leggiCondivisioni(await condivisioni()).find((x) => path.resolve(x.percorso) === path.resolve(percorso)) ?? null;
  return { nome: path.basename(percorso), percorso, condivisa: !!c, nome_rete: c?.nome ?? null, mac: c ? indirizzoSmb(nomeHost(), c.nome) : null, ip: ipLocale() };
}

export async function GET(req: NextRequest) {
  const { session, errore } = await sessione();
  if (errore) return errore;
  const sid = session.studioId!;
  const q = req.nextUrl.searchParams;
  const puo = { caricare: puoPa(session.role, 'caricare'), terapia: puoPa(session.role, 'terapia'), decidere: puoPa(session.role, 'decidere') };
  if (q.get('vista') === 'farmaci') return NextResponse.json({ ...(await elencoFarmaci(sid)), puo }, no);
  // Il file per collegare la cartella da un PC Windows (solo quando il Mac la condivide davvero).
  if (q.get('cartella') === 'win') {
    const c = await statoCartella();
    if (!c.condivisa || !c.nome_rete) return NextResponse.json({ errore: 'La cartella non è ancora condivisa in rete dal Mac.' }, { status: 409 });
    return new NextResponse(scriptWindows({ host: nomeHost(), ip: c.ip, nome: c.nome_rete, cosa: 'della pressione' }), { headers: { 'Content-Type': 'application/x-bat; charset=utf-8', 'Content-Disposition': 'attachment; filename="collega-pressione.bat"', 'Cache-Control': 'no-store' } });
  }
  const paziente = q.get('paziente');
  if (paziente && !isUuid(paziente)) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
  const f = await elencoFarmaci(sid);
  return NextResponse.json({ ...(await elencoProfili(sid, paziente)), farmaci: { confermati: f.confermati, totale: f.totale }, proposte_accese: proposteAccese(), puo,
    arrivi: paziente ? [] : await elencoArrivi(sid), cartella: await statoCartella() }, no);
}

export async function POST(req: NextRequest) {
  const { session, errore } = await sessione();
  if (errore) return errore;
  const sid = session.studioId!, uid = session.id;
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const id = String(c?.id ?? '');

  if (azione === 'carica') {
    if (!puoPa(session.role, 'caricare')) return nonPuoi('Il tuo ruolo non carica profili.');
    if (!isUuid(String(c?.patient_id ?? ''))) return NextResponse.json({ errore: 'Scegli il paziente.' }, { status: 400 });
    return esito(await caricaProfilo(sid, uid, String(c.patient_id), { testo: String(c?.testo ?? ''), data_inizio: c?.data_inizio ? String(c.data_inizio) : undefined, apparecchio: c?.apparecchio ? String(c.apparecchio) : undefined }));
  }
  if (azione === 'farmaco' || azione === 'farmaco_togli') {
    if (!puoPa(session.role, 'decidere')) return nonPuoi('La tabella dei farmaci la conferma il medico.');
    const principio = String(c?.principio ?? '').slice(0, 60);
    if (azione === 'farmaco_togli') return esito(await togliConferma(sid, uid, principio));
    return esito(await salvaFarmaco(sid, uid, principio, { inizio_h: c?.inizio_h, picco_h: c?.picco_h, durata_h: c?.durata_h, emivita_h: c?.emivita_h, orario_rilevante: c?.orario_rilevante, nota: c?.nota, fonte: c?.fonte, conferma: c?.conferma === true }));
  }
  if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
  // Un file arrivato dalla cartella e non agganciato da solo: lo assegna (o lo scarta) chi può caricare un profilo.
  if (azione === 'assegna' || azione === 'scarta_arrivo') {
    if (!puoPa(session.role, 'caricare')) return nonPuoi('Il tuo ruolo non assegna i file arrivati.');
    if (azione === 'scarta_arrivo') return esito(await scartaArrivo(sid, uid, id));
    if (!isUuid(String(c?.patient_id ?? ''))) return NextResponse.json({ errore: 'Scegli il paziente.' }, { status: 400 });
    return esito(await assegnaArrivo(sid, uid, id, String(c.patient_id)));
  }
  if (azione === 'terapia') {
    if (!puoPa(session.role, 'terapia')) return nonPuoi('La terapia la scrive il medico o l’aiuto medico.');
    return esito(await salvaTerapia(sid, uid, id, c?.righe));
  }
  if (azione === 'impostazioni') {
    if (!puoPa(session.role, 'terapia')) return nonPuoi('Giorno, notte e soglie li imposta il medico o l’aiuto medico.');
    return esito(await salvaImpostazioni(sid, uid, id, { sveglia: c?.sveglia, sonno: c?.sonno, soglie: c?.soglie, nota: c?.nota }, puoPa(session.role, 'decidere')));
  }
  if (azione === 'elimina') {
    if (!puoPa(session.role, 'terapia')) return nonPuoi('Un profilo lo elimina il medico o l’aiuto medico.');
    return esito(await eliminaProfilo(sid, uid, id));
  }
  if (azione === 'proponi' || azione === 'decidi') {
    if (!proposteAccese()) return NextResponse.json({ errore: 'proposte_spente' }, { status: 403 });
    if (!puoPa(session.role, 'decidere')) return nonPuoi('Le proposte di orario le chiede e le decide il medico.');
    if (azione === 'proponi') return esito(await generaProposte(sid, uid, id));
    return esito(await decidiProposta(sid, uid, id, { stato: String(c?.stato ?? ''), orario: c?.orario, nota: c?.nota }));
  }
  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}
