import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ricezione delle bozze di referto dalla pipeline locale di trascrizione
// (docs/trascrizione/SPEC.md §8.1). Autenticazione con token per studio
// (Authorization: Bearer <token>, in tabella c'è solo l'hash sha256).
// Il 201 arriva solo a bozza effettivamente scritta: è la risposta che
// autorizza la pipeline a cancellare l'audio. Un reinvio dello stesso
// file_id risponde 200 senza duplicare (i retry sono idempotenti).
// Niente dati clinici nei log né nelle risposte d'errore.

const MAX_TESTO = 200_000;
const MAX_LISTA = 500;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [studio] = await query<{ id: string }>(
    'select id from studios where referti_token_hash = $1 and attivo = true',
    [tokenHash]
  );
  if (!studio) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: 'json_non_valido' }, { status: 400 });
  }

  const fileId = typeof body?.file_id === 'string' ? body.file_id.trim().slice(0, 200) : '';
  const testo = typeof body?.testo_corretto === 'string' ? body.testo_corretto : '';
  if (!fileId) return NextResponse.json({ errore: 'file_id_mancante' }, { status: 400 });
  if (!testo || testo.length > MAX_TESTO) {
    return NextResponse.json({ errore: 'testo_mancante_o_troppo_lungo' }, { status: 400 });
  }
  // La SPEC non ammette bozze «pronte»: ogni referto passa da un umano.
  if (body?.richiede_revisione !== true) {
    return NextResponse.json({ errore: 'richiede_revisione_deve_essere_true' }, { status: 400 });
  }

  const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_LISTA) : []);
  const payload = {
    file_id: fileId,
    timestamp: typeof body?.timestamp === 'string' ? body.timestamp.slice(0, 40) : null,
    testo_corretto: testo,
    // Frasi che il medico ha rivolto alla segreteria, separate dal referto
    // dalla fase «segretaria» della pipeline (SPEC §6.4).
    note_segreteria: lista(body?.note_segreteria)
      .filter((n: unknown): n is string => typeof n === 'string')
      .map((n: string) => n.slice(0, 2000)),
    campi_estratti:
      body?.campi_estratti && typeof body.campi_estratti === 'object' && !Array.isArray(body.campi_estratti)
        ? body.campi_estratti
        : {},
    divergenze: lista(body?.divergenze),
    segmenti_dubbi: lista(body?.segmenti_dubbi),
    allarmi_numerici: lista(body?.allarmi_numerici),
    // Avvisi di lavorazione della pipeline (es. possibile dettato incompleto):
    // frasi già pronte per chi rivede, mai contenuti clinici.
    avvisi: lista(body?.avvisi)
      .filter((a: unknown): a is string => typeof a === 'string')
      .map((a: string) => a.slice(0, 500)),
    // Evidenziatore (fase «pertinenza»): frasi fuori tema — la pagina le
    // mostra spente, entra nel referto solo l'evidenziato, decide la persona.
    divagazioni: lista(body?.divagazioni)
      .filter((d: unknown): d is string => typeof d === 'string')
      .map((d: string) => d.slice(0, 400)),
    // Fase «senso»: frasi prive di senso con proposta di ricostruzione dal
    // glossario dello studio (solo suggerimento, mai applicata da sola).
    frasi_da_chiarire: lista(body?.frasi_da_chiarire)
      .filter((v: unknown): v is { frase: string; proposta?: string } =>
        !!v && typeof v === 'object' && typeof (v as any).frase === 'string')
      .map((v: { frase: string; proposta?: string }) => ({
        frase: v.frase.slice(0, 400),
        proposta: typeof v.proposta === 'string' ? v.proposta.slice(0, 400) : '',
      })),
    // Avvocato del diavolo (piano precisione, punto 6): frasi della bozza
    // che il verificatore separato non trova supportate dal dettato grezzo,
    // col motivo. Solo bandierine per chi rivede.
    frasi_non_supportate: lista(body?.frasi_non_supportate)
      .filter((v: unknown): v is { frase: string; motivo?: string } =>
        !!v && typeof v === 'object' && typeof (v as any).frase === 'string')
      .map((v: { frase: string; motivo?: string }) => ({
        frase: v.frase.slice(0, 400),
        motivo: typeof v.motivo === 'string' ? v.motivo.slice(0, 200) : '',
      })),
    // Correzioni applicate in automatico dalla catena (lista AI + glossario
    // fonetico): la revisione guidata le mostra una a una, annullabili.
    riparazioni_applicate: lista(body?.riparazioni_applicate)
      .filter((v: unknown): v is { da: string; a: string } =>
        !!v && typeof v === 'object'
        && typeof (v as any).da === 'string' && typeof (v as any).a === 'string')
      .map((v: { da: string; a: string }) => ({
        da: v.da.slice(0, 80),
        a: v.a.slice(0, 80),
      })),
    // Dettato grezzo (trascrizione prima di ogni ritocco): serve alla pagina
    // di revisione per il confronto «frase → cosa è stato detto davvero».
    testo_grezzo:
      typeof body?.testo_grezzo === 'string' ? body.testo_grezzo.slice(0, MAX_TESTO) : '',
    // Proposta nel formato standard dello studio (fase «struttura»):
    // la revisione guidata la applica con un clic, mai da sola.
    testo_strutturato:
      typeof body?.testo_strutturato === 'string' ? body.testo_strutturato.slice(0, MAX_TESTO) : '',
    // Trascrizione integrale della visita coi tempi (solo tipo=visita):
    // alimenta la memoria di consulto della registrazione.
    parole_grezzo: (Array.isArray(body?.parole_grezzo) ? body.parole_grezzo.slice(0, 20000) : [])
      .filter(
        (p: unknown): p is [string, number] =>
          Array.isArray(p) && p.length === 2
          && typeof p[0] === 'string' && typeof p[1] === 'number'
      )
      .map((p: [string, number]) => [p[0].slice(0, 80), p[1]]),
    // Tempi parola-per-parola (SPEC §8): [parola, secondi] per ogni parola di
    // testo_corretto, per il testo sincronizzato con l'audio. Facoltativi.
    parole: (Array.isArray(body?.parole) ? body.parole.slice(0, 8000) : [])
      .filter(
        (p: unknown): p is [string, number] =>
          Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' &&
          typeof p[1] === 'number' && Number.isFinite(p[1]) && p[1] >= 0
      )
      .map((p: [string, number]) => [p[0].slice(0, 100), p[1]]),
    // Punteggio di rischio per frase con i motivi («perché lo vedo») e
    // tabella dei numeri (valore, unità, secondo di audio, conferma del
    // secondo orecchio): alimentano il primo passo della revisione guidata.
    rischio_frasi: lista(body?.rischio_frasi)
      .filter((v: unknown): v is { frase: string; punteggio: number; motivi?: unknown } =>
        !!v && typeof v === 'object' && typeof (v as any).frase === 'string'
        && typeof (v as any).punteggio === 'number' && Number.isFinite((v as any).punteggio))
      .slice(0, 40)
      .map((v) => ({
        frase: v.frase.slice(0, 500),
        punteggio: Math.round(v.punteggio),
        motivi: (Array.isArray(v.motivi) ? v.motivi : [])
          .filter((m: unknown): m is string => typeof m === 'string').slice(0, 8)
          .map((m: string) => m.slice(0, 120)),
      })),
    numeri: lista(body?.numeri)
      .filter((v: unknown): v is { valore: string; unita?: unknown; frase?: unknown; secondo?: unknown; confermato?: unknown } =>
        !!v && typeof v === 'object' && typeof (v as any).valore === 'string')
      .slice(0, 200)
      .map((v) => ({
        valore: v.valore.slice(0, 20),
        unita: typeof v.unita === 'string' ? v.unita.slice(0, 12) : '',
        frase: typeof v.frase === 'number' ? v.frase : null,
        secondo: typeof v.secondo === 'number' && Number.isFinite(v.secondo) ? v.secondo : null,
        confermato: typeof v.confermato === 'boolean' ? v.confermato : null,
      })),
    // Omission detector: frasi del dettato grezzo senza destinazione nel
    // referto (con secondo di audio, cifre/farmaco).
    frasi_omesse: lista(body?.frasi_omesse)
      .filter((v: unknown): v is { frase: string; secondo?: unknown; cifre?: unknown; farmaco?: unknown; copertura?: unknown } =>
        !!v && typeof v === 'object' && typeof (v as any).frase === 'string')
      .slice(0, 30)
      .map((v) => ({
        frase: v.frase.slice(0, 400),
        secondo: typeof v.secondo === 'number' && Number.isFinite(v.secondo) ? v.secondo : null,
        cifre: v.cifre === true,
        farmaco: v.farmaco === true,
        copertura: typeof v.copertura === 'number' ? v.copertura : null,
      })),
    // Cronologia delle trasformazioni (attore, numeri, secondi dall'avvio) e
    // versioni intermedie del testo: audit e confronto.
    storia: lista(body?.storia)
      .filter((v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && typeof (v as any).tappa === 'string')
      .slice(0, 40)
      .map((v) => Object.fromEntries(Object.entries(v)
        .filter(([k, x]) => /^[a-z_]{1,30}$/.test(k) && (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'))
        .map(([k, x]) => [k, typeof x === 'string' ? x.slice(0, 80) : x]))),
    versioni: body?.versioni && typeof body.versioni === 'object'
      ? Object.fromEntries(Object.entries(body.versioni as Record<string, unknown>)
          .filter(([k, x]) => /^[a-z_]{1,30}$/.test(k) && typeof x === 'string')
          .slice(0, 8)
          .map(([k, x]) => [k, (x as string).slice(0, MAX_TESTO)]))
      : {},
    // Bozza «ombra» (confronto cieco tra due versioni della catena).
    ombra: body?.ombra === true,
    richiede_revisione: true,
  };

  // Audio caricato dal drag & drop della piattaforma: la bozza vi si collega
  // (per il riascolto) e la voce di coda si chiude. Facoltativo e best-effort.
  const audioId =
    typeof body?.audio_id === 'string' && /^[0-9a-f-]{36}$/.test(body.audio_id)
      ? body.audio_id
      : null;
  async function collega(bozzaId: string) {
    if (!audioId) return;
    await query(
      `update referti_audio set stato = 'fatto', bozza_id = $3, updated_at = now()
        where id = $1 and studio_id = $2`,
      [audioId, studio.id, bozzaId]
    );
  }

  // Visita registrata o referto dettato: lo dice la pipeline nel payload.
  const tipo = body?.tipo === 'visita' ? 'visita' : 'referto';

  const [inserita] = await query<{ id: string }>(
    `insert into referti_bozze (studio_id, file_id, payload, tipo)
       values ($1, $2, $3, $4)
       on conflict (studio_id, file_id) do nothing
       returning id`,
    [studio.id, fileId, JSON.stringify(payload), tipo]
  );
  if (inserita) {
    await collega(inserita.id);
    return NextResponse.json({ id: inserita.id }, { status: 201 });
  }

  // Retry della pipeline su un file già consegnato: successo, senza doppioni.
  // Caso particolare: se la bozza era stata SCARTATA e lo stesso audio arriva
  // di nuovo, è una persona che l'ha ricaricato apposta (i retry automatici
  // finiscono al primo 2xx) — la bozza torna tra le «da rivedere», e con la
  // NUOVA lavorazione: la pipeline potrebbe essere migliorata nel frattempo,
  // il vecchio risultato di una bozza rifiutata non ha nulla da difendere.
  const [esistente] = await query<{ id: string; stato: string }>(
    'select id, stato from referti_bozze where studio_id = $1 and file_id = $2',
    [studio.id, fileId]
  );
  if (esistente) {
    if (esistente.stato === 'scartata') {
      await query(
        `update referti_bozze
            set stato = 'bozza', payload = $3, tipo = $4,
                testo_finale = null, campi_confermati = null,
                reviewed_by = null, reviewed_at = null
          where id = $1 and studio_id = $2`,
        [esistente.id, studio.id, JSON.stringify(payload), tipo]
      );
    }
    await collega(esistente.id);
  }
  return NextResponse.json({ id: esistente?.id ?? null, duplicato: true }, { status: 200 });
}
