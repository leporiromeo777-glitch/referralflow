import { NextResponse, type NextRequest } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { briefingGrezzo } from '@/lib/briefing';
import { chiediFornitore, fornitoreEsterno } from '@/lib/fornitore-esterno';
import { generaOllamaEsito } from '@/lib/ollama';
import { CONTESTO_PROMPT, controllaContesto, separaContesto, spieDiPaziente } from '@/lib/contesto-clinico';
import {
  MAX_ESTERNA, RICERCA_ESTERNA_PROMPT, RICOMBINA_PROMPT, SEZIONI_ESTERNE, SEZIONI_FINALI,
  leggiRisposta, puoUscire, ripuliEsterna,
} from '@/lib/ricerca-clinica';

export const dynamic = 'force-dynamic';

// Ricerca clinica esterna protetta — tutti e otto i passi (16.9.2026).
//
//   POST {azione:'prepara', patient_id, domanda}
//        il modello LOCALE legge la cartella intera e ne ricava il pacchetto
//        minimo; un controllo deterministico cerca lì dentro gli
//        identificatori VERI di quel paziente. Niente esce. Nasce la riga di
//        registro (passi 1-4, 8).
//   POST {azione:'manda', ricerca_id, contesto, domanda_generale}
//        si ricontrolla QUI il testo che torna dal browser — il medico può
//        averlo corretto a mano — e solo se passa esce verso il fornitore
//        autorizzato. La risposta rientra e il modello locale la rilegge con
//        la cartella davanti (passi 5-7).
//   POST {azione:'conferma', ricerca_id, conferma, nota}
//        che cosa ne ha fatto il medico (passo 8).
//   GET  ?patient_id=…  le ricerche di quel paziente · ?id=…  una per intero.
//
// Che cosa esce da questo Mac, in tutto: `contesto` e `domanda_generale`, cioè
// due paragrafi senza nome, senza data di nascita, senza numeri di pratica.
// La cartella no, la domanda originale no, il nome del paziente no. Nei log
// solo lunghezze, stati e millisecondi.
//
// Modello locale: gemma3:12b, scelto al banco del 16.9 su cartelle inventate —
// zero fughe, tutti i fatti che determinano la risposta tenuti ([[Misure/Banchi]]).
// Modello esterno: gemma 4 31B su Infomaniak (Ginevra), lo stesso della
// «Domanda medica». È più grande, NON naviga: le fonti che cita non le ha
// verificate nessuno, e la pagina lo dice al medico.
const MODELLO = process.env.CONTESTO_LLM || process.env.PROTOTIPO_LLM || 'gemma3:12b';
const MODELLO_ESTERNO = process.env.RICERCA_CLINICA_MODELLO || process.env.DOMANDA_MEDICA_MODELLO || 'google/gemma-4-31B-it';
const RUOLI = new Set(['medico', 'admin']);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function log(m: string) { console.log(`[ricerca-clinica] ${m}`); }

type Paziente = {
  cognome: string; nome: string; data_nascita: string | null; telefono: string | null; email: string | null;
  via: string | null; npa: string | null; localita: string | null; avs: string | null; n_assicurato: string | null;
};

const CAMPI_PAZIENTE = `cognome, nome, data_nascita::text, telefono, email, via, npa, localita, avs, n_assicurato`;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  // La cartella intera la legge solo chi la cartella la può già leggere.
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });

  const c = await req.json().catch(() => null);
  // Senza azione è la prima fetta: la pagina vecchia continua a funzionare.
  const azione = String(c?.azione ?? 'prepara');

  if (azione === 'prepara') return prepara(session, c);
  if (azione === 'manda') return manda(session, c);
  if (azione === 'conferma') return conferma(session, c);
  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}

/* ---------- passi 1-4: la cartella resta qui, esce il minimo ---------- */

