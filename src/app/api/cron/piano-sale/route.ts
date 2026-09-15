import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { generaOllamaEsito } from '@/lib/ollama';
import { assegnaVisite, daSistemarePerPrompt, leggiSale, pianoDelGiorno } from '@/lib/sale';

export const dynamic = 'force-dynamic';

// Il piano delle sale del giorno, preparato PRIMA che qualcuno lo chieda
// (15.9.2026). Lo chiama il cron dell'agenda, che gira già ogni 15 minuti: il
// piano si fa una volta al giorno e poi si riusa.
//
// Divisione del lavoro, e non è un dettaglio:
//   - il CODICE risolve quello che le regole decidono (`pianoDelGiorno`) e
//     stringe le visite nel minor numero di stanze (`assegnaVisite`);
//   - il MODELLO propone solo su quel che resta scoperto — caselle aperte,
//     stanze che oggi non vede nessuno, persone che lavorano senza stanza — e
//     la sua proposta resta marcata come proposta finché qualcuno non
//     l'accetta.
// Al modello vanno solo nomi di stanze, di colleghi, orari e conteggi: mai un
// paziente.

// Qui gira **Qwen 3.8 27B**, non il 12B dell'assistente: è un lavoro di
// fondo che nessuno aspetta — si fa una volta al giorno prima che qualcuno
// apra la Home — quindi si può spendere un minuto per una risposta migliore.
// È lo stesso modello scelto per le tappe locali della catena
// ([[Decisioni/Registro]], 12.9.2026).
const MODELLO = process.env.PIANO_SALE_LLM || 'qwen3.8:27b';
const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

const PROMPT = `Sei l'assistente di uno studio di cardiologia svizzero e prepari il piano delle sale della giornata.

Il piano qui sotto è già deciso dalle regole dello studio: NON discuterlo e non cambiarlo. Restano tre cose da sistemare, e non sempre ci sono tutte:
1. le caselle aperte — stanze condivise con più persone in studio nello stesso momento;
2. le stanze che oggi non hanno NESSUNA visita: le visite di ogni medico sono già state strette nel minor numero di stanze possibile, quindi quelle vuote sono davvero disponibili;
3. chi oggi lavora senza avere una stanza: MediOnline non scrive dove avviene una visita, e per queste persone il piano non sa dove metterle.

Per ognuna proponi che cosa fare, e in una riga il perché. Regole del tuo lavoro:
- Proponi, non decidere: chiudi dicendo che la conferma è di chi è in studio.
- Dai una stanza vuota a chi non ce l'ha, quando ha senso; se una stanza vuota è intestata a qualcuno, dillo — è un prestito per la giornata, non un cambio di regola.
- Se due persone hanno orari diversi, dividi la stanza per fascia oraria invece di sceglierne una.
- Se le stanze vuote non bastano per tutti, dillo e scegli chi ha più visite.
- Non inventare stanze, nomi o orari che non sono scritti qui.
- Ricorda che una fetta in agenda non è sempre una persona dentro una stanza: le sovrapposizioni non sono per forza un conflitto.
- Al massimo otto righe, in italiano, asciutto.

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

    // Dove sono davvero le visite: serve per sapere quali stanze restano
    // vuote tutto il giorno e chi lavora senza averne una ([[src/lib/sale]]).
    const app = await query<{ id: string; chi: string | null; start: string; dur: number }>(
      `select a.id, pr.nome as chi, to_char(a.starts_at, 'HH24:MI') as start,
              greatest(5, round(extract(epoch from (coalesce(a.ends_at, a.starts_at + interval '30 min') - a.starts_at)) / 60))::int as dur
         from appointments a left join providers pr on pr.id = a.provider_id
        where a.studio_id = $1 and a.starts_at::date = $2::date
          and coalesce(a.stato_medionline, '') not in ('annullato', 'scusato')`,
      [s.id, giornoIso]
    );
    const visite = assegnaVisite(piano.righe, app.map((a) => ({ id: a.id, chi: a.chi ?? '', start: a.start, dur: a.dur })));
    const libere = piano.righe
      .filter((r) => !(visite[r.stanza] ?? []).length)
      .map((r) => ({ stanza: r.stanza, di: r.segmenti.find((x) => x.chi)?.chi ?? '' }));
    const messe = new Set(Object.values(visite).flat().map((v) => v.id));
    const conta = new Map<string, number>();
    for (const a of app) if (!messe.has(a.id)) {
      const chi = a.chi || 'appuntamenti senza medico in agenda';
      conta.set(chi, (conta.get(chi) ?? 0) + 1);
    }
    const senzaSala = [...conta].map(([chi, n]) => ({ chi, n })).sort((x, y) => y.n - x.n);

    let proposta: string | null = null;
    let propostaDa: string | null = null;
    let ms: number | null = null;

    if (piano.daDecidere.length || senzaSala.length || libere.length) {
      const esito = await generaOllamaEsito(
        PROMPT.replace('{testo}', daSistemarePerPrompt(piano, presenti, libere, senzaSala)),
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
    console.log(`[piano-sale] ${giornoIso} ${giorno}: ${piano.righe.length} stanze, ${piano.daDecidere.length} da decidere, ${libere.length} vuote, ${senzaSala.reduce((t, x) => t + x.n, 0)} visite senza sala, ${presenti.length} in studio${ms ? `, proposta in ${ms} ms` : ''}`);
    fatti.push({ studio: s.id, stato: `${piano.righe.length} stanze, ${piano.daDecidere.length} da decidere` });
  }
  return NextResponse.json({ giorno: giornoIso, fatti });
}
