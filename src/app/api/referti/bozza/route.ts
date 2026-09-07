import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { registraEvento, impronta } from '@/lib/referti-eventi';
import { RX_MEDICO_ID } from '@/lib/referti-medici';

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

// Manifesto di sicurezza della catena (Ricerca 18 §16): certificato tecnico
// del percorso (testimoni, ripieghi, conteggi dei fatti critici). Solo
// etichette e numeri: mai testo clinico.
function manifestoPulito(m: unknown): Record<string, unknown> {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>).slice(0, 32)) {
    if (!/^[a-z_]{1,32}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean' || v === null) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 60);
    else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string').slice(0, 12).map((x) => x.slice(0, 60));
    else if (typeof v === 'object') {
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([kk, x]) => /^[a-z_]{1,32}$/.test(kk) && typeof x === 'string')
          .slice(0, 16)
          .map(([kk, x]) => [kk, (x as string).slice(0, 40)])
      );
    }
  }
  return out;
}

// Chi ha dettato (profilo scelto al caricamento, medici.json sul Mac): id,
// nome, modalità di lavoro e rallentamento usato. Solo etichette.
function medicoPulito(m: unknown): { id: string; nome: string; modalita: 'lettera' | 'aggiornamento'; atempo: number | null } | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const id = String((m as any).id ?? '').trim().toLowerCase();
  if (!id || id.length > 32 || !RX_MEDICO_ID.test(id)) return null;
  const nome = String((m as any).nome ?? id).trim().slice(0, 80) || id;
  const atempo = typeof (m as any).atempo === 'number' && Number.isFinite((m as any).atempo) ? (m as any).atempo : null;
  return { id, nome, modalita: (m as any).modalita === 'aggiornamento' ? 'aggiornamento' : 'lettera', atempo };
}

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
        gravita: typeof (v as any).gravita === 'string' ? String((v as any).gravita).slice(0, 12) : '',
        supporto: typeof (v as any).supporto === 'string' ? String((v as any).supporto).slice(0, 16) : '',
        fonte: (Array.isArray((v as any).fonte) ? (v as any).fonte : [])
          .filter((m: unknown): m is string => typeof m === 'string').slice(0, 4)
          .map((m: string) => m.slice(0, 40)),
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
    // Registro di versione della catena (pipeline, prompt, dizionario, modelli).
    versione_catena: body?.versione_catena && typeof body.versione_catena === 'object'
      ? Object.fromEntries(Object.entries(body.versione_catena as Record<string, unknown>)
          .filter(([k, x]) => /^[a-z_]{1,24}$/.test(k) && typeof x === 'string')
          .slice(0, 16)
          .map(([k, x]) => [k, (x as string).slice(0, 60)]))
      : {},
    // Bozza «ombra» (confronto cieco tra due versioni della catena).
    ombra: body?.ombra === true,
    // Etichetta della variante ombra (es. «atempo-0.6»): più candidate sullo
    // stesso audio; la pagina di confronto la rivela solo a scelta fatta.
    ombra_etichetta: typeof body?.ombra_etichetta === 'string'
      ? body.ombra_etichetta.toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 40)
      : '',
    manifesto: manifestoPulito(body?.manifesto),
    medico: medicoPulito(body?.medico),
    richiede_revisione: true,
  };
  const medicoId = payload.medico?.id ?? null;

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

  // Modalità «aggiornamento» del medico (2026-09-07, es. dr. Moschovitis,
  // che detta gli aggiornamenti alla lettera precedente): se nel sistema c'è
  // l'ultima lettera CONFERMATA dello stesso paziente, la fusione viene
  // chiesta da sola — la persona la trova già pronta invece di doverla
  // richiedere. Resta una PROPOSTA: si applica solo con «Applica», con le
  // stesse guardie (identità, gate temporale). Mai sulle bozze ombra, mai
  // sulle visite. Best-effort: un intoppo qui non tocca il 201.
  async function fusioneAutomatica(bozzaId: string) {
    if (tipo !== 'referto' || payload.ombra || payload.medico?.modalita !== 'aggiornamento') return;
    const campi = payload.campi_estratti as Record<string, unknown>;
    const nome = typeof campi?.nome_paziente === 'string' ? campi.nome_paziente.trim() : '';
    const nascita = typeof campi?.data_nascita === 'string' ? campi.data_nascita.trim() : '';
    if (!nome || nome.toLowerCase() === 'non indicato') return;
    try {
      const [prec] = await query<{ id: string; testo_finale: string }>(
        `select id, testo_finale
           from referti_bozze
          where studio_id = $1 and id <> $2 and stato = 'confermata' and tipo = 'referto'
            and testo_finale is not null
            and lower(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', '')) = lower($3)
            and ($4 = '' or coalesce(campi_confermati->>'data_nascita', payload->'campi_estratti'->>'data_nascita', '') in ('', $4))
          order by reviewed_at desc
          limit 1`,
        [studio.id, bozzaId, nome, nascita]
      );
      const lettera = (prec?.testo_finale ?? '').trim();
      if (!prec || lettera.length < 200) return;
      const richiesta = {
        stato: 'in_attesa',
        lettera_precedente: lettera.slice(0, MAX_TESTO),
        richiesta_at: new Date().toISOString(),
        richiesta_da: null,
        automatica: true,
        da_bozza: prec.id,
      };
      await query(
        `update referti_bozze set payload = jsonb_set(payload, '{fusione}', $3::jsonb)
          where id = $1 and studio_id = $2 and stato = 'bozza'`,
        [bozzaId, studio.id, JSON.stringify(richiesta)]
      );
      await registraEvento(studio.id, bozzaId, 'fusione_richiesta', null, {
        impronta_lettera: impronta(lettera), caratteri: lettera.length, automatica: true, medico: payload.medico!.id,
      });
    } catch (e: any) {
      console.error('Fusione automatica non avviata:', e?.message || e);
    }
  }

  const [inserita] = await query<{ id: string }>(
    `insert into referti_bozze (studio_id, file_id, payload, tipo, medico)
       values ($1, $2, $3, $4, $5)
       on conflict (studio_id, file_id) do nothing
       returning id`,
    [studio.id, fileId, JSON.stringify(payload), tipo, medicoId]
  );
  if (inserita) {
    await collega(inserita.id);
    await registraEvento(studio.id, inserita?.id ?? null, 'bozza_ricevuta', null, { versione: String((payload as any).versione_catena?.pipeline ?? ''), ombra: (payload as any).ombra === true, medico: medicoId ?? '' });
    await fusioneAutomatica(inserita.id);
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
            set stato = 'bozza', payload = $3, tipo = $4, medico = $5,
                testo_finale = null, campi_confermati = null,
                reviewed_by = null, reviewed_at = null
          where id = $1 and studio_id = $2`,
        [esistente.id, studio.id, JSON.stringify(payload), tipo, medicoId]
      );
      await fusioneAutomatica(esistente.id);
    }
    await collega(esistente.id);
  }
  return NextResponse.json({ id: esistente?.id ?? null, duplicato: true }, { status: 200 });
}
