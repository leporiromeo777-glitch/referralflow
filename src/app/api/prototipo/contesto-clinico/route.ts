import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { briefingGrezzo } from '@/lib/briefing';
import { generaOllamaEsito } from '@/lib/ollama';
import { CONTESTO_PROMPT, controllaContesto, separaContesto, spieDiPaziente } from '@/lib/contesto-clinico';

export const dynamic = 'force-dynamic';

// Prima fetta della ricerca clinica esterna protetta (16.9.2026).
//
// QUI NON ESCE NIENTE. Il codice assembla la cartella (`briefingGrezzo`: la
// stessa del briefing pre-visita), il modello LOCALE ne ricava il contesto
// minimo, e un controllo deterministico cerca dentro quel testo gli
// identificatori VERI di quel paziente. Al medico si mostra che cosa
// uscirebbe, prima che esista un fuori dove mandarlo.
//
// Scelto gemma3:12b al banco del 16.9 su cartelle inventate: zero fughe, tutti
// i fatti che determinano la risposta tenuti, domanda riscritta davvero in
// forma generale — il modello medico da 4B teneva l'età esatta e ricopiava la
// domanda del medico ([[Misure/Banchi]]).
const MODELLO = process.env.CONTESTO_LLM || process.env.PROTOTIPO_LLM || 'gemma3:12b';
const RUOLI = new Set(['medico', 'admin']);
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  // La cartella intera la legge solo chi la cartella la può già leggere.
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });

  const c = await req.json().catch(() => null);
  const patientId = String(c?.patient_id ?? '');
  const domanda = String(c?.domanda ?? '').trim();
  if (!isUuid(patientId)) return NextResponse.json({ errore: 'Paziente non valido.' }, { status: 400 });
  if (domanda.length < 10) return NextResponse.json({ errore: 'Scrivi la domanda per esteso.' }, { status: 400 });
  if (domanda.length > 2000) return NextResponse.json({ errore: 'Domanda troppo lunga.' }, { status: 400 });

  const [p] = await query<{ cognome: string; nome: string; data_nascita: string | null; telefono: string | null; email: string | null; via: string | null; npa: string | null; localita: string | null; avs: string | null; n_assicurato: string | null }>(
    `select cognome, nome, data_nascita::text, telefono, email, via, npa, localita, avs, n_assicurato
       from patients where id = $1 and studio_id = $2`, [patientId, session.studioId]);
  if (!p) return NextResponse.json({ errore: 'Paziente non trovato.' }, { status: 404 });

  const grezzo = await briefingGrezzo(session.studioId, patientId);
  if (!grezzo) return NextResponse.json({ errore: 'Cartella non leggibile.' }, { status: 404 });

  const t0 = Date.now();
  const esito = await generaOllamaEsito(
    CONTESTO_PROMPT.replace('{cartella}', grezzo.testo).replace('{domanda}', domanda),
    { modello: MODELLO, timeoutMs: 300_000, aPezzi: true }
  );
  if (!esito.ok) {
    console.log(`[contesto-clinico] modello non riuscito: ${esito.causa}`);
    return NextResponse.json({ errore: 'Il modello locale non ha risposto: riprova fra un minuto.' }, { status: 503 });
  }
  const pulito = esito.testo.includes('</think>') ? esito.testo.split('</think>').pop()!.trim() : esito.testo.trim();
  const pacchetto = separaContesto(pulito);
  const controllo = controllaContesto(pacchetto, spieDiPaziente(p));
  // Nei log solo numeri: mai la cartella, mai il pacchetto.
  console.log(`[contesto-clinico] cartella=${grezzo.testo.length} pacchetto=${pulito.length} fughe=${controllo.fughe.length} deittici=${controllo.deittici.length} eta=${controllo.etaEsatta ? 1 : 0} modello=${MODELLO} ${Date.now() - t0}ms`);

  return NextResponse.json({
    ok: true,
    cartella_caratteri: grezzo.testo.length,
    contesto: pacchetto.contesto,
    domanda_generale: pacchetto.domanda,
    controllo,
    modello: MODELLO,
    ms: esito.ms,
    // In questa fetta non c'è un fuori: si guarda e basta.
    inviato: false,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
