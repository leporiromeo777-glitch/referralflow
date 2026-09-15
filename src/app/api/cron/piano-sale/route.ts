import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { generaOllamaEsito } from '@/lib/ollama';
import { daDeciderePerPrompt, leggiSale, pianoDelGiorno } from '@/lib/sale';

export const dynamic = 'force-dynamic';

// Il piano delle sale del giorno, preparato PRIMA che qualcuno lo chieda
// (15.9.2026). Lo chiama il cron dell'agenda, che gira già ogni 15 minuti: il
// piano si fa una volta al giorno e poi si riusa.
//
// Divisione del lavoro, e non è un dettaglio:
//   - il CODICE risolve quello che le regole decidono (`pianoDelGiorno`);
//   - il MODELLO propone solo dove restano caselle aperte, e la sua proposta
//     resta marcata come proposta finché una persona non l'accetta.
// Al modello vanno solo nomi di stanze, di colleghi e orari: mai un paziente.

// Qui gira **Qwen 3.8 27B**, non il 12B dell'assistente: è un lavoro di
// fondo che nessuno aspetta — si fa una volta al giorno prima che qualcuno
// apra la Home — quindi si può spendere un minuto per una risposta migliore.
// È lo stesso modello scelto per le tappe locali della catena
// ([[Decisioni/Registro]], 12.9.2026).
const MODELLO = process.env.PIANO_SALE_LLM || 'qwen3.8:27b';
const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

const PROMPT = `Sei l'assistente di uno studio di cardiologia svizzero e prepari il piano delle sale della giornata.

Il piano qui sotto è già deciso dalle regole dello studio: NON discuterlo e non cambiarlo. Restano delle caselle aperte — stanze condivise con più persone in studio nello stesso momento.

Per ogni casella aperta proponi chi la prenda, e in una riga il perché. Regole del tuo lavoro:
- Proponi, non decidere: chiudi dicendo che la conferma è di chi è in studio.
- Se due persone hanno orari diversi, dividi la stanza per fascia oraria invece di sceglierne una.
- Non inventare stanze, nomi o orari che non sono scritti qui.
- Ricorda che una fetta in agenda non è sempre una persona dentro una stanza: le sovrapposizioni non sono per forza un conflitto.
- Al massimo sei righe, in italiano, asciutto.

{testo}`;

export async function GET(req: NextRequest) {
  const secret = process.env.REMINDER_SECRET;
  if (!secret || req.nextUrl.searchParams.get('key') !== secret) {
    return new NextResponse('Not found', { status: 404 });
  }
  const forza = req.nextUrl.searchParams.get('forza') === '1';
  const oggi = new Date();
  const giornoIso = oggi.toISOString().slice(0, 10);
  const giorno = GG[oggi.getDay()];

  let regole;
  try {
    regole = leggiSale(readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8'));
  } catch {
    return NextResponse.json({ errore: 'pagina delle sale non leggibile' }, { status: 500 });
  }
  if (!regole.length) return NextResponse.json({ errore: 'nessuna regola nella pagina' }, { status: 500 });

  const studi = await query<{ id: string }>('select id from studios');
  const fatti: { studio: string; stato: string }[] = [];

  for (const s of studi) {
    const gia = await query<{ id: string }>(
      'select id from piano_sale where studio_id = $1 and giorno = $2', [s.id, giornoIso]);
    if (gia.length && !forza) { fatti.push({ studio: s.id, stato: 'già fatto' }); continue; }

    // Chi è in studio oggi: i titolari di agenda con almeno un appuntamento.
    const presenti = (await query<{ nome: string }>(
      `select distinct pr.nome from appointments a join providers pr on pr.id = a.provider_id
        where a.studio_id = $1 and a.starts_at::date = $2::date and pr.attivo order by 1`,
      [s.id, giornoIso]
    )).map((r) => r.nome);

    const piano = pianoDelGiorno(regole, presenti, giorno);
    let proposta: string | null = null;
    let propostaDa: string | null = null;
    let ms: number | null = null;

    if (piano.daDecidere.length) {
      const esito = await generaOllamaEsito(
        PROMPT.replace('{testo}', daDeciderePerPrompt(piano, presenti)),
        { modello: MODELLO, timeoutMs: 900_000, aPezzi: true }
      );
      if (esito.ok) {
        // Qwen 3.8 ragiona ad alta voce fra <think>…</think>: si tiene solo
        // quello che viene dopo, altrimenti il piano è illeggibile.
        const pulito = esito.testo.includes('</think>')
          ? esito.testo.split('</think>').pop()!.trim()
          : esito.testo.trim();
        proposta = pulito;
        propostaDa = `${MODELLO} · modello locale`;
        ms = esito.ms;
      }
      else console.log(`[piano-sale] proposta non riuscita: ${esito.causa}`);
    }

    await query(
      `insert into piano_sale (studio_id, giorno, righe, da_decidere, proposta, proposta_da, proposta_ms)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (studio_id, giorno) do update set
         righe = excluded.righe, da_decidere = excluded.da_decidere,
         proposta = excluded.proposta, proposta_da = excluded.proposta_da,
         proposta_ms = excluded.proposta_ms, accettata_at = null, accettata_da = null,
         updated_at = now()`,
      [s.id, giornoIso, JSON.stringify(piano.righe), JSON.stringify(piano.daDecidere), proposta, propostaDa, ms]
    );
    console.log(`[piano-sale] ${giornoIso} ${giorno}: ${piano.righe.length} stanze, ${piano.daDecidere.length} da decidere, ${presenti.length} in studio${ms ? `, proposta in ${ms} ms` : ''}`);
    fatti.push({ studio: s.id, stato: `${piano.righe.length} stanze, ${piano.daDecidere.length} da decidere` });
  }
  return NextResponse.json({ giorno: giornoIso, fatti });
}
