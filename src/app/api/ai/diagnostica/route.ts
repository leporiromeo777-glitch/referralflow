import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { configurazioneOllama, generaOllamaEsito, modelliInstallati, SPIEGAZIONE } from '@/lib/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Diagnostica dell'AI locale (13.9.2026). Quando l'assistente «non risponde»
// le cause possibili sono cinque e prima erano tutte indistinguibili. Questa
// route gira SUL MAC, accanto a Ollama, e dice quale delle cinque è.
//
// Apri /api/ai/diagnostica da loggato per il controllo veloce (nessuna
// generazione, nessun modello caricato), /api/ai/diagnostica?prova=1 per
// fare anche una domanda vera al modello.
//
// Non tocca dati di pazienti: solo configurazione, nomi di modello e tempi.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }

  const { url, modello, pingMs, timeoutMs } = configurazioneOllama;
  const inizio = Date.now();
  const installati = await modelliInstallati();
  const msPing = Date.now() - inizio;

  const raggiungibile = installati !== null;
  const modelloPresente = raggiungibile && installati!.includes(modello);

  const base = {
    url,
    modelloConfigurato: modello,
    pingMs,
    timeoutMs,
    ollamaRaggiungibile: raggiungibile,
    msPing,
    modelliInstallati: installati,
    modelloPresente,
  };

  if (!raggiungibile) {
    return NextResponse.json({
      ...base,
      esito: 'ollama_non_raggiungibile',
      spiegazione: SPIEGAZIONE.spento,
      comeSiRipara: `Controlla che Ollama sia avviato e in ascolto su ${url} (dal Terminale del Mac: «ollama list»). Se il modello lo serve un altro programma, metti il suo indirizzo in OLLAMA_URL nel file .env.`,
    });
  }

  if (!modelloPresente) {
    return NextResponse.json({
      ...base,
      esito: 'modello_assente',
      spiegazione: SPIEGAZIONE.modello_assente,
      comeSiRipara: `Ollama risponde ma «${modello}» non è tra i modelli installati. O lo scarichi («ollama pull ${modello}»), o correggi OLLAMA_MODEL nel .env con uno dei nomi elencati qui sopra.`,
    });
  }

  if (req.nextUrl.searchParams.get('prova') !== '1') {
    return NextResponse.json({
      ...base,
      esito: 'configurazione_ok',
      spiegazione: 'Ollama risponde e il modello è installato. Per sapere se genera davvero, aggiungi ?prova=1 (può metterci qualche minuto a modello freddo).',
    });
  }

  const esito = await generaOllamaEsito('Rispondi con una sola parola: ok', { timeoutMs });
  if (!esito.ok) {
    return NextResponse.json({
      ...base,
      esito: 'generazione_fallita',
      causa: esito.causa,
      dettaglio: esito.dettaglio,
      msGenerazione: esito.ms,
      spiegazione: SPIEGAZIONE[esito.causa],
    });
  }

  return NextResponse.json({
    ...base,
    esito: 'ok',
    msGenerazione: esito.ms,
    rispostaDiProva: esito.testo.slice(0, 200),
    spiegazione: `Il modello ha risposto in ${(esito.ms / 1000).toFixed(1)} s: l'assistente funziona.`,
  });
}
