import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { generaOllamaEsito, ollamaAttivo, ultimaCausaOllama, SPIEGAZIONE } from '@/lib/ollama';

export const dynamic = 'force-dynamic';

// Il bot del prototipo (13.9.2026): risponde alle domande della sidebar AI
// con il modello LOCALE (Ollama, nessun cloud) e SOLO sui dati che il
// browser gli passa (i numeri e le liste già caricate dalla piattaforma,
// con la sessione dell'utente). Niente memoria, niente dati clinici oltre
// quelli già in pagina; se il modello non c'è, risponde il codice coi numeri.
const MAX_CONTESTO = 6000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const domanda = String(corpo?.domanda ?? '').trim().slice(0, 500);
  if (!domanda) return NextResponse.json({ errore: 'domanda_mancante' }, { status: 400 });
  const contesto = JSON.stringify(corpo?.contesto ?? {}).slice(0, MAX_CONTESTO);
  const ruolo = String(corpo?.ruolo ?? 'secretary');

  if (!(await ollamaAttivo())) {
    const causa = ultimaCausaOllama() ?? 'spento';
    return NextResponse.json({ risposta: `${SPIEGAZIONE[causa]} Intanto i numeri della giornata sono nelle schede in alto.`, fonte: 'codice', causa });
  }
  const prompt = `Sei l'assistente di ReferralFlow, la piattaforma di uno studio medico svizzero. Rispondi in italiano, in modo asciutto, al massimo 4 frasi o un elenco breve. Usa SOLO i dati qui sotto (JSON con i numeri e le liste della giornata, già filtrati per i permessi del ruolo «${ruolo}»). Se il dato non c'è, di' che non è disponibile: non inventare nomi, numeri o date. Non dare consigli clinici.

DATI:
${contesto}

DOMANDA: ${domanda}

RISPOSTA:`;
  const esito = await generaOllamaEsito(prompt);
  if (!esito.ok) return NextResponse.json({ risposta: SPIEGAZIONE[esito.causa], fonte: 'codice', causa: esito.causa, dettaglio: esito.dettaglio });
  return NextResponse.json({ risposta: esito.testo.slice(0, 1500), fonte: 'modello locale', ms: esito.ms });
}