async function prepara(session: SessionUser, c: any) {
  const patientId = String(c?.patient_id ?? '');
  const domanda = String(c?.domanda ?? '').trim();
  if (!isUuid(patientId)) return NextResponse.json({ errore: 'Paziente non valido.' }, { status: 400 });
  if (domanda.length < 10) return NextResponse.json({ errore: 'Scrivi la domanda per esteso.' }, { status: 400 });
  if (domanda.length > 2000) return NextResponse.json({ errore: 'Domanda troppo lunga.' }, { status: 400 });

  const [p] = await query<Paziente>(
    `select ${CAMPI_PAZIENTE} from patients where id = $1 and studio_id = $2`, [patientId, session.studioId]);
  if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });

  const grezzo = await briefingGrezzo(session.studioId, patientId);
  if (!grezzo) return NextResponse.json({ errore: 'Cartella non leggibile.' }, { status: 404 });

  const esito = await generaOllamaEsito(
    CONTESTO_PROMPT.replace('{cartella}', grezzo.testo).replace('{domanda}', domanda),
    { modello: MODELLO, timeoutMs: 300_000, aPezzi: true }
  );
  if (!esito.ok) {
    log(`prepara: modello locale non riuscito (${esito.causa})`);
    return NextResponse.json({ errore: 'Il modello locale non ha risposto: riprova fra un minuto.' }, { status: 503 });
  }
  const pulito = esito.testo.includes('</think>') ? esito.testo.split('</think>').pop()!.trim() : esito.testo.trim();
  const pacchetto = separaContesto(pulito);
  const controllo = controllaContesto(pacchetto, spieDiPaziente(p));

  const [riga] = await query<{ id: string }>(
    `insert into ricerche_cliniche
       (studio_id, user_id, patient_id, stato, domanda, cartella_caratteri, contesto, domanda_generale, controllo, modello_locale, ms_locale)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [session.studioId, session.id, patientId, controllo.ok ? 'preparata' : 'bloccata',
     domanda, grezzo.testo.length, pacchetto.contesto, pacchetto.domanda, JSON.stringify(controllo), MODELLO, esito.ms]);

  log(`prepara: cartella=${grezzo.testo.length} pacchetto=${pulito.length} fughe=${controllo.fughe.length} deittici=${controllo.deittici.length} eta=${controllo.etaEsatta ? 1 : 0} ok=${controllo.ok} ${esito.ms}ms`);

  return NextResponse.json({
    ok: true,
    ricerca_id: riga?.id ?? null,
    cartella_caratteri: grezzo.testo.length,
    contesto: pacchetto.contesto,
    domanda_generale: pacchetto.domanda,
    controllo,
    modello: MODELLO,
    ms: esito.ms,
    collegato: !!fornitoreEsterno(),
    inviato: false,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/* ---------- passi 5-7: esce, torna, si rimette insieme qui ---------- */

async function manda(session: SessionUser, c: any) {
  const id = String(c?.ricerca_id ?? '');
  if (!isUuid(id)) return NextResponse.json({ errore: 'Ricerca non valida.' }, { status: 400 });

  const [r] = await query<{ id: string; patient_id: string; domanda: string; stato: string; contesto: string; domanda_generale: string }>(
    `select id, patient_id, domanda, stato, contesto, domanda_generale
       from ricerche_cliniche where id = $1 and studio_id = $2`, [id, session.studioId]);
  if (!r) return NextResponse.json({ errore: 'Ricerca non trovata.' }, { status: 404 });
  if (r.stato === 'inviata') return NextResponse.json({ errore: 'Questa ricerca è già partita.' }, { status: 409 });

  // Il medico può aver corretto il pacchetto prima di mandarlo: si prende il
  // suo testo, ma si ricontrolla QUI. Mai fidarsi di ciò che torna dal browser.
  const contesto = String(c?.contesto ?? r.contesto).trim().slice(0, 4000);
  const domandaGenerale = String(c?.domanda_generale ?? r.domanda_generale).trim().slice(0, 1000);
  const modificato = contesto !== r.contesto || domandaGenerale !== r.domanda_generale;

  const [p] = await query<Paziente>(
    `select ${CAMPI_PAZIENTE} from patients where id = $1 and studio_id = $2`, [r.patient_id, session.studioId]);
  if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });

  const controllo = controllaContesto({ contesto, domanda: domandaGenerale }, spieDiPaziente(p));
  if (!puoUscire(controllo)) {
    await query(`update ricerche_cliniche set stato='bloccata', contesto=$2, domanda_generale=$3, controllo=$4, modificato_a_mano=$5 where id=$1`,
      [id, contesto, domandaGenerale, JSON.stringify(controllo), modificato]);
    log(`manda: rifiutato prima di uscire (fughe=${controllo.fughe.length} deittici=${controllo.deittici.length} eta=${controllo.etaEsatta ? 1 : 0} vuoto=${controllo.vuoto})`);
    return NextResponse.json({ errore: 'Il pacchetto non ha passato il controllo: non è uscito niente.', controllo }, { status: 400 });
  }

  const f = fornitoreEsterno((m) => log(m));
  if (!f) {
    log('manda: nessun fornitore autorizzato configurato');
    return NextResponse.json({
      errore: 'Non è collegato un fornitore autorizzato. Il pacchetto è pronto e non è uscito da qui.',
      non_collegato: true,
    }, { status: 503 });
  }

  // Da qui in poi qualcosa esce. Esce SOLO questo.
  const esterna = await chiediFornitore(
    f, MODELLO_ESTERNO,
    RICERCA_ESTERNA_PROMPT.replace('{contesto}', contesto).replace('{domanda}', domandaGenerale),
    { maxToken: 1200, timeoutMs: 120_000 }
  );
  await query(
    `update ricerche_cliniche set stato='inviata', contesto=$2, domanda_generale=$3, controllo=$4,
       modificato_a_mano=$5, fornitore=$6, modello_esterno=$7, inviato_at=now() where id=$1`,
    [id, contesto, domandaGenerale, JSON.stringify(controllo), modificato, f.url, MODELLO_ESTERNO]);
  if (!esterna.ok) {
    log(`manda: fornitore ${esterna.causa} (${esterna.dettaglio}) ${esterna.ms}ms`);
    return NextResponse.json({ errore: 'Il modello esterno non ha risposto: il pacchetto è partito ma non è tornato niente.' }, { status: 503 });
  }
  const testoEsterno = ripuliEsterna(esterna.testo);
  const lettaEsterna = leggiRisposta(testoEsterno, SEZIONI_ESTERNE);
  log(`manda: risposta esterna ${testoEsterno.length} caratteri, ${lettaEsterna.fonti.length} fonti, ${lettaEsterna.daVerificare.length} link da verificare, ${esterna.ms}ms`);

  // Passo 6: il rientro. Solo qui le due metà stanno nella stessa stanza.
  const grezzo = await briefingGrezzo(session.studioId, r.patient_id);
  if (!grezzo) return NextResponse.json({ errore: 'Cartella non leggibile.' }, { status: 404 });
  const finale = await generaOllamaEsito(
    RICOMBINA_PROMPT.replace('{cartella}', grezzo.testo).replace('{domanda}', r.domanda).replace('{esterna}', testoEsterno),
    { modello: MODELLO, timeoutMs: 300_000, aPezzi: true }
  );
  if (!finale.ok) {
    await query(`update ricerche_cliniche set stato='risposta', risposta_esterna=$2, ms_esterno=$3 where id=$1`,
      [id, testoEsterno, esterna.ms]);
    log(`manda: ricombinazione non riuscita (${finale.causa})`);
    return NextResponse.json({ errore: 'La ricerca è tornata, ma il modello locale non è riuscito a rileggerla con la cartella. Riprova fra un minuto.' }, { status: 503 });
  }
  const testoFinale = (finale.testo.includes('</think>') ? finale.testo.split('</think>').pop()! : finale.testo).trim();
  const letta = leggiRisposta(testoFinale, SEZIONI_FINALI);

  await query(
    `update ricerche_cliniche set stato='risposta', risposta_esterna=$2, risposta_finale=$3, fonti=$4,
       da_verificare=$5, certezza=$6, ms_esterno=$7, ms_finale=$8 where id=$1`,
    [id, testoEsterno, testoFinale, JSON.stringify(letta.fonti), JSON.stringify(letta.daVerificare),
     letta.certezza, esterna.ms, finale.ms]);
  log(`manda: risposta finale ${testoFinale.length} caratteri, sezioni mancanti ${letta.mancanti.length}, certezza ${letta.certezza || '—'}, ${finale.ms}ms`);

  return NextResponse.json({
    ok: true,
    ricerca_id: id,
    sezioni: letta.sezioni,
    mancanti: letta.mancanti,
    fonti: letta.fonti,
    da_verificare: letta.daVerificare,
    certezza: letta.certezza,
    esterna: { sezioni: lettaEsterna.sezioni, fonti: lettaEsterna.fonti, caratteri: testoEsterno.length },
    uscito: { contesto: contesto.length, domanda: domandaGenerale.length },
    dove: 'Infomaniak · server in Svizzera',
    modello_esterno: MODELLO_ESTERNO,
    modello_locale: MODELLO,
    ms_esterno: esterna.ms,
    ms_finale: finale.ms,
    tagliata: esterna.testo.length > MAX_ESTERNA,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/* ---------- passo 8: che cosa ne ha fatto il medico ---------- */

async function conferma(session: SessionUser, c: any) {
  const id = String(c?.ricerca_id ?? '');
  const scelta = String(c?.conferma ?? '');
  if (!isUuid(id)) return NextResponse.json({ errore: 'Ricerca non valida.' }, { status: 400 });
  if (!['usata', 'scartata'].includes(scelta)) return NextResponse.json({ errore: 'conferma_non_valida' }, { status: 400 });
  const nota = String(c?.nota ?? '').trim().slice(0, 2000);
  const [r] = await query<{ id: string }>(
    `update ricerche_cliniche set stato=$3, conferma=$4, nota_medico=$5, confermato_at=now()
       where id=$1 and studio_id=$2 returning id`,
    [id, session.studioId, scelta === 'usata' ? 'confermata' : 'scartata', scelta, nota]);
  if (!r) return NextResponse.json({ errore: 'Ricerca non trovata.' }, { status: 404 });
  log(`conferma: ${scelta}${nota ? ' con nota' : ''}`);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

/* ---------- il registro, da rileggere ---------- */

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (isUuid(id)) {
    const [r] = await query(
      `select id, stato, created_at, inviato_at, confermato_at, domanda, contesto, domanda_generale, controllo,
              modificato_a_mano, fornitore, modello_locale, modello_esterno, risposta_esterna, risposta_finale,
              fonti, da_verificare, certezza, ms_locale, ms_esterno, ms_finale, conferma, nota_medico
         from ricerche_cliniche where id = $1 and studio_id = $2`, [id, session.studioId]);
    if (!r) return NextResponse.json({ errore: 'Ricerca non trovata.' }, { status: 404 });
    return NextResponse.json({ ricerca: r }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const patientId = url.searchParams.get('patient_id') ?? '';
  const righe = await query(
    `select id, stato, created_at, domanda, certezza, modello_esterno,
            jsonb_array_length(fonti) as fonti
       from ricerche_cliniche
      where studio_id = $1 ${isUuid(patientId) ? 'and patient_id = $2' : ''}
      order by created_at desc limit 20`,
    isUuid(patientId) ? [session.studioId, patientId] : [session.studioId]);
  return NextResponse.json({ ricerche: righe }, { headers: { 'Cache-Control': 'no-store' } });
}
