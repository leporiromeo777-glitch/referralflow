import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { aggregatiStudio } from '@/lib/statistiche-ai';
import { generaOllamaEsito, ollamaAttivo, ultimaCausaOllama, SPIEGAZIONE } from '@/lib/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Chiedi ai tuoi dati»: domanda in italiano → risposta dell'AI locale basata
// SOLO sugli aggregati dello studio (mai SQL generato dal modello, mai dati di
// singoli pazienti). Solo utenti dello studio.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) {
    return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  }
  if (!(await ollamaAttivo())) {
    const causa = ultimaCausaOllama() ?? 'spento';
    return NextResponse.json(
      { errore: SPIEGAZIONE[causa], causa, diagnostica: '/api/ai/diagnostica' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const domanda = typeof body?.domanda === 'string' ? body.domanda.trim().slice(0, 400) : '';
  if (!domanda) return NextResponse.json({ errore: 'domanda_mancante' }, { status: 400 });

  const dati = await aggregatiStudio(session.studioId);

  const prompt = [
    'Sei l\'assistente dei dati di uno studio medico. Rispondi alla domanda usando',
    'SOLO i numeri nel JSON qui sotto (statistiche aggregate dello studio).',
    'Regole: se la risposta non è nei dati, di\' chiaramente che questo dato non è',
    'disponibile qui. Non inventare MAI numeri. Rispondi in italiano, 2-5 frasi,',
    'citando i numeri che usi. Le date sono in formato AAAA-MM.',
    '',
    `DOMANDA: ${domanda}`,
    '',
    'DATI:',
    JSON.stringify(dati),
  ].join('\n');

  // Niente più 90 s fissi: il timeout viene da OLLAMA_TIMEOUT_MS (240 s), perché
  // la prima domanda dopo un dettato trova sempre il modello freddo.
  const esito = await generaOllamaEsito(prompt);
  if (!esito.ok) {
    return NextResponse.json(
      { errore: SPIEGAZIONE[esito.causa], causa: esito.causa, dettaglio: esito.dettaglio, diagnostica: '/api/ai/diagnostica' },
      { status: esito.causa === 'modello_assente' ? 503 : 502 }
    );
  }
  return NextResponse.json({ risposta: esito.testo, ms: esito.ms });
}
