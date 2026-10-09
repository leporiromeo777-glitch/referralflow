import 'server-only';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { query } from '../db';
import { catenaOccupata } from '../esporta-grezze';
import { configurazioneOllama, generaOllamaEsito } from '../ollama';
import { getFile } from '../storage';
import { leggiPagine } from './pagine';
import { estratti, pagineDaChiedere, type Estratto, type Risposta, type Separatore } from './sezioni';

// Dividi cartella: l'analisi in sottofondo (9.10.2026, [[Piattaforma/Dividi cartella]]).
// Per una cartella completa: (1) si cercano i fogli separatori col codice a barre (imaging/separatori.py:
// ghostscript + Pillow, una decina di secondi); (2) il modello LOCALE (Ollama sul Mac, niente esce) legge
// ogni pagina scritta e dice se comincia un documento, che data porta e che documento è — circa 6 secondi a
// pagina, quindi minuti: per questo gira qui, una cartella alla volta, e la pagina aspetta.
// Come l'OCR, cede il passo alla catena dei referti. L'esito sta in `dividi_analisi`.
// Nei log: id abbreviati, numeri, nome del modello. Mai testo, mai titoli, mai codici.
const PY = process.env.IMAGING_PYTHON ?? path.join(os.homedir(), '.referralflow-imaging', 'bin', 'python');
const STRUMENTO = path.join(process.cwd(), 'imaging', 'separatori.py');
export const MODELLO = process.env.DIVIDI_LLM ?? 'gemma3:12b';      // «spento» = solo separatori e regole
// Cambia quando cambiano le istruzioni al modello o le pagine che gli si danno: le analisi fatte con la versione prima si rifanno da sole.
export const VERSIONE = 2;
const ATTESA_CATENA_MS = Number(process.env.DIVIDI_ATTESA_CATENA_MS ?? 20 * 60_000);

// Le istruzioni stanno in testa e non cambiano: il modello le tiene in memoria da una pagina all'altra.
const ISTRUZIONI = `Stai riordinando una cartella clinica cartacea scansionata, pagina per pagina. Il testo viene da OCR e può contenere errori.

Devi dire se QUESTA PAGINA è la prima pagina di un documento nuovo oppure continua il documento della pagina precedente.

Come si riconosce la FINE di un documento: in fondo alla pagina c'è il nome del medico che firma, spesso dopo i saluti. Finché la pagina precedente non finisce così, questa pagina è quasi sempre il suo seguito, anche se in alto ripete l'intestazione dello studio o dell'ospedale, il nome del paziente o la data.
Come si riconosce l'INIZIO di un documento: in alto c'è un titolo («Referto», «Rapporto», «Lettera di dimissione», il nome di un esame) e di solito un blocco di dati in alto a destra (data, paziente, destinatario); oppure un luogo e una data seguiti da un saluto.
- È NUOVO se la pagina precedente è finita e questa ha un inizio; oppure se cambiano chiaramente l'autore, la data del documento o il tipo di esame.
- CONTINUA se prosegue una frase, un elenco o una tabella; se porta la conclusione, i saluti e la firma; se è «pagina 2»; se è un allegato dello stesso esame con la stessa data. Nel dubbio, continua.

Rispondi solo con un oggetto JSON:
{"nuovo": true o false, "data": "GG.MM.AAAA" oppure null, "titolo": "..."}
- "data": la data in cui il documento è stato scritto o l'esame eseguito, solo se è scritta in questa pagina; mai la data di nascita.
- "titolo": che documento è, in 1-5 parole, come lo scriverebbe una segretaria sul dorso. Una lettera o il rapporto di una visita si chiama «Rapporto», seguito da chi scrive se è chiaro («Rapporto Dr Inventato», «Rapporto Pronto soccorso Ospedale di Prova»); una lettera di dimissione «Dimissione» e l'ospedale; un esame col nome dell'esame («EcoTT», «Holter», «ECG», «Coronarografia», «Laboratorio», «PA 24h»); una ricetta «Ricetta»; note brevi scritte a mano o a punti «Appunti». Conta che cos'è il documento, non gli esami che cita nel testo. Senza il nome del paziente e senza la data.`;
export function domanda(e: Estratto): string {
  const i = e.indizi;
  const impaginazione = [i.chiusaPrima === null ? '' : i.chiusaPrima ? 'la pagina precedente FINISCE col nome del medico o coi saluti' : 'la pagina precedente NON finisce col nome del medico né coi saluti',
    i.titolo ? 'questa pagina ha un titolo in alto' : 'questa pagina non ha un titolo in alto', i.destra ? 'ha un blocco di dati in alto a destra' : 'non ha un blocco di dati in alto a destra'].filter(Boolean).join('; ');
  return `${ISTRUZIONI}\n\nSezione della cartella: «${e.sezione || 'non indicata'}».\nDall'impaginazione: ${impaginazione}.\n\nFINE DELLA PAGINA PRECEDENTE:\n<<<\n${e.prima || '(nessuna: è la prima pagina della sezione)'}\n>>>\n\nQUESTA PAGINA (inizio e fine):\n<<<\n${e.questa}\n>>>`;
}
export function leggiRisposta(testo: string): Risposta | null {
  try {
    const o = JSON.parse(testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1));
    if (typeof o?.nuovo !== 'boolean') return null;
    return { nuovo: o.nuovo, data: typeof o.data === 'string' ? o.data.slice(0, 20) : null, titolo: typeof o.titolo === 'string' ? o.titolo.slice(0, 80) : null };
  } catch { return null; }
}
export async function chiediPagina(e: Estratto, modello = MODELLO): Promise<Risposta | null> {
  const r = await generaOllamaEsito(domanda(e), { json: true, modello, timeoutMs: 180_000 });
  return r.ok ? leggiRisposta(r.testo) : null;
}

