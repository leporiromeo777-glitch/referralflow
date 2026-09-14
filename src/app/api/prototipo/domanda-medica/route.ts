import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { fornitoreAutorizzato, leggiConf } from '@/lib/fornitori';
// La RIFORMULAZIONE resta locale: la domanda col paziente dentro non esce da
// questo Mac nemmeno per essere ripulita. Esce solo ciò che è già generale.
import { generaOllamaEsito } from '@/lib/ollama';
import {
  RIFORMULA_PROMPT,
  RISPOSTA_PROMPT,
  ripuliRisposta,
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
// Il modello che risponde: gemma 4 31B su Infomaniak (Ginevra), scelto col
// banco del 15.9.2026 — il più veloce degli otto, zero risposte mancate e
// corretto su entrambe le domande a risposta secca ([[Misure/Banchi]]).
// Indirizzo e chiave sono quelli che la catena usa già: una chiave sola, in
// un file solo, con i permessi giusti.
const MODELLO = process.env.DOMANDA_MEDICA_MODELLO || 'google/gemma-4-31B-it';
const CONF = path.join(os.homedir(), '.referralflow-esterno.conf');

function fornitore(): { url: string; chiave: string } | null {
  try {
    const c = leggiConf(readFileSync(CONF, 'utf-8'));
    if (!c.url || !c.chiave) return null;
    // La guardia: un indirizzo fuori lista non si chiama, anche se è scritto
    // nel file. Stessa regola della catena.
    if (!fornitoreAutorizzato(c.url)) {
      log(`indirizzo NON autorizzato nella configurazione: rifiutato`);
      return null;
    }
    return { url: c.url, chiave: c.chiave };
  } catch {
    return null;
  }
}


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
      modello: process.env.PROTOTIPO_LLM || 'gemma3:12b',
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
    // La domanda che esce è SOLO `generale`: quella originale non lascia mai
    // questo processo. Il modello locale non risponde qui — nel banco del
    // 14.9.2026 ha dato una posologia sbagliata, e su una domanda di medicina
    // una risposta plausibile e sbagliata è peggio di nessuna risposta.
    const f = fornitore();
    if (!f) {
      log('nessun fornitore autorizzato configurato: non rispondo');
      return NextResponse.json(
        {
          errore:
            'Non è collegato un modello per le domande di medicina. La domanda riscritta è pronta e non è uscita da qui.',
          non_collegato: true,
        },
        { status: 503 }
      );
    }
    const t0 = Date.now();
    let risposta = '';
    try {
      const r = await fetch(f.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.chiave}` },
        body: JSON.stringify({
          model: MODELLO,
          messages: [{ role: 'user', content: RISPOSTA_PROMPT.replace('{testo}', generale) }],
          temperature: 0,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) {
        log(`fornitore: HTTP ${r.status}`);
        return NextResponse.json({ errore: 'Il modello non ha risposto in questo momento.' }, { status: 503 });
      }
      const j = await r.json();
      risposta = ripuliRisposta(String(j?.choices?.[0]?.message?.content ?? ''));
    } catch (e) {
      log(`fornitore non raggiungibile: ${String((e as Error)?.name ?? e).slice(0, 40)}`);
      return NextResponse.json({ errore: 'Il modello non è raggiungibile in questo momento.' }, { status: 503 });
    }
    const ms = Date.now() - t0;
    if (!risposta) {
      log(`risposta vuota (${ms} ms)`);
      return NextResponse.json({ errore: 'Il modello ha risposto a vuoto.' }, { status: 503 });
    }
    log(`risposta data (${ms} ms, ${MODELLO})`);
    return NextResponse.json(
      { risposta, dove: 'Infomaniak · server in Svizzera', modello: MODELLO, ms },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}
