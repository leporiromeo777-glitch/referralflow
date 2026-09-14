import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { configurazioneOllama, ollamaAttivo } from '@/lib/ollama';
import { isUuid } from '@/lib/cartella';
import { testoDocumento } from '@/lib/documenti-testo';
import { apriTraccia, chiudiTraccia, type PassoTraccia } from '@/lib/tracce';
import { query } from '@/lib/db';
import { elencoPerPrompt, trovaProcedura } from '@/lib/procedure-registro';
import { caricaOrganizzazione, organizzazionePerPrompt } from '@/lib/organizzazione';
import { caricaPercorsi, percorsiPerPrompt, trovaPercorso } from '@/lib/percorsi';

export const dynamic = 'force-dynamic';

// Il bot del prototipo (13.9.2026): risponde alle domande della sidebar AI
// con il modello LOCALE (Ollama, nessun cloud) e SOLO sui dati che il
// browser gli passa (numeri e liste già caricati dalla piattaforma, con la
// sessione dell'utente). Risposta in STREAMING (testo semplice, parola per
// parola) e modello tenuto caldo 30 minuti: la lentezza percepita era la
// risposta tutta insieme alla fine, a modello freddo. Niente memoria, niente
// dati clinici oltre quelli in pagina; se il modello non c'è risponde il codice.
// Ogni risposta del modello lascia una TRACCIA (assistente_tracce): passi del
// codice, documento letto, modello, tempo; l'id viaggia nell'header X-Traccia
// e il prototipo la mostra come «Da dove viene».
const MODELLO = process.env.PROTOTIPO_LLM || 'gemma3:12b';
const MAX_CONTESTO = 3500;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const domanda = String(corpo?.domanda ?? '').trim().slice(0, 500);
  if (!domanda) return NextResponse.json({ errore: 'domanda_mancante' }, { status: 400 });
  const contesto = JSON.stringify(corpo?.contesto ?? {}).slice(0, MAX_CONTESTO);
  const ruolo = String(corpo?.ruolo ?? 'secretary');
  // Documento aperto nel visualizzatore: il suo testo entra nel prompt (modello locale).
  const documentoId = typeof corpo?.documento_id === 'string' && isUuid(corpo.documento_id) ? corpo.documento_id : null;
  const doc = documentoId ? await testoDocumento(session.studioId, documentoId, session.id) : null;
  // Grafo dei fatti del paziente aperto (pazienti_fatti): se è vuoto, il
  // briefing grezzo lo riempie (letture di cartella, niente modello).
  const pazienteId = typeof corpo?.paziente_id === 'string' && isUuid(corpo.paziente_id) ? corpo.paziente_id : null;
  let fatti: { relazione: string; oggetto: string; data_fatto: string | null; fonte_tipo: string }[] = [];
  if (pazienteId) {
    const leggi = () => query<{ relazione: string; oggetto: string; data_fatto: string | null; fonte_tipo: string }>(
      `select relazione, oggetto, data_fatto::text, fonte_tipo from pazienti_fatti where studio_id = $1 and patient_id = $2 order by relazione, data_fatto desc nulls last limit 60`, [session.studioId, pazienteId]);
    fatti = await leggi();
    if (!fatti.length) {
      try { const { briefingGrezzo } = await import('@/lib/briefing'); if (await briefingGrezzo(session.studioId, pazienteId)) fatti = await leggi(); } catch { fatti = []; }
    }
  }
  const bloccoFatti = fatti.length ? `\n\nFATTI DEL PAZIENTE APERTO (grafo della piattaforma, ogni riga con la sua fonte):\n${fatti.map((f) => `- ${f.relazione.replace(/_/g, ' ')}: ${f.oggetto}${f.data_fatto ? ` (${f.data_fatto})` : ''} [fonte: ${f.fonte_tipo}]`).join('\n')}` : '';
  const org = caricaOrganizzazione();
  const bloccoOrg = organizzazionePerPrompt(org);
  // Percorsi dalla wiki: entrano nel prompt solo se la domanda parla di
  // percorsi, sequenze o esami da fare, o nomina un percorso.
  const percorsi = caricaPercorsi();
  const percorsoNominato = trovaPercorso(percorsi, domanda);
  const bloccoPercorsi = percorsoNominato || /percors|sequenz|quali esami|che esami|iter\b/i.test(domanda) ? percorsiPerPrompt(percorsoNominato ? [percorsoNominato] : percorsi) : '';
  const proceduraSimile = trovaProcedura(domanda, ruolo);
  const blocccoDoc = doc ? `\n\nDOCUMENTO APERTO («${doc.nota || doc.filename}»${doc.troncato ? ', troncato' : ''}):\n${doc.testo || '(nessun testo estraibile: immagine o scansione senza OCR)'}` : '';

  const testoSemplice = (t: string, fonte: string) =>
    new Response(t, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Fonte': fonte, 'Cache-Control': 'no-store' } });
  if (!(await ollamaAttivo())) {
    return testoSemplice('Il modello locale non è raggiungibile in questo momento: i numeri della giornata sono nelle schede in alto.', 'codice');
  }
  const prompt = `Ti chiami Cleo e sei l'assistente di ReferralFlow, la piattaforma di uno studio medico svizzero (se te lo chiedono, ti chiami Cleo; non sei una persona e non hai altri nomi). Rispondi in italiano, asciutto, al massimo ${doc ? 6 : 3} frasi o un elenco breve. Usa SOLO i dati qui sotto (JSON con i numeri e le liste della giornata, già filtrati per il ruolo «${ruolo}»${doc ? ', e il testo del documento aperto' : ''}). Se il dato non c'è, dillo: non inventare nomi, numeri o date. Riporta i valori esattamente come sono scritti. Niente consigli clinici, niente diagnosi: puoi riassumere, elencare valori e conclusioni scritte dal medico refertante.

PROCEDURE DISPONIBILI (se la domanda corrisponde a una di queste, rispondi in una riga suggerendo di chiederla con quel nome, senza eseguirla):
${elencoPerPrompt(ruolo)}
${bloccoOrg ? `\nORGANIZZAZIONE DELLO STUDIO (chi fa che cosa; rispondi con il ruolo, mai con nomi di persone):\n${bloccoOrg}\n` : ''}
${bloccoPercorsi ? `\nPERCORSI DIAGNOSTICO-TERAPEUTICI DELLO STUDIO (sequenze standard dalla wiki, stato «proposta» finché il medico non le valida; cita il percorso per nome, non aggiungere esami):\n${bloccoPercorsi}\n` : ''}
DATI:
${contesto}${bloccoFatti}${blocccoDoc}

DOMANDA: ${domanda}

RISPOSTA:`;
  let r: Response;
  try {
    r = await fetch(`${configurazioneOllama.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELLO, prompt, stream: true, keep_alive: '30m', options: { temperature: 0, num_predict: doc ? 400 : 220 } }),
      signal: AbortSignal.timeout(240_000),
      cache: 'no-store',
    });
  } catch {
    return testoSemplice('Il modello locale non ha risposto: forse la catena dei referti sta usando la GPU. Riprova tra un minuto.', 'codice');
  }
  if (!r.ok || !r.body) {
    console.error(`[ai-locale] bot del prototipo: Ollama ${r.status} modello=${MODELLO}`);
    return testoSemplice('Il modello locale ha risposto con un errore.', 'codice');
  }
  const t0 = Date.now();
  const passi: PassoTraccia[] = [
    { passo: `Contesto della pagina (numeri e liste già filtrati per il ruolo «${ruolo}»)`, esito: 'ok', fonti: [], nota: `${contesto.length} caratteri` },
    doc
      ? { passo: 'Testo del documento aperto, estratto sul Mac dello studio', esito: doc.testo ? 'ok' : 'vuoto', fonti: [doc.id], nota: doc.testo ? `${doc.testo.length} caratteri${doc.troncato ? ', troncato' : ''}` : 'nessun testo estraibile' }
      : { passo: 'Documento aperto', esito: 'vuoto', fonti: [], nota: 'nessun documento aperto' },
    { passo: 'Grafo dei fatti del paziente aperto', esito: fatti.length ? 'ok' : 'vuoto', fonti: pazienteId ? [pazienteId] : [], nota: pazienteId ? `${fatti.length} fatti` : 'nessun paziente aperto' },
    { passo: 'Registro delle procedure e organizzazione dello studio nel prompt', esito: 'ok', fonti: [], nota: proceduraSimile ? `somiglia a «${proceduraSimile.titolo}»` : `${org.responsabilita.length} responsabilità` },
    { passo: 'Risposta del modello locale, solo sui dati passati', esito: 'ok', fonti: [], nota: MODELLO },
  ];
  let tracciaId = 0;
  try {
    tracciaId = await apriTraccia({
      studioId: session.studioId, userId: session.id, procedura: doc ? 'documento' : 'domanda_libera', obiettivo: domanda, patientId: pazienteId,
      passi, fonti: doc ? [{ tipo: 'documento', id: doc.id, titolo: doc.nota || doc.filename }] : [], modello: MODELLO,
    });
  } catch (e) {
    console.error(`[ai-locale] traccia non aperta: ${(e as Error)?.message ?? e}`);
  }
  const lettore = r.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let resto = '';
  let caratteri = 0;
  const chiudi = () => { if (tracciaId) void chiudiTraccia(tracciaId, { durataMs: Date.now() - t0, caratteri }).catch(() => undefined); };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await lettore.read();
      if (done) { controller.close(); chiudi(); return; }
      resto += dec.decode(value, { stream: true });
      const righe = resto.split('\n');
      resto = righe.pop() ?? '';
      for (const riga of righe) {
        if (!riga.trim()) continue;
        try {
          const j = JSON.parse(riga);
          if (typeof j.response === 'string' && j.response) { caratteri += j.response.length; controller.enqueue(enc.encode(j.response)); }
        } catch { /* riga incompleta */ }
      }
    },
    cancel() { void lettore.cancel(); chiudi(); },
  });
  const intestazioni: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8', 'X-Fonte': 'modello locale', 'Cache-Control': 'no-store' };
  if (tracciaId) intestazioni['X-Traccia'] = String(tracciaId);
  return new Response(stream, { headers: intestazioni });
}