// Sul Mac da 24 GB il modello e whisper non devono contendersi la memoria: appena la catena prende un dettato,
// il modello di questa analisi si scarica subito (la catena scarica solo i suoi). Se Ollama non risponde, pazienza.
async function scaricaModello(): Promise<void> {
  if (MODELLO === 'spento') return;
  try { await fetch(`${configurazioneOllama.url}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODELLO, keep_alive: 0 }), signal: AbortSignal.timeout(20_000) }); } catch { /* best effort */ }
}

function separatoriDi(file: string): Promise<{ pagine: number; separatori: Separatore[] } | null> {
  return new Promise((resolve) => {
    execFile(PY, [STRUMENTO, file], { timeout: 20 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (_err, stdout) => {
      try { const j = JSON.parse(String(stdout ?? '')); resolve(Array.isArray(j?.separatori) ? { pagine: Number(j.pagine) || 0, separatori: j.separatori.filter((s: any) => Number.isInteger(s?.pagina) && typeof s?.codice === 'string') } : null); }
      catch { resolve(null); }
    });
  });
}
export type Esito = { v?: number; separatori?: Separatore[]; risposte?: Record<number, Risposta>; modello_ok?: boolean };
export type StatoAnalisi = { stato: 'da_fare' | 'in_corso' | 'fatta' | 'fallita'; fatte: number; pagine: number | null; versione: number; modello: string | null };
export async function analisiDi(docId: string, storageKey: string): Promise<(StatoAnalisi & { esito: Esito }) | null> {
  const [a] = await query<StatoAnalisi & { esito: Esito; storage_key: string }>(`select stato, fatte, pagine, versione, modello, esito, storage_key from dividi_analisi where documento_id = $1`, [docId]);
  // Un'analisi fatta su un altro file (l'OCR lo sostituisce) o con istruzioni vecchie non vale: si rifà.
  return a && a.storage_key === storageKey && ((a.esito?.v ?? 1) === VERSIONE || a.stato !== 'fatta') ? a : null;
}
export async function statoAnalisi(studioId: string, docId: string): Promise<StatoAnalisi | null> {
  const [a] = await query<StatoAnalisi>(
    `select a.stato, a.fatte, a.pagine, a.versione, a.modello from dividi_analisi a join patient_documents d on d.id = a.documento_id and d.storage_key = a.storage_key
      where a.documento_id = $1 and a.studio_id = $2`, [docId, studioId]);
  return a ?? null;
}
// In coda (o di nuovo in coda, se il file è cambiato: l'OCR lo sostituisce). Il giro parte da solo.
export async function mettiInCoda(studioId: string, docId: string, storageKey: string, daCapo = false): Promise<void> {
  await query(
    `insert into dividi_analisi (documento_id, studio_id, storage_key) values ($1, $2, $3)
     on conflict (documento_id) do update set stato = 'da_fare', storage_key = excluded.storage_key, fatte = 0, pagine = null, versione = dividi_analisi.versione + 1, esito = '{}'::jsonb, finito_at = null, creato_at = now()
       where dividi_analisi.storage_key <> excluded.storage_key or $4 or (dividi_analisi.stato = 'fatta' and coalesce((dividi_analisi.esito->>'v')::int, 1) <> $5)`, [docId, studioId, storageKey, daCapo, VERSIONE]);
  void giroAnalisi().catch((e: any) => console.error(`[dividi] giro: ${e?.code ?? e?.name ?? 'errore'}`));
}

async function analizzaUna(docId: string): Promise<'fatta' | 'fallita' | 'rimandata' | 'sparita'> {
  const [d] = await query<{ storage_key: string; esito: Esito; versione: number }>(
    `select a.storage_key, a.esito, a.versione from dividi_analisi a join patient_documents d on d.id = a.documento_id and d.storage_key = a.storage_key where a.documento_id = $1`, [docId]);
  if (!d) { await query(`delete from dividi_analisi where documento_id = $1`, [docId]); return 'sparita'; }
  const t0 = Date.now();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-dividi-an-'));
  const ancoraLei = async () => (await query(`select 1 from dividi_analisi where documento_id = $1 and storage_key = $2 and stato = 'in_corso'`, [docId, d.storage_key])).length > 0;
  try {
    await query(`update dividi_analisi set stato = 'in_corso' where documento_id = $1`, [docId]);
    const dati = (await getFile(d.storage_key)).body;
    const letto = await leggiPagine(dati);
    if (!letto) throw Object.assign(new Error('pdf'), { code: 'pdf' });
    const testi = letto.testi;
    // 1 — i separatori (se già trovati in un giro interrotto, non si rifà).
    const stessa = (d.esito.v ?? 1) === VERSIONE;
    let separatori = d.esito.separatori;
    if (!separatori) {
      const file = path.join(dir, 'ingresso.pdf');
      await fs.writeFile(file, dati, { mode: 0o600 });
      const letti = await separatoriDi(file);
      if (!letti) console.error(`[dividi] analisi ${docId.slice(0, 8)}: il lettore dei codici a barre non ha risposto (imaging/separatori.py): si va avanti senza sezioni`);
      separatori = letti?.separatori ?? [];
      await fs.rm(file, { force: true });
    }
    const risposte: Record<number, Risposta> = stessa ? { ...(d.esito.risposte ?? {}) } : {};
    const daChiedere = MODELLO === 'spento' ? [] : pagineDaChiedere(testi, separatori, letto.forme).filter((n) => !risposte[n]);
    const totale = Object.keys(risposte).length + daChiedere.length;
    const salva = async (stato: 'in_corso' | 'da_fare' | 'fatta', modelloOk: boolean) => query(
      `update dividi_analisi set stato = $2, esito = $3::jsonb, pagine = $4, fatte = $5, versione = versione + 1, modello = $6, ms = $7, finito_at = case when $2 = 'fatta' then now() else null end
        where documento_id = $1 and storage_key = $8`,
      [docId, stato, JSON.stringify({ v: VERSIONE, separatori, risposte, modello_ok: modelloOk } satisfies Esito), totale, Object.keys(risposte).length, MODELLO === 'spento' ? null : MODELLO, Date.now() - t0, d.storage_key]);
    await salva('in_corso', true);
    console.log(`[dividi] analisi ${docId.slice(0, 8)}: ${testi.length} pagine, ${separatori.length} fogli col codice, ${daChiedere.length} pagine per il modello`);
    // 2 — il modello, pagina per pagina. Se si guasta due volte di fila si chiude con quel che c'è: il resto lo fanno le regole.
    let guasti = 0, dalSalvataggio = 0;
    for (const n of daChiedere) {
      const inizioAttesa = Date.now();
      if (await catenaOccupata()) await scaricaModello();
      while (await catenaOccupata()) {
        if (Date.now() - inizioAttesa > ATTESA_CATENA_MS) { await salva('da_fare', true); console.log(`[dividi] analisi ${docId.slice(0, 8)}: rimandata, la catena lavora (${Object.keys(risposte).length} di ${totale})`); return 'rimandata'; }
        await new Promise((r) => setTimeout(r, 15_000));
      }
      const r = await chiediPagina(estratti(testi, separatori, n, undefined, letto.forme));
      if (r) { risposte[n] = r; guasti = 0; } else if (++guasti >= 2) break;
      if (++dalSalvataggio >= 5) { dalSalvataggio = 0; if (!(await ancoraLei())) return 'sparita'; await salva('in_corso', true); }
    }
    await scaricaModello();
    await salva('fatta', guasti < 2);
    console.log(`[dividi] analisi ${docId.slice(0, 8)}: fatta, ${Object.keys(risposte).length} di ${totale} pagine lette dal modello (${MODELLO}), ${Math.round((Date.now() - t0) / 1000)} s`);
    return 'fatta';
  } catch (e: any) {
    await query(`update dividi_analisi set stato = 'fallita', finito_at = now(), versione = versione + 1 where documento_id = $1`, [docId]);
    console.error(`[dividi] analisi ${docId.slice(0, 8)}: non riuscita (${e?.code ?? e?.name ?? 'errore'})`);
    return 'fallita';
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

let inCorso = false;
export async function giroAnalisi(): Promise<{ esito: 'in_corso' | 'fatto'; fatte: number }> {
  if (inCorso) return { esito: 'in_corso', fatte: 0 };
  inCorso = true;
  let fatte = 0;
  try {
    // Un'analisi rimasta «in corso» è di un processo che non c'è più (riavvio): riparte, tenendo le pagine già lette.
    await query(`update dividi_analisi set stato = 'da_fare' where stato = 'in_corso'`);
    // Le cartelle complete caricate da «Dividi cartella» entrano in coda da sole: quando la si apre l'analisi è già avanti.
    await query(
      `insert into dividi_analisi (documento_id, studio_id, storage_key)
       select d.id, d.studio_id, d.storage_key from patient_documents d
        where d.nota = 'cartella completa, da dividere' and d.filename ilike '%.pdf' and d.ocr_stato is distinct from 'da_fare' and d.uploaded_at > now() - interval '14 days'
          and not exists (select 1 from document_access_log l where l.document_id = d.id and l.dettaglio like 'divisione: %')
       on conflict (documento_id) do update set stato = 'da_fare', storage_key = excluded.storage_key, fatte = 0, pagine = null, versione = dividi_analisi.versione + 1, esito = '{}'::jsonb, finito_at = null
         where dividi_analisi.storage_key <> excluded.storage_key or (dividi_analisi.stato = 'fatta' and coalesce((dividi_analisi.esito->>'v')::int, 1) <> $1)`, [VERSIONE]);
    const viste = new Set<string>();
    for (;;) {
      // Prima l'OCR: una scansione ancora da leggere non ha testo da dare al modello.
      const [x] = await query<{ documento_id: string }>(
        `select a.documento_id from dividi_analisi a join patient_documents d on d.id = a.documento_id
          where a.stato = 'da_fare' and d.ocr_stato is distinct from 'da_fare' and not (a.documento_id = any($1::uuid[])) order by a.creato_at limit 1`, [[...viste]]);
      if (!x) break;
      viste.add(x.documento_id);
      if ((await analizzaUna(x.documento_id)) === 'fatta') fatte++;
    }
  } finally { inCorso = false; }
  return { esito: 'fatto', fatte };
}
