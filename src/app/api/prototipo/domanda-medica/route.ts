import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { generaOllamaEsito } from '@/lib/ollama';
import {
  RIFORMULA_PROMPT,
  RISPOSTA_PROMPT,
  nonMedica,
  ripuliRiformulazione,
  validaGenerale,
} from '@/lib/domanda-medica';

export const dynamic = 'force-dynamic';

// Domanda medica in generale (14.9.2026). Due tempi, separati apposta.
//
//   POST {azione:'riformula', domanda}  → il modello LOCALE riscrive la domanda
//        come domanda di medicina generale; il codice la valida e la restituisce
//        DA APPROVARE. Niente parte.
//   POST {azione:'chiedi', domanda, generale} → si valida di nuovo QUI (mai
//        fidarsi di ciò che torna dal browser) e solo allora si risponde.
//
// Vincoli nLPD: la domanda originale non esce da questo Mac, non va nel
// database e non finisce nei log (si registrano solo conteggi e booleani). La
// risposta è generale, non si aggancia a nessun paziente e non entra in
// cartella. L'uscita verso un modello esterno resta SPENTA finché non c'è
// l'ok legale e l'ok di spesa: senza DOMANDA_MEDICA_FORNITORE risponde il
// modello locale e la pagina lo dice.
const MODELLO = process.env.PROTOTIPO_LLM || 'gemma3:12b';
const FORNITORE = (process.env.DOMANDA_MEDICA_FORNITORE || '').trim();


function log(m: string) {
  console.log(`[domanda-medica] ${m}`);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!['medico', 'admin'].includes(session.role)) {
    return NextResponse.json({ errore: 'Le domande di medicina le fa il medico.' }, { status: 403 });
  }
  const corpo = await req.json().catch(() => null);
  const azione = String(corpo?.azione ?? '');
  const domanda = String(corpo?.domanda ?? '').trim().slice(0, 1500);
  if (!domanda) return NextResponse.json({ errore: 'domanda_mancante' }, { status: 400 });

  if (azione === 'riformula') {
    const esito = await generaOllamaEsito(RIFORMULA_PROMPT.replace('{testo}', domanda), {
      modello: MODELLO,
      timeoutMs: 120_000,
    });
    if (!esito.ok) {
      log(`riformulazione non riuscita: ${esito.causa}`);
      return NextResponse.json({ errore: 'Il modello locale non ha risposto: la domanda non è uscita da qui.', causa: esito.causa }, { status: 503 });
    }
    if (nonMedica(esito.testo)) {
      log(`riformulazione: non medica (${esito.ms} ms)`);
      return NextResponse.json({ non_medica: true });
    }
    const generale = ripuliRiformulazione(esito.testo);
    const v = validaGenerale(domanda, generale);
    log(`riformulazione: ${v.ok ? 'pulita' : 'da rivedere'}, ${v.blocchi.length} blocchi, ${v.avvisi.length} avvisi (${esito.ms} ms)`);
    return NextResponse.json({ generale, ...v }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (azione === 'chiedi') {
    const generale = String(corpo?.generale ?? '').trim().slice(0, 600);
    // Si valida DI NUOVO qui: il testo approvato passa dal browser e potrebbe
    // essere stato modificato a mano dopo il controllo.
    const v = validaGenerale(domanda, generale);
    if (!v.ok) {
      log(`invio rifiutato: ${v.blocchi.map((b) => b.tipo).join(',')}`);
      return NextResponse.json({ errore: 'La domanda riscritta contiene ancora un dato personale: non è partita.', ...v }, { status: 400 });
    }
    // NON si risponde col modello locale. Nel banco del 14.9.2026 il modello
    // sul Mac (12B) ha dato una posologia SBAGLIATA di apixaban e ha invertito
    // ipertensione da camice bianco e mascherata: su una domanda di medicina
    // una risposta plausibile e sbagliata è peggio di nessuna risposta. Finché
    // non è collegato un modello misurato, questa via resta chiusa
    // ([[Misure/Banchi]], banco della domanda medica).
    if (!FORNITORE) {
      log('nessun modello adatto collegato: non rispondo');
      return NextResponse.json(
        {
          errore:
            'Non è ancora collegato un modello adatto alle domande di medicina. Il modello locale è troppo piccolo: nel banco del 14.9.2026 ha sbagliato un dosaggio, quindi qui non risponde. La domanda riscritta è pronta e non è uscita da qui.',
          non_collegato: true,
        },
        { status: 503 }
      );
    }
    // Uscita verso un modello esterno: l'adattatore non è ancora scritto.
    // Quando lo sarà, qui ci vanno il fornitore autorizzato (guardia sugli
    // indirizzi, come `FORNITORI_AUTORIZZATI` nella catena) e la stima di
    // spesa; ciò che parte è SOLO `generale`, mai `domanda`.
    log(`fornitore «${FORNITORE}» configurato ma l'adattatore non è ancora scritto`);
    const esito = await generaOllamaEsito(RISPOSTA_PROMPT.replace('{testo}', generale), {
      modello: MODELLO,
      timeoutMs: 180_000,
    });
    if (!esito.ok) {
      log(`risposta non riuscita: ${esito.causa}`);
      return NextResponse.json({ errore: 'Il modello non ha risposto.', causa: esito.causa }, { status: 503 });
    }
    log(`risposta data dal modello locale (${esito.ms} ms)`);
    return NextResponse.json(
      { risposta: esito.testo.trim(), dove: 'locale', modello: MODELLO, ms: esito.ms },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}
