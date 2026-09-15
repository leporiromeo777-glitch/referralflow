import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { query } from '@/lib/db';
import { generaOllamaEsito } from '@/lib/ollama';
import { assegnaVisite, daSistemarePerPrompt, escluso, fuoriDalPiano, leggiSale, pianoDelGiorno, prestazioniFuoriPiano } from '@/lib/sale';

// Preparare il piano delle sale (15.9.2026). Sta qui, e non dentro una rotta,
// perché lo chiedono in due: il cron di notte e il pulsante «Prepara con
// l'AI» nella pagina Sale. Stesso lavoro, stesso risultato.
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

// Qui gira **Qwen 3.8 27B**, non il 12B dell'assistente: è un lavoro di fondo
// che nessuno aspetta, quindi si può spendere un minuto per una risposta
// migliore. È lo stesso modello delle tappe locali della catena.
const MODELLO = process.env.PIANO_SALE_LLM || 'qwen3.8:27b';
const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const ATTESA_PREDEFINITA = 150_000;   // quanto ci mette, finché non se ne sa di meglio

export const PROMPT = `Sei l'assistente di uno studio di cardiologia svizzero e prepari il piano delle sale della giornata.

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

// A che punto è il lavoro. Vive in memoria del processo: è un indicatore, non
// un dato — se il server riparte si perde, e va bene così.
export type FaseLavoro = 'regole' | 'modello' | 'salvo' | 'finito' | 'errore';
export type StatoLavoro = {
  attivo: boolean;
  fase: FaseLavoro;
  ms: number;          // da quanto sta lavorando
  attesi: number;      // quanto ci ha messo l'ultima volta che è riuscito
  percento: number;    // stima onesta: tempo passato sul tempo atteso
  caratteri: number;   // quanto ha scritto finora
  pensiero: number;    // quanto ha ragionato finora
  dettaglio: string;
};

const lavori = new Map<string, { da: number; fase: FaseLavoro; caratteri: number; pensiero: number; attesi: number; dettaglio: string; attivo: boolean }>();

export function statoLavoro(studioId: string): StatoLavoro | null {
  const l = lavori.get(studioId);
  if (!l) return null;
  const ms = Date.now() - l.da;
  // La percentuale è una stima sul tempo, non una misura: nessuno sa quanto
  // testo scriverà il modello. Si ferma al 97 % finché non ha finito davvero,
  // perché una barra che arriva a 100 e poi aspetta è una bugia.
  const percento = l.fase === 'finito' ? 100
    : l.fase === 'errore' ? 100
    : Math.min(97, Math.round(ms / Math.max(1, l.attesi) * 100));
  return { attivo: l.attivo, fase: l.fase, ms, attesi: l.attesi, percento, caratteri: l.caratteri, pensiero: l.pensiero, dettaglio: l.dettaglio };
}

export async function preparaPianoSale(
  studioId: string,
  opzioni: { forza?: boolean } = {}
): Promise<{ ok: boolean; stato: string }> {
  if (lavori.get(studioId)?.attivo) return { ok: false, stato: 'già in corso' };
  const oggi = new Date();
  const giornoIso = oggi.toISOString().slice(0, 10);
  const giorno = GG[oggi.getDay()];

  const [ultimo] = await query<{ ms: number | null }>(
    `select proposta_ms as ms from piano_sale where studio_id = $1 and proposta_ms is not null order by giorno desc limit 1`, [studioId]);
  const attesi = ultimo?.ms && ultimo.ms > 5000 ? ultimo.ms : ATTESA_PREDEFINITA;
  const l = { da: Date.now(), fase: 'regole' as FaseLavoro, caratteri: 0, pensiero: 0, attesi, dettaglio: 'leggo le regole delle sale', attivo: true };
  lavori.set(studioId, l);
  const finisci = (fase: FaseLavoro, dettaglio: string) => { l.fase = fase; l.dettaglio = dettaglio; l.attivo = false; };

  try {
    let regole;
    let fuori: string[] = [];
    let fuoriPrest: string[] = [];
    try {
      const md = readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8');
      regole = leggiSale(md);
      fuori = fuoriDalPiano(md);
      fuoriPrest = prestazioniFuoriPiano(md);
    } catch {
      finisci('errore', 'la pagina «Medici/Sale» non si legge');
      return { ok: false, stato: 'pagina non leggibile' };
    }
    if (!regole.length) { finisci('errore', 'nessuna regola nella pagina delle sale'); return { ok: false, stato: 'nessuna regola' }; }

    const gia = await query<{ id: string }>('select id from piano_sale where studio_id = $1 and giorno = $2', [studioId, giornoIso]);
    if (gia.length && !opzioni.forza) { finisci('finito', 'il piano di oggi era già pronto'); return { ok: true, stato: 'già fatto' }; }

    const presenti = (await query<{ nome: string }>(
      `select distinct pr.nome from appointments a join providers pr on pr.id = a.provider_id
        where a.studio_id = $1 and a.starts_at::date = $2::date and pr.attivo order by 1`,
      [studioId, giornoIso]
    )).map((r) => r.nome);

    const piano = pianoDelGiorno(regole, presenti, giorno);

    // La prestazione si riconosce dal colore dell'agenda, come in tutto il
    // resto: serve per lasciar fuori quel che non si fa in studio (una
    // risonanza, un intervento in ospedale).
    const app = await query<{ id: string; chi: string | null; start: string; dur: number; prestazione: string | null }>(
      `select a.id, pr.nome as chi, to_char(a.starts_at, 'HH24:MI') as start,
              greatest(5, round(extract(epoch from (coalesce(a.ends_at, a.starts_at + interval '30 min') - a.starts_at)) / 60))::int as dur,
              c.nome as prestazione
         from appointments a
         left join providers pr on pr.id = a.provider_id
         left join prestazioni_catalogo c on c.studio_id = a.studio_id and c.attivo and lower(c.colore) = lower(a.colore)
        where a.studio_id = $1 and a.starts_at::date = $2::date
          and coalesce(a.stato_medionline, '') not in ('annullato', 'scusato')`,
      [studioId, giornoIso]
    );
    // Chi è fuori dal piano non entra nel conto delle sale né nel testo che
    // va al modello: le sue sedute non occupano una stanza dei medici.
    const utili = app.filter((a) => !escluso(a.chi ?? '', fuori) && !(a.prestazione && escluso(a.prestazione, fuoriPrest)));
    const visite = assegnaVisite(piano.righe, utili.map((a) => ({ id: a.id, chi: a.chi ?? '', start: a.start, dur: a.dur })));
    const libere = piano.righe
      .filter((r) => !(visite[r.stanza] ?? []).length)
      .map((r) => ({ stanza: r.stanza, di: r.segmenti.find((x) => x.chi)?.chi ?? '' }));
    const messe = new Set(Object.values(visite).flat().map((v) => v.id));
    const conta = new Map<string, number>();
    for (const a of utili) if (!messe.has(a.id)) {
      const chi = a.chi || 'appuntamenti senza medico in agenda';
      conta.set(chi, (conta.get(chi) ?? 0) + 1);
    }
    const senzaSala = [...conta].map(([chi, n]) => ({ chi, n })).sort((x, y) => y.n - x.n);

    let proposta: string | null = null;
    let propostaDa: string | null = null;
    let ms: number | null = null;

    if (piano.daDecidere.length || senzaSala.length || libere.length) {
      l.fase = 'modello';
      l.dettaglio = `${MODELLO} sta guardando ${piano.righe.length} stanze`;
      const esito = await generaOllamaEsito(
        PROMPT.replace('{testo}', daSistemarePerPrompt(piano, presenti, libere, senzaSala)),
        {
          modello: MODELLO, timeoutMs: 900_000, aPezzi: true,
          onPezzo: ({ caratteri, pensiero }) => { l.caratteri = caratteri; l.pensiero = pensiero; },
        }
      );
      if (esito.ok) {
        // Qwen 3.8 ragiona ad alta voce fra <think>…</think>: si tiene solo
        // quello che viene dopo, altrimenti il piano è illeggibile.
        proposta = esito.testo.includes('</think>') ? esito.testo.split('</think>').pop()!.trim() : esito.testo.trim();
        propostaDa = `${MODELLO} · modello locale`;
        ms = esito.ms;
      } else {
        console.log(`[piano-sale] proposta non riuscita: ${esito.causa}`);
        l.dettaglio = `il modello non ha risposto (${esito.causa})`;
      }
    }

    l.fase = 'salvo';
    await query(
      `insert into piano_sale (studio_id, giorno, righe, da_decidere, proposta, proposta_da, proposta_ms)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (studio_id, giorno) do update set
         righe = excluded.righe, da_decidere = excluded.da_decidere,
         proposta = excluded.proposta, proposta_da = excluded.proposta_da,
         proposta_ms = excluded.proposta_ms, accettata_at = null, accettata_da = null,
         updated_at = now()`,
      [studioId, giornoIso, JSON.stringify(piano.righe), JSON.stringify(piano.daDecidere), proposta, propostaDa, ms]
    );
    const riassunto = `${piano.righe.length} stanze, ${piano.daDecidere.length} da decidere, ${libere.length} vuote, ${senzaSala.reduce((t, x) => t + x.n, 0)} visite senza sala`;
    console.log(`[piano-sale] ${giornoIso} ${giorno}: ${riassunto}, ${presenti.length} in studio${ms ? `, proposta in ${ms} ms` : ''}`);
    finisci('finito', proposta ? `proposta pronta · ${riassunto}` : `piano pronto senza proposta · ${riassunto}`);
    return { ok: true, stato: riassunto };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    console.error(`[piano-sale] fallito: ${messaggio}`);
    finisci('errore', messaggio.slice(0, 200));
    return { ok: false, stato: messaggio };
  }
}
