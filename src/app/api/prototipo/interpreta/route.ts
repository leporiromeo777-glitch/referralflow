import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { generaOllamaEsito, ollamaAttivo } from '@/lib/ollama';
import { procedurePerRuolo } from '@/lib/procedure-registro';
import { interpreta } from '@/lib/interprete';
import { apriTraccia, chiudiTraccia } from '@/lib/tracce';

export const dynamic = 'force-dynamic';

// Interpretazione di una domanda scritta (13.9.2026): il CODICE normalizza,
// riconosce la procedura, estrae paziente/mese/giorno e dice quanto è sicuro
// (src/lib/interprete.ts). Solo nei casi «probabili» il modello locale fa da
// giudice tra i candidati, e la sua scelta vale solo se è nel registro; quel
// giudizio lascia una traccia. Mai il testo della domanda nei log.
const RUOLO: Record<string, string> = { segretaria: 'secretary', medico: 'doctor', admin: 'org_admin', inviante: 'inviante', assistente: 'assistant', tecnico: 'tech_admin' };
const MODELLO = process.env.PROTOTIPO_LLM || 'gemma3:12b';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  const domanda = String(corpo?.domanda ?? '').trim().slice(0, 500);
  if (!domanda) return NextResponse.json({ errore: 'domanda_mancante' }, { status: 400 });
  const ruolo = RUOLO[session.role] ?? 'secretary';
  const ctx = corpo?.contesto && typeof corpo.contesto === 'object' ? corpo.contesto : {};
  const contesto = {
    pagina: typeof ctx.pagina === 'string' ? ctx.pagina : undefined,
    paziente_id: typeof ctx.paziente_id === 'string' && isUuid(ctx.paziente_id) ? ctx.paziente_id : null,
    bozza_id: typeof ctx.bozza_id === 'string' && isUuid(ctx.bozza_id) ? ctx.bozza_id : null,
    documento_id: typeof ctx.documento_id === 'string' && isUuid(ctx.documento_id) ? ctx.documento_id : null,
  };
  const pazienti = await query<{ id: string; cognome: string; nome: string }>(`select id, cognome, nome from patients where studio_id = $1 limit 2000`, [session.studioId]);
  const registro = procedurePerRuolo(ruolo);
  const t0 = Date.now();
  const i = interpreta(domanda, { registro, pazienti, contesto });

  let giudice: 'codice' | 'modello' = 'codice';
  let procedura = i.procedura;
  let sicurezza = i.sicurezza;
  let tracciaId: number | null = null;
  // Caso grigio: il CODICE ha già scelto il candidato migliore; il modello
  // dice solo se la domanda chiede davvero quella procedura (sì) o altro
  // (nessuna). Non sceglie tra candidati: al banco sbagliava dove il codice
  // aveva ragione.
  if (sicurezza === 'media' && i.candidati.length && (await ollamaAttivo())) {
    const cand = [registro.find((p) => p.nome === i.candidati[0].nome)].filter((p): p is NonNullable<typeof p> => !!p);
    const prompt = `Sei il giudice di un assistente per uno studio medico. L'utente ha scritto una domanda. La procedura candidata è:\n${cand.map((p) => `- ${p.nome}: ${p.titolo}. ${p.descrizione.split('.')[0]}.`).join('\n')}\n\nDOMANDA: ${domanda}\n\nLa domanda chiede questa procedura? Rispondi SOLO in JSON: {"procedura": "${cand[0]?.nome ?? 'nessuna'}"} se sì, oppure {"procedura": "nessuna"} se chiede altro (un numero, un documento, un'informazione, un'altra cosa).`;
    const esito = await generaOllamaEsito(prompt, { json: true, modello: MODELLO, timeoutMs: 25_000 });
    let scelta = 'nessuna';
    if (esito.ok) { try { scelta = String(JSON.parse(esito.testo)?.procedura ?? 'nessuna'); } catch { scelta = 'nessuna'; } }
    giudice = 'modello';
    const valida = cand.find((p) => p.nome === scelta) ?? null;
    procedura = valida;
    sicurezza = valida ? 'alta' : 'nessuna';
    try {
      tracciaId = await apriTraccia({
        studioId: session.studioId, userId: session.id, patientId: i.paziente?.id ?? null, procedura: 'interpretazione', obiettivo: domanda,
        passi: [
          { passo: 'Interpretazione del codice: candidati e punteggi', esito: 'ok', fonti: [], nota: i.candidati.slice(0, 3).map((c) => `${c.nome} ${c.punteggio}`).join(' · ') },
          { passo: 'Giudizio del modello locale sul candidato del codice (sì / nessuna)', esito: esito.ok ? 'ok' : 'vuoto', fonti: [], nota: esito.ok ? `${MODELLO}: ${scelta}${valida ? '' : ' (non nel registro → domanda libera)'}` : `${MODELLO}: ${esito.causa}` },
        ],
        fonti: [], mancanti: [], modello: MODELLO,
      });
      await chiudiTraccia(tracciaId, { durataMs: Date.now() - t0, caratteri: 0 });
    } catch { tracciaId = null; }
  }
  const mancano = procedura ? [...(procedura.input === 'paziente' && !i.paziente ? ['paziente'] : []), ...(procedura.input === 'bozza' && !i.bozzaId && !i.paziente ? ['bozza'] : [])] : [];
  const azione = !procedura ? 'libera' : (mancano.length || i.pazientiAmbigui.length && !i.paziente) ? 'chiedi' : 'procedura';
  console.log(`[interprete] azione=${azione} procedura=${procedura?.nome ?? '-'} sicurezza=${sicurezza} giudice=${giudice} candidati=${i.candidati.length} ${Date.now() - t0}ms`);
  return NextResponse.json({
    azione, giudice, sicurezza,
    procedura: procedura ? { nome: procedura.nome, titolo: procedura.titolo, input: procedura.input, attesa: procedura.attesa } : null,
    parametri: { patient_id: i.paziente?.id ?? null, bozza_id: i.bozzaId, mese: i.mese, giorno: i.giorno },
    paziente: i.paziente ? { id: i.paziente.id, nome: `${i.paziente.cognome} ${i.paziente.nome}` } : null,
    pazientiAmbigui: i.pazientiAmbigui.map((p) => ({ id: p.id, nome: `${p.cognome} ${p.nome}` })),
    mancano, candidati: i.candidati.slice(0, 3).map((c) => ({ nome: c.nome, titolo: c.titolo })),
    spiegazione: procedura ? `«${procedura.titolo}»${i.paziente ? ` per ${i.paziente.cognome} ${i.paziente.nome}` : ''}${i.mese ? ` · ${i.mese}` : ''}${i.giorno ? ` · ${i.giorno}` : ''}${giudice === 'modello' ? ' · giudizio del modello locale' : ''}` : i.spiegazione,
    traccia_id: tracciaId,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
