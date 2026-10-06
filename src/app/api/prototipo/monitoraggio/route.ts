import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { puoMon, vistaTecnica } from '@/lib/monitoraggio/catalogo';
import { abbinamento, azioneAvviso, elencoAvvisi, elencoDispositivi, elencoRegole, nuovaVersione, panoramica, silenzia, sogliaPaziente } from '@/lib/monitoraggio/archivio';
import { accendiDemo, assicuraDemo, ripristinaDemo, scenario, type AzioneSim } from '@/lib/monitoraggio/motore';
import { riassumi } from '@/lib/monitoraggio/assistente';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Monitoraggio remoto (6.10.2026, [[Piattaforma/Monitoraggio]]) — modulo
// DIMOSTRATIVO: oggi esiste solo l'ambiente «demo», con dati simulati.
//   GET ?vista=panoramica | avvisi | regole | dispositivi
//   POST { azione: 'avviso' | 'silenzia' | 'regola' | 'soglia_paziente' | 'dispositivo' | 'simulatore' | 'assistente', … }
// I permessi si applicano QUI, non nell'interfaccia: consultare, prendere in
// carico, modificare le regole e gestire i dispositivi sono quattro cose diverse.
const no = { headers: { 'Cache-Control': 'no-store' } };

async function sessione() {
  const session = await getSession();
  if (!session || !session.studioId) return { errore: NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 }) };
  const v = vietato(session.role, 'monitoraggio');
  if (v) return { errore: v };
  return { session };
}
const esito = (r: { errore: string; stato?: number } | Record<string, unknown>) => ('errore' in r ? NextResponse.json({ errore: r.errore }, { status: (r as any).stato ?? 409 }) : NextResponse.json(r));

export async function GET(req: NextRequest) {
  const { session, errore } = await sessione();
  if (errore) return errore;
  const sid = session.studioId;
  const vista = req.nextUrl.searchParams.get('vista') ?? 'panoramica';
  await assicuraDemo(sid);
  if (vista === 'avvisi') return NextResponse.json({ ambiente: 'demo', avvisi: await elencoAvvisi(sid, session.role), puo: { prendere: puoMon(session.role, 'prendere_in_carico') } }, no);
  if (vista === 'regole') {
    if (vistaTecnica(session.role)) return NextResponse.json({ errore: 'Le regole le vede chi cura.' }, { status: 403 });
    return NextResponse.json({ ambiente: 'demo', ...(await elencoRegole(sid)), puo: { regole: puoMon(session.role, 'modificare_regole') } }, no);
  }
  if (vista === 'dispositivi') return NextResponse.json({ ambiente: 'demo', ...(await elencoDispositivi(sid)), puo: { dispositivi: puoMon(session.role, 'gestire_dispositivi') } }, no);
  return NextResponse.json(await panoramica(sid, session.role), no);
}

export async function POST(req: NextRequest) {
  const { session, errore } = await sessione();
  if (errore) return errore;
  const sid = session.studioId, io = { id: session.id, role: session.role };
  const c = await req.json().catch(() => null);
  const uuid = (x: unknown) => (isUuid(String(x ?? '')) ? String(x) : null);
  switch (c?.azione) {
    case 'avviso': {
      const id = uuid(c.id);
      if (!id) return NextResponse.json({ errore: 'id' }, { status: 400 });
      return esito(await azioneAvviso(sid, io, { id, azione: String(c.cosa ?? ''), motivazione: c.motivazione }));
    }
    case 'silenzia': {
      const p = uuid(c.paziente);
      if (!p) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
      return esito(await silenzia(sid, io, p, Number(c.minuti) || 0));
    }
    case 'regola': return esito(await nuovaVersione(sid, io, String(c.chiave ?? '').slice(0, 60), c.cambi && typeof c.cambi === 'object' ? c.cambi : {}));
    case 'soglia_paziente': {
      const p = uuid(c.paziente);
      if (!p) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
      return esito(await sogliaPaziente(sid, io, p, String(c.chiave ?? '').slice(0, 60), { soglia: c.soglia, rientro: c.rientro, spenta: c.spenta === true, togli: c.togli === true }));
    }
    case 'dispositivo': {
      const d = uuid(c.dispositivo);
      if (!d || (c.cosa !== 'stacca' && c.cosa !== 'abbina')) return NextResponse.json({ errore: 'dispositivo' }, { status: 400 });
      return esito(await abbinamento(sid, io, { azione: c.cosa, dispositivo: d, paziente: uuid(c.paziente) ?? undefined, conferma: String(c.conferma ?? '') }));
    }
    case 'simulatore': {
      // Il simulatore esiste solo in demo, e solo per chi può usarlo.
      if (!puoMon(session.role, 'usare_simulatore')) return NextResponse.json({ errore: 'Il tuo ruolo non usa il simulatore.' }, { status: 403 });
      if (c.cosa === 'ripristina') { await ripristinaDemo(sid, session.id); return NextResponse.json({ ok: true }); }
      if (c.cosa === 'spegni' || c.cosa === 'accendi') { await accendiDemo(sid, c.cosa === 'accendi', session.id); return NextResponse.json({ ok: true }); }
      const p = uuid(c.paziente);
      if (!p) return NextResponse.json({ errore: 'paziente' }, { status: 400 });
      return esito(await scenario(sid, p, String(c.cosa ?? '') as AzioneSim, c.tipo ? String(c.tipo) : null, session.id));
    }
    case 'assistente': {
      if (!puoMon(session.role, 'consultare')) return NextResponse.json({ errore: 'L\'assistente riassume i dati dei pazienti: lo usa chi cura.' }, { status: 403 });
      const p = uuid(c.paziente);
      const da = new Date(String(c.da ?? '')), a = new Date(String(c.a ?? ''));
      if (!p || Number.isNaN(da.getTime()) || Number.isNaN(a.getTime()) || a <= da || a.getTime() - da.getTime() > 48 * 3600_000) return NextResponse.json({ errore: 'intervallo' }, { status: 400 });
      const r = await riassumi(sid, p, session.role, { da, a, domanda: typeof c.domanda === 'string' ? c.domanda : undefined });
      return r ? NextResponse.json(r) : NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    }
    default: return NextResponse.json({ errore: 'azione' }, { status: 400 });
  }
}
