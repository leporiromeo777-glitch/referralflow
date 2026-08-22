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
    // Dettato grezzo (trascrizione prima di ogni ritocco): serve alla pagina
    // di revisione per il confronto «frase → cosa è stato detto davvero».
    testo_grezzo:
      typeof body?.testo_grezzo === 'string' ? body.testo_grezzo.slice(0, MAX_TESTO) : '',
    // Tempi parola-per-parola (SPEC §8): [parola, secondi] per ogni parola di
    // testo_corretto, per il testo sincronizzato con l'audio. Facoltativi.
    parole: (Array.isArray(body?.parole) ? body.parole.slice(0, 8000) : [])
      .filter(
        (p: unknown): p is [string, number] =>
          Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' &&
          typeof p[1] === 'number' && Number.isFinite(p[1]) && p[1] >= 0
      )
      .map((p: [string, number]) => [p[0].slice(0, 100), p[1]]),
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

  const [inserita] = await query<{ id: string }>(
    `insert into referti_bozze (studio_id, file_id, payload)
       values ($1, $2, $3)
       on conflict (studio_id, file_id) do nothing
       returning id`,
    [studio.id, fileId, JSON.stringify(payload)]
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
            set stato = 'bozza', payload = $3,
                testo_finale = null, campi_confermati = null,
                reviewed_by = null, reviewed_at = null
          where id = $1 and studio_id = $2`,
        [esistente.id, studio.id, JSON.stringify(payload)]
      );
    }
    await collega(esistente.id);
  }
  return NextResponse.json({ id: esistente?.id ?? null, duplicato: true }, { status: 200 });
}
