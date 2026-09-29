import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { registraEvento, impronta } from '@/lib/referti-eventi';
import { vietato } from '@/lib/permessi';
import { collegaInviante } from '@/lib/referti-inviante';

export const dynamic = 'force-dynamic';

// La revisione fatta nel prototipo torna nella piattaforma (13.9.2026): il
// testo ricomposto entra in `testo_finale` della bozza (working draft, come
// «Inserisci nel referto» del wizard), con un evento; la CONFERMA resta nella
// piattaforma, col suo gate.
// Chi può riscrivere il testo di una bozza è chi lo può confermare: la
// segretaria che lo rivede, il medico che lo firma, l'amministrazione. Dal
// 16.9 esistono anche `assistente` e `tecnico` ([[Piattaforma/Accessi e
// ruoli]]) e qui mancava il cancello che i due fratelli — conferma e
// richiamo — hanno sempre avuto.
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin', 'tecnico']);
const MAX_TESTO = 200_000;
const MAX_STATO = 300_000;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'reports');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const testo = String(corpo?.testo ?? '').slice(0, MAX_TESTO).trim();
  // Stato della revisione del prototipo (verifiche chiuse, correzioni per
  // frase, frasi tolte/aggiunte, metriche): vive in payload.revisione_prototipo
  // così la coda lo vede come «rivisto» e la riapertura riparte da lì.
  const stato = corpo?.stato && typeof corpo.stato === 'object' ? corpo.stato : null;
  const statoJson = stato ? JSON.stringify({ ...stato, salvato_il: new Date().toISOString(), utente: session.id }).slice(0, MAX_STATO) : null;
  if (statoJson && statoJson.length >= MAX_STATO) return NextResponse.json({ errore: 'stato_troppo_grande' }, { status: 413 });
  // Campi estratti confermati o corretti (paziente, nascita, destinatario…).
  const campi: Record<string, string> = {};
  if (corpo?.campi && typeof corpo.campi === 'object') for (const [k, v] of Object.entries(corpo.campi as Record<string, unknown>)) if (typeof v === 'string' && /^[a-z_]{1,40}$/.test(k)) campi[k] = v.trim().slice(0, 2000);
  if (Object.keys(campi).length) {
    // Se la bozza non è più una bozza (confermata o scartata da un collega
    // mentre la si correggeva) l'update non tocca niente: dirlo, invece di
    // rispondere «salvato» e lasciare il nome sbagliato sul referto.
    const [agg] = await query<{ id: string }>(
      `update referti_bozze set campi_confermati = coalesce(campi_confermati, '{}'::jsonb) || $3::jsonb where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
      [params.id, session.studioId, JSON.stringify(campi)]);
    if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
    // Cambiato inviante o destinatario: il legame con la rubrica si rifà.
    if (campi.medico_inviante !== undefined || campi.medico_destinatario !== undefined) await collegaInviante(session.studioId, params.id).catch(() => null);
    if (!testo && !statoJson) return NextResponse.json({ ok: true, solo_campi: true });
  }
  if (!testo && !statoJson) return NextResponse.json({ errore: 'testo_vuoto' }, { status: 400 });
  if (!testo) {
    const [agg] = await query<{ id: string }>(
      `update referti_bozze set payload = jsonb_set(payload, '{revisione_prototipo}', $3::jsonb) where id = $1 and studio_id = $2 and stato = 'bozza' returning id`,
      [params.id, session.studioId, statoJson]);
    if (!agg) return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
    return NextResponse.json({ ok: true, solo_stato: true });
  }
  // Copia vecchia a schermo (28.9.2026): la pagina manda l'impronta del testo
  // da cui è partita; se la bozza nel frattempo è cambiata non si sovrascrive.
  const base = typeof corpo?.base === 'string' ? corpo.base : null;
  const [agg] = await query<{ id: string }>(
    `update referti_bozze set testo_finale = $3, payload = case when $4::jsonb is null then payload else jsonb_set(payload, '{revisione_prototipo}', $4::jsonb) end
      where id = $1 and studio_id = $2 and stato = 'bozza'
        and ($5::text is null or encode(sha256(convert_to(coalesce(testo_finale, payload->>'testo_corretto', ''), 'UTF8')), 'hex') like $5::text || '%'
             or $3 = coalesce(testo_finale, payload->>'testo_corretto', ''))
      returning id`,
    [params.id, session.studioId, testo, statoJson, base]
  );
  if (!agg) {
    const [c] = await query<{ stato: string }>('select stato from referti_bozze where id = $1 and studio_id = $2', [params.id, session.studioId]);
    if (c?.stato === 'bozza' && base) return NextResponse.json({ errore: 'cambiata' }, { status: 409 });
    return NextResponse.json({ errore: 'non_bozza' }, { status: 409 });
  }
  await registraEvento(session.studioId, params.id, 'testo_salvato', session.id, {
    impronta_testo: impronta(testo), caratteri: testo.length, origine: 'prototipo',
    correzioni: Number.isInteger(corpo?.correzioni) ? corpo.correzioni : undefined,
    verifiche: Number.isInteger(corpo?.verifiche) ? corpo.verifiche : undefined,
  });
  return NextResponse.json({ ok: true, impronta: impronta(testo) });
}
