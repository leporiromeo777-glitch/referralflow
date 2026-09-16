import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { query } from '@/lib/db';
import { generaOllamaEsito } from '@/lib/ollama';
import { PARAMETRI_DEFAULT, fondiParametri, type Parametri } from './parametri';
import { costruisciGrafo, distanzaSecondi, entraNelPiano, prestazioneDi, salaPreferita, salePossibili, stessaPersona, type Grafo } from './grafo';
import { RIPIANIFICA, TRANSIZIONE_DI_EVENTO, rigidita, ritardoMedico, statoSala, transizioneAmmessa, type Fonte, type StatoPaziente, type TipoEvento } from './stato';
import { stimaDurata, type Fissata, type Osservazione } from './previsione';
import { misura, pianifica, type ApparecchioDisp, type AssistenteDisp, type MedicoDisp, type Piano, type Pianificata, type StanzaDisp, type VisitaDaPianificare } from './riparatore';
import { decidiIngresso, dentroOrizzonte, hm, ritardoDaRipianificare, ritardoResiduo, spostaABlocco } from './orizzonte';
import { avviso, avvisoRitardo, confronta, frase, fraseAssorbito, type Causa } from './spiega';
import { risolviConSolver } from './solver-client';
import { EVENTO_PROMPT, SPIEGA_PROMPT, leggiEvento, verificaEvento } from './interpreta';
import { STRATEGIA_PROMPT, applicaStrategia, leggiStrategia } from './escalation';

// L'orchestratore (16.9.2026, [[Piattaforma/Orchestrazione sale]] §12, §19).
//
// Tiene insieme i pezzi: carica la giornata (agenda, stati, piano corrente,
// grafo, parametri, durate), riceve gli eventi, aggiorna lo stato, decide se
// ripianificare, chiama il solver o il riparatore, scrive il piano nuovo e le
// spiegazioni. Nei log: tipi di evento, conteggi, millisecondi. Mai un nome.

const log = (m: string) => console.log(`[orchestrazione] ${m}`);
const MODELLO_PICCOLO = process.env.PROTOTIPO_LLM || 'gemma3:12b';
const MODELLO_GRANDE = process.env.ORCHESTRAZIONE_LLM_GRANDE || 'qwen3.8:27b';
const ASSISTENTI_GENERICI = Number(process.env.ORCHESTRAZIONE_ASSISTENTI ?? 2);

// ---------- tempo, in minuti dalla mezzanotte, ora di Zurigo ----------
function zurigo(d = new Date()): { giorno: string; minuti: number } {
  const s = d.toLocaleString('sv-SE', { timeZone: 'Europe/Zurich', hour12: false });
  const [g, h] = s.split(' ');
  const [hh, mm] = h.split(':').map(Number);
  return { giorno: g, minuti: hh * 60 + mm };
}
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

// ---------- il grafo, dalle pagine wiki (cache di 5 minuti) ----------
let cacheGrafo: { quando: number; g: Grafo; studio: string } | null = null;
async function grafoDi(studioId: string): Promise<Grafo> {
  if (cacheGrafo && cacheGrafo.studio === studioId && Date.now() - cacheGrafo.quando < 5 * 60_000) return cacheGrafo.g;
  const leggi = (f: string) => { try { return readFileSync(path.join(process.cwd(), 'docs/wiki', f), 'utf-8'); } catch { return ''; } };
  const [distanze, sost] = await Promise.all([
    query<{ da: string; a: string; secondi: number }>('select da, a, secondi from distanze_sale where studio_id = $1', [studioId]),
    query<{ medico: string; sostituto: string; prestazioni: string[] }>('select medico, sostituto, prestazioni from medici_sostituibili where studio_id = $1', [studioId]),
  ]);
  const p = await parametriDi(studioId);
  const g = costruisciGrafo({ mdSale: leggi('Medici/Sale.md'), mdPrestazioni: leggi('Medici/Prestazioni e sale.md'), distanze, distanzaDefault: p.distanza_default_s, sostituibili: sost });
  cacheGrafo = { quando: Date.now(), g, studio: studioId };
  return g;
}
export function svuotaCacheGrafo() { cacheGrafo = null; }

export async function parametriDi(studioId: string): Promise<Parametri> {
  const righe = await query<{ chiave: string; valore: unknown }>('select chiave, valore from orchestrazione_parametri where studio_id = $1', [studioId]);
  const salvati: Record<string, unknown> = {};
  for (const r of righe) salvati[r.chiave] = r.valore;
  return fondiParametri(salvati);
}
export async function salvaParametri(studioId: string, valori: Record<string, unknown>, userId: string | null) {
  for (const [k, v] of Object.entries(valori)) {
    if (!(k in PARAMETRI_DEFAULT)) continue;
    await query(`insert into orchestrazione_parametri (studio_id, chiave, valore, user_id) values ($1,$2,$3::jsonb,$4)
                 on conflict (studio_id, chiave) do update set valore = excluded.valore, user_id = excluded.user_id, at = now()`,
      [studioId, k, JSON.stringify(v), userId]);
  }
  cacheGrafo = null;
}

// ---------- la giornata ----------
type App = { id: string; medico: string; start: number; dur: number; prestazione: string; paziente: string; agenda: string; statoMol: string };
type StatoRiga = { appointment_id: string; stato: StatoPaziente; sala: string | null; arrivo: number | null; chiamato_a: number | null; inizio_reale: number | null; fine_reale: number | null; rigidita: number };
type PianoRiga = { appointment_id: string; sala: string | null; ingresso_previsto: number | null; inizio_stimato: number | null; fine_stimata: number | null; durata_stimata: number; assistente: string | null };
type Comando = { id: string; comando: string; parametri: Record<string, any> };

export type Giornata = {
  studioId: string; giorno: string; adesso: number; giornoSett: string;
  grafo: Grafo; p: Parametri;
  app: App[]; stati: Map<string, StatoRiga>;
  corrente: { id: string; versione: number; motore: string; visite: Map<string, PianoRiga> } | null;
  comunicato: Map<string, PianoRiga> | null;
  comandi: Comando[];
  osservate: Osservazione[]; fissate: Fissata[];
  risorse: { nome: string; tipo: string; posti: number; stato: string; mobile: boolean }[];
  codici: Map<string, string>;   // appointment_id → «P-07» (per i prompt)
};

export async function caricaGiornata(studioId: string, quando = new Date()): Promise<Giornata> {
  const { giorno, minuti } = zurigo(quando);
  const [grafo, p] = await Promise.all([grafoDi(studioId), parametriDi(studioId)]);
  const app = (await query<{ id: string; chi: string | null; start: string; dur: number; prestazione: string | null; paziente: string; agenda: string; stato_medionline: string | null }>(
    `select a.id, pr.nome as chi, to_char(a.starts_at, 'HH24:MI') as start,
            greatest(5, round(extract(epoch from (coalesce(a.ends_at, a.starts_at + interval '30 min') - a.starts_at)) / 60))::int as dur,
            c.nome as prestazione, coalesce(a.paziente_nome, a.titolo, '') as paziente, coalesce(a.luogo, '') as agenda, a.stato_medionline
       from appointments a
       left join providers pr on pr.id = a.provider_id
       left join prestazioni_catalogo c on c.studio_id = a.studio_id and c.attivo and lower(c.colore) = lower(a.colore)
      where a.studio_id = $1 and a.starts_at::date = $2::date
        and coalesce(a.stato_medionline, '') not in ('annullato', 'scusato')
      order by a.starts_at, a.id`, [studioId, giorno]))
    .map((a) => ({ id: a.id, medico: a.chi ?? '', start: minutiDi(a.start), dur: a.dur, prestazione: a.prestazione ?? '', paziente: a.paziente, agenda: a.agenda, statoMol: a.stato_medionline ?? '' }))
    .filter((a) => entraNelPiano(grafo, a));
  // Lo stato di ogni appuntamento di oggi: la riga nasce «atteso».
  if (app.length) {
    await query(`insert into orchestrazione_stato (appointment_id, studio_id, giorno)
                 select x, $1, $2::date from unnest($3::uuid[]) as x on conflict (appointment_id) do nothing`, [studioId, giorno, app.map((a) => a.id)]);
  }
  const [statiRighe, corr, comandi, osservate, fissate, risorse] = await Promise.all([
    query<StatoRiga>('select appointment_id, stato, sala, arrivo, chiamato_a, inizio_reale, fine_reale, rigidita from orchestrazione_stato where studio_id = $1 and giorno = $2::date', [studioId, giorno]),
    query<{ id: string; versione: number; motore: string; comunicata_at: string | null }>('select id, versione, motore, comunicata_at::text from piani_giornata where studio_id = $1 and giorno = $2::date and corrente', [studioId, giorno]),
    query<Comando>(`select id, comando, parametri from orchestrazione_comandi where studio_id = $1 and giorno = $2::date and ritirato_at is null and (valido_a is null or valido_a > now())`, [studioId, giorno]),
    query<Osservazione & { prima_visita: boolean }>(`select prestazione, medico, ora, minuti, prima_visita as "primaVisita" from durate_osservate where studio_id = $1 and giorno > current_date - 120`, [studioId]),
    query<Fissata>('select prestazione, medico, minuti from durate_fissate where studio_id = $1', [studioId]),
    query<{ nome: string; tipo: string; posti: number; stato: string; mobile: boolean }>('select nome, tipo, posti, stato, mobile from studio_risorse where studio_id = $1 and attivo', [studioId]),
  ]);
  const stati = new Map(statiRighe.map((s) => [s.appointment_id, s]));
  let corrente: Giornata['corrente'] = null;
  let comunicato: Giornata['comunicato'] = null;
  if (corr[0]) {
    const righe = await query<PianoRiga>('select appointment_id, sala, ingresso_previsto, inizio_stimato, fine_stimata, durata_stimata, assistente from piano_visite where piano_id = $1', [corr[0].id]);
    corrente = { id: corr[0].id, versione: corr[0].versione, motore: corr[0].motore, visite: new Map(righe.map((r) => [r.appointment_id, r])) };
    const [com] = await query<{ id: string }>('select id from piani_giornata where studio_id = $1 and giorno = $2::date and comunicata_at is not null order by comunicata_at desc limit 1', [studioId, giorno]);
    if (com) {
      const cr = com.id === corr[0].id ? righe : await query<PianoRiga>('select appointment_id, sala, ingresso_previsto, inizio_stimato, fine_stimata, durata_stimata, assistente from piano_visite where piano_id = $1', [com.id]);
      comunicato = new Map(cr.map((r) => [r.appointment_id, r]));
    }
  }
  const codici = new Map(app.map((a, i) => [a.id, `P-${String(i + 1).padStart(2, '0')}`]));
  return { studioId, giorno, adesso: minuti, giornoSett: GIORNI[new Date(giorno + 'T12:00:00').getDay()], grafo, p, app, stati, corrente, comunicato, comandi, osservate, fissate, risorse, codici };
}
const minutiDi = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

// ---------- dalla giornata alla richiesta per il motore ----------
type Richiesta = {
  visite: VisitaDaPianificare[]; stanze: StanzaDisp[]; medici: MedicoDisp[]; assistenti: AssistenteDisp[]; apparecchi: ApparecchioDisp[];
  distanze: Record<string, number>; distanzaDefault: number; distanza: (a: string | null, b: string) => number;
};

function durataStimata(g: Giornata, a: App): number {
  const pr = prestazioneDi(g.grafo, a.prestazione);
  const catalogo = pr ? pr.durata : Math.min(a.dur, 30);
  const comando = g.comandi.find((c) => c.comando === 'visita_breve' && c.parametri.appointment_id === a.id);
  if (comando) return pr?.breve || Math.max(5, Math.round(catalogo / 2));
  return stimaDurata({ prestazione: a.prestazione || 'visita', medico: a.medico, ora: a.start, catalogo, osservate: g.osservate, fissate: g.fissate, conOra: true }).minuti;
}

function costruisciRichiesta(g: Giornata): Richiesta {
  const assistenti: AssistenteDisp[] = [];
  for (let i = 1; i <= ASSISTENTI_GENERICI; i++) assistenti.push({ nome: `Assistente ${i}`, liberoDa: 0 });
  const nomiAss = assistenti.map((a) => a.nome);
  const stanzeBloccate: Record<string, [number, number][]> = {};
  const fermi: Record<string, string> = {};
  for (const c of g.comandi) {
    if ((c.comando === 'blocca_sala' || c.comando === 'sala_fuori_servizio') && c.parametri.sala) (stanzeBloccate[c.parametri.sala] ??= []).push([g.adesso, 24 * 60]);
    if (c.comando === 'medico_resta' && c.parametri.medico && c.parametri.sala) fermi[c.parametri.medico] = c.parametri.sala;
  }
  for (const r of g.risorse) if (r.tipo === 'sala' && r.stato === 'fuori_servizio') (stanzeBloccate[r.nome] ??= []).push([0, 24 * 60]);
  const stanze: StanzaDisp[] = g.grafo.stanze.map((s) => ({
    nome: s.nome, posti: g.risorse.find((r) => r.tipo === 'sala' && r.nome.toLowerCase() === s.nome.toLowerCase())?.posti ?? 1,
    bloccata: stanzeBloccate[s.nome] ?? [], ultima: s.ultima,
  }));
  const apparecchi: ApparecchioDisp[] = g.risorse.filter((r) => r.tipo === 'apparecchio').map((r) => ({ nome: r.nome, mobile: r.mobile, inSala: null, bloccato: r.stato === 'fuori_servizio' ? [[0, 24 * 60]] : [] }));

  const visite: VisitaDaPianificare[] = [];
  const medici = new Map<string, MedicoDisp>();
  for (const a of g.app) {
    const st = g.stati.get(a.id);
    const stato: StatoPaziente = (st?.stato as StatoPaziente) ?? 'atteso';
    const pr = prestazioneDi(g.grafo, a.prestazione);
    const durata = durataStimata(g, a);
    const senzaMedico = !!pr?.senzaMedico || !a.medico;
    const prep = pr?.preparazione?.minuti ?? 0;
    const piano = g.corrente?.visite.get(a.id);
    const com = g.comunicato?.get(a.id);
    const imposta = g.comandi.find((c) => ['blocca_paziente', 'forza'].includes(c.comando) && c.parametri.appointment_id === a.id) ? 3
      : g.comandi.find((c) => c.comando === 'non_spostare' && c.parametri.appointment_id === a.id) ? 2 : 0;
    const rig = rigidita(stato, piano?.inizio_stimato ?? null, g.adesso, g.p, imposta);
    const forza = g.comandi.find((c) => c.comando === 'forza' && c.parametri.appointment_id === a.id);
    const prio = g.comandi.find((c) => c.comando === 'priorita' && c.parametri.appointment_id === a.id);
    const salaDoveSta = st?.sala ?? piano?.sala ?? null;
    let sale = a.prestazione ? salePossibili(g.grafo, a.medico, a.prestazione) : salePossibili(g.grafo, a.medico, '');
    if (!a.prestazione && !sale.length) sale = g.grafo.stanze.map((s) => s.nome);
    visite.push({
      id: a.id, medico: a.medico, prestazione: a.prestazione || 'visita', teorica: a.start, durata, prep, ripristino: pr?.ripristino ?? 0,
      salePossibili: sale, salaPreferita: a.medico ? salaPreferita(g.grafo, a.medico) : null,
      apparecchi: pr?.apparecchi ?? [], assistenti: prep > 0 ? nomiAss : [], senzaMedico,
      arrivo: st?.arrivo ?? null, stato, rigidita: rig,
      salaFissa: forza?.parametri.sala ?? (rig >= 2 ? salaDoveSta : null),
      inizioFisso: forza?.parametri.inizio != null ? Number(forza.parametri.inizio) : (rig >= 3 ? (st?.inizio_reale ?? piano?.inizio_stimato ?? null) : null),
      comunicato: com && com.sala && com.ingresso_previsto != null ? { sala: com.sala, ingresso: com.ingresso_previsto } : null,
      priorita: prio ? Number(prio.parametri.priorita ?? 1) : (a.prestazione.toLowerCase() === 'urgenza' ? 2 : 0),
      etichetta: a.paziente,
    });
    if (a.medico && !medici.has(a.medico)) medici.set(a.medico, { nome: a.medico, liberoDa: g.adesso, inSala: null, ritardo: 0, fermoIn: fermi[a.medico] ?? null });
  }
  // Dove sono i medici adesso e quando si liberano: dallo stato.
  for (const a of g.app) {
    const st = g.stati.get(a.id); const m = a.medico ? medici.get(a.medico) : null;
    if (!st || !m) continue;
    if (st.stato === 'in_visita') {
      const d = durataStimata(g, a);
      m.liberoDa = Math.max(g.adesso, (st.inizio_reale ?? g.adesso) + d);
      m.inSala = st.sala ?? m.inSala;
      m.ritardo = ritardoMedico({ inVisita: true, inizioReale: st.inizio_reale, durataStimata: d, residuo: 0, adesso: g.adesso });
    } else if ((st.stato === 'visita_finita' || st.stato === 'dimesso') && st.fine_reale != null && st.fine_reale >= (m.liberoDa - 1)) {
      m.inSala = st.sala ?? m.inSala;
    }
  }
  for (const c of g.comandi) if (c.comando === 'medico_in_ritardo' && c.parametri.medico && medici.has(c.parametri.medico)) {
    const m = medici.get(c.parametri.medico)!; m.liberoDa = Math.max(m.liberoDa, g.adesso + Number(c.parametri.minuti ?? 0)); m.ritardo += Number(c.parametri.minuti ?? 0);
  }
  return {
    visite, stanze, medici: [...medici.values()], assistenti, apparecchi,
    distanze: g.grafo.distanze, distanzaDefault: g.grafo.distanzaDefault,
    distanza: (a, b) => distanzaSecondi(g.grafo, a, b),
  };
}

// ---------- il piano: solver o riparatore, poi si scrive ----------
type EsitoPiano = { versione: number; motore: string; ms: number; piano: Piano; cambi: ReturnType<typeof confronta>; avvisi: string[]; senzaSala: { id: string; etichetta: string; perche: string }[] };

async function eseguiPiano(g: Giornata, motivo: string, causa: Causa, opz: { orizzonte: boolean; conCuscinetti: boolean; limiteMs: number }): Promise<EsitoPiano> {
  const t0 = Date.now();
  const r = costruisciRichiesta(g);
  // L'orizzonte: dentro si ripianifica, fuori si sposta a blocco (§8.3).
  const precedente: Record<string, Pianificata> = {};
  if (g.corrente) for (const [id, x] of g.corrente.visite) if (x.sala && x.ingresso_previsto != null && x.inizio_stimato != null) {
    precedente[id] = { id, sala: x.sala, ingresso: x.ingresso_previsto, inizio: x.inizio_stimato, fine: x.fine_stimata ?? x.inizio_stimato + x.durata_stimata, assistente: x.assistente, apparecchi: [], attesa: 0, perche: {} };
  }
  const dentro = opz.orizzonte && g.corrente
    ? r.visite.filter((v) => dentroOrizzonte({ inizio: precedente[v.id]?.inizio ?? null, teorica: v.teorica, stato: v.stato }, g.adesso, g.p))
    : r.visite;
  const fuoriIds = new Set(r.visite.filter((v) => !dentro.includes(v)).map((v) => v.id));
  const input = { ...r, visite: dentro, adesso: g.adesso, conCuscinetti: opz.conCuscinetti };
  let piano: Piano | null = null; let motore = 'riparatore';
  const daSolver = await risolviConSolver(input, g.p, { limiteMs: opz.limiteMs });
  if (daSolver) { piano = { ...daSolver, motore: 'riparatore' } as unknown as Piano; motore = 'cp-sat'; }
  else piano = pianifica(input, g.p);
  // Fuori orizzonte: il piano precedente, spostato del ritardo residuo del medico.
  const residuo: Record<string, number> = {};
  for (const m of r.medici) residuo[m.nome] = ritardoResiduo(piano, dentro, m.nome);
  const medicoDi = (id: string) => r.visite.find((v) => v.id === id)?.medico ?? '';
  const fuori = spostaABlocco([...fuoriIds].map((id) => precedente[id]).filter(Boolean), residuo, medicoDi);
  for (const f of fuori) piano.visite[f.id] = f;
  const ms = Date.now() - t0;

  // Si scrive la versione nuova.
  const [{ v }] = await query<{ v: number }>('select coalesce(max(versione), -1) + 1 as v from piani_giornata where studio_id = $1 and giorno = $2::date', [g.studioId, g.giorno]);
  await query('update piani_giornata set corrente = false where studio_id = $1 and giorno = $2::date and corrente', [g.studioId, g.giorno]);
  const [nuovo] = await query<{ id: string }>(
    `insert into piani_giornata (studio_id, giorno, versione, motivo, corrente, costo, motore, ms) values ($1,$2::date,$3,$4,true,$5::jsonb,$6,$7) returning id`,
    [g.studioId, g.giorno, v, motivo, JSON.stringify({ ...piano.termini, totale: piano.costo }), motore, ms]);
  const righe = r.visite.map((vis) => {
    const x = piano!.visite[vis.id];
    return [nuovo.id, vis.id, vis.medico, vis.prestazione, prestazioneDi(g.grafo, vis.prestazione)?.durata ?? vis.durata, vis.durata, vis.teorica,
      x?.ingresso ?? null, x?.inizio ?? null, x?.fine ?? null, x?.sala ?? null, x?.assistente ?? null, vis.prep, vis.ripristino, vis.priorita, vis.rigidita,
      JSON.stringify(x?.perche ?? { senzaSala: piano!.senzaSala.find((s) => s.id === vis.id)?.perche ?? 'non pianificata' })];
  });
  for (const riga of righe) {
    await query(`insert into piano_visite (piano_id, appointment_id, medico, prestazione, durata_prevista, durata_stimata, ora_teorica, ingresso_previsto, inizio_stimato, fine_stimata, sala, assistente, preparazione_min, ripristino_min, priorita, rigidita, perche)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`, riga);
  }
  // Le spiegazioni: il diff contro il piano corrente di prima.
  const etichetta = (id: string) => g.app.find((a) => a.id === id)?.paziente || g.codici.get(id) || id;
  const cambi = g.corrente ? confronta(precedente, piano.visite, etichetta, g.p) : [];
  const avvisi: string[] = [];
  let comunica = !g.corrente;
  for (const c of cambi) {
    if (c.livello === 'silenzio') continue;
    comunica = true;
    avvisi.push(avviso(c));
    await query(`insert into orchestrazione_spiegazioni (studio_id, giorno, piano_id, appointment_id, livello, perche, testo) values ($1,$2::date,$3,$4,$5,$6::jsonb,$7)`,
      [g.studioId, g.giorno, nuovo.id, c.id, c.livello, JSON.stringify({ causa, cambio: { tipo: c.tipo, deltaMin: c.deltaMin, salaPrima: c.salaPrima, salaDopo: c.salaDopo } }), frase(c, causa)]);
  }
  if (comunica) await query('update piani_giornata set comunicata_at = now() where id = $1', [nuovo.id]);
  const senzaSala = piano.senzaSala.map((s) => ({ ...s, etichetta: etichetta(s.id) }));
  log(`${motivo}: v${v} ${motore} ${ms} ms, ${Object.keys(piano.visite).length} visite, ${senzaSala.length} senza sala, ${cambi.length} cambi (${avvisi.length} da dire)`);
  return { versione: v, motore, ms, piano, cambi, avvisi, senzaSala };
}

// ---------- il piano del mattino (§4) ----------
export async function pianoDelMattino(studioId: string, opz: { forza?: boolean } = {}) {
  const g = await caricaGiornata(studioId);
  if (!g.app.length) return { ok: true, stato: 'nessun appuntamento oggi' };
  if (g.corrente && !opz.forza) return { ok: true, stato: 'il piano di oggi esiste già', versione: g.corrente.versione };
  const e = await eseguiPiano({ ...g, corrente: null, comunicato: null }, 'mattino', { tipo: 'mattino' }, { orizzonte: false, conCuscinetti: true, limiteMs: g.p.limite_solver_mattino_ms });
  return { ok: true, stato: 'fatto', versione: e.versione, motore: e.motore, ms: e.ms, senzaSala: e.senzaSala.length, visite: Object.keys(e.piano.visite).length };
}

// ---------- gli eventi (§7) ----------
export type EventoIn = { tipo: TipoEvento; appointment_id?: string | null; sala?: string | null; medico?: string | null; minuti?: number | null; testo?: string | null; fonte: string; user_id?: string | null };
const FONTE_STATO: Record<string, Fonte> = { ui: 'persona', tablet: 'persona', stanza: 'persona', cleo: 'persona', dettato: 'dettato', robot: 'robot', derivato: 'sistema', sistema: 'sistema' };

export async function registraEvento(studioId: string, ev: EventoIn) {
  const g = await caricaGiornata(studioId);
  const fonte = FONTE_STATO[ev.fonte] ?? 'persona';
  let appId = ev.appointment_id ?? null;
  // Un «visita finita» dal dettato arriva col medico e senza appuntamento: è
  // la sua visita in corso, o se non c'è, quella pronta da più tempo.
  if (!appId && ev.medico && (ev.tipo === 'visita_finita' || ev.tipo === 'visita_iniziata')) {
    const sue = g.app.filter((a) => stessaPersona(a.medico, ev.medico!));
    const inCorso = sue.find((a) => g.stati.get(a.id)?.stato === 'in_visita');
    const pronta = sue.filter((a) => ['pronto', 'chiamato', 'in_preparazione'].includes(g.stati.get(a.id)?.stato ?? '')).sort((a, b) => a.start - b.start)[0];
    appId = (inCorso ?? (ev.tipo === 'visita_finita' ? null : pronta))?.id ?? null;
    if (!appId && ev.tipo === 'visita_finita') { await scrivi(g, ev, null, 'derivato:nessuna_visita_in_corso'); return { ok: true, ripianificato: false, nota: 'nessuna visita in corso per questo medico' }; }
  }
  const nuovoStato = TRANSIZIONE_DI_EVENTO[ev.tipo];
  if (appId && nuovoStato) {
    const st = g.stati.get(appId);
    if (!st) return { ok: false, errore: 'appuntamento non di oggi' };
    if (!transizioneAmmessa(st.stato, nuovoStato, fonte)) {
      await scrivi(g, { ...ev, tipo: 'anomalia', testo: `${ev.tipo} da ${st.stato}` }, appId, 'anomalia');
      return { ok: false, errore: `da «${st.stato}» non si passa a «${nuovoStato}»${fonte === 'sistema' ? '' : ': lo può fare solo con un altro passaggio'}`, anomalia: true };
    }
    const a = g.app.find((x) => x.id === appId)!;
    const campi: string[] = ['stato = $3', 'updated_at = now()']; const val: any[] = [appId, studioId, nuovoStato];
    const set = (c: string, v: any) => { val.push(v); campi.push(`${c} = $${val.length}`); };
    if (nuovoStato === 'arrivato') set('arrivo', g.adesso);
    if (nuovoStato === 'chiamato') { set('chiamato_a', g.adesso); set('sala', ev.sala ?? g.corrente?.visite.get(appId)?.sala ?? null); }
    if (['in_preparazione', 'pronto'].includes(nuovoStato) && ev.sala) set('sala', ev.sala);
    if (nuovoStato === 'in_visita') { set('inizio_reale', st.inizio_reale ?? g.adesso); if (ev.sala || !st.sala) set('sala', ev.sala ?? g.corrente?.visite.get(appId)?.sala ?? null); }
    if (nuovoStato === 'visita_finita' || (nuovoStato === 'dimesso' && st.fine_reale == null)) {
      set('fine_reale', g.adesso);
      const inizio = st.inizio_reale;
      if (inizio != null && g.adesso > inizio && a.prestazione) {
        await query(`insert into durate_osservate (studio_id, prestazione, medico, giorno, ora, minuti) values ($1,$2,$3,$4::date,$5,$6)`,
          [studioId, a.prestazione, a.medico, g.giorno, inizio, g.adesso - inizio]);
      }
    }
    if (nuovoStato === 'in_attesa' && st.stato === 'chiamato') set('sala', null);
    await query(`update orchestrazione_stato set ${campi.join(', ')} where appointment_id = $1 and studio_id = $2`, val);
  }
  await scrivi(g, ev, appId, ev.fonte);
  // Il ritardo del medico dichiarato a mano vale come comando per la giornata.
  if (ev.tipo === 'medico_in_ritardo' && ev.medico) {
    await query(`insert into orchestrazione_comandi (studio_id, giorno, comando, parametri, user_id) values ($1,$2::date,'medico_in_ritardo',$3::jsonb,$4)`,
      [studioId, g.giorno, JSON.stringify({ medico: ev.medico, minuti: ev.minuti ?? 0 }), ev.user_id ?? null]);
  }
  let ripianificato = false; let esito: EsitoPiano | null = null;
  if (RIPIANIFICA.has(ev.tipo)) {
    const causa = causaDi(ev, g);
    esito = await eseguiPiano(await caricaGiornata(studioId), `evento:${ev.tipo}`, causa, { orizzonte: true, conCuscinetti: false, limiteMs: g.p.limite_solver_ms });
    ripianificato = true;
    void valutaEscalation(studioId, esito);
  }
  return { ok: true, ripianificato, versione: esito?.versione ?? g.corrente?.versione ?? null, avvisi: esito?.avvisi ?? [], stato: nuovoStato ?? null };
}

async function scrivi(g: Giornata, ev: EventoIn, appId: string | null, fonte: string) {
  await query(`insert into orchestrazione_eventi (studio_id, giorno, tipo, appointment_id, sala, medico, minuti, testo, fonte, user_id) values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [g.studioId, g.giorno, ev.tipo, appId, ev.sala ?? null, ev.medico ?? null, ev.minuti ?? null, ev.testo ? String(ev.testo).slice(0, 300) : null, fonte, ev.user_id ?? null]);
}

function causaDi(ev: EventoIn, g: Giornata): Causa {
  const a = ev.appointment_id ? g.app.find((x) => x.id === ev.appointment_id) : null;
  switch (ev.tipo) {
    case 'visita_finita': case 'visita_iniziata': case 'visita_quasi_finita': return { tipo: 'visita_piu_lunga', medico: ev.medico ?? a?.medico ?? '' };
    case 'medico_in_ritardo': return { tipo: 'medico_in_ritardo', medico: ev.medico ?? '', minuti: ev.minuti ?? 0 };
    case 'paziente_in_ritardo': return { tipo: 'paziente_in_ritardo', paziente: a?.paziente };
    case 'paziente_assente': return { tipo: 'paziente_assente', paziente: a?.paziente };
    case 'sala_fuori_servizio': return { tipo: 'sala_fuori_servizio', sala: ev.sala ?? '' };
    case 'urgenza': case 'appuntamento_aggiunto': return { tipo: 'urgenza' };
    default: return { tipo: 'altro' };
  }
}

// ---------- il battito: eventi derivati (§7) ----------
const ultimoRipianificato = new Map<string, number>();   // `${studio}|${medico}` → ritardo a cui si è ripianificato
const ultimoTick = new Map<string, number>();
export async function tick(studioId: string) {
  const ora = Date.now();
  if (ora - (ultimoTick.get(studioId) ?? 0) < 30_000) return;
  ultimoTick.set(studioId, ora);
  const g = await caricaGiornata(studioId);
  if (!g.corrente) return;
  // Chi doveva essere qui e non c'è: candidato al riordino.
  for (const a of g.app) {
    const st = g.stati.get(a.id);
    if (st?.stato === 'atteso' && g.adesso - a.start >= g.p.soglia_accoglienza_min) {
      const gia = await query<{ n: string }>(`select count(*) as n from orchestrazione_eventi where appointment_id = $1 and tipo = 'paziente_in_ritardo'`, [a.id]);
      if (Number(gia[0]?.n ?? 0) === 0) await registraEvento(studioId, { tipo: 'paziente_in_ritardo', appointment_id: a.id, fonte: 'derivato' });
    }
  }
  // Le visite che durano più del previsto: ogni `passo` minuti si ripianifica.
  const r = costruisciRichiesta(g);
  for (const m of r.medici) {
    if (m.ritardo <= 0) continue;
    const k = `${studioId}|${m.nome}`;
    if (ritardoDaRipianificare(m.ritardo, ultimoRipianificato.get(k) ?? 0, g.p)) {
      ultimoRipianificato.set(k, m.ritardo);
      const e = await eseguiPiano(g, 'evento:visita_piu_lunga', { tipo: 'visita_piu_lunga', medico: m.nome, minuti: m.ritardo }, { orizzonte: true, conCuscinetti: false, limiteMs: g.p.limite_solver_ms });
      if (m.ritardo >= g.p.soglia_avviso_min) {
        await query(`insert into orchestrazione_spiegazioni (studio_id, giorno, piano_id, livello, perche, testo) values ($1,$2::date,null,'mappa',$3::jsonb,$4)`,
          [studioId, g.giorno, JSON.stringify({ causa: 'ritardo_medico', medico: m.nome, minuti: m.ritardo }), avvisoRitardo(m.nome, m.ritardo)]);
      }
      void valutaEscalation(studioId, e, m);
    }
    if (m.ritardo === 0) ultimoRipianificato.delete(k);
  }
}

// ---------- lo stato operativo per l'interfaccia (§14) ----------
export async function statoOperativo(studioId: string) {
  await tick(studioId).catch((e) => log(`tick: ${(e as Error).message}`));
  const g = await caricaGiornata(studioId);
  const r = costruisciRichiesta(g);
  const piano = g.corrente;
  const perSala: Record<string, any[]> = {};
  const pazienti = g.app.map((a) => {
    const st = g.stati.get(a.id); const pv = piano?.visite.get(a.id);
    const x = { id: a.id, etichetta: a.paziente, codice: g.codici.get(a.id), medico: a.medico, prestazione: a.prestazione, teorica: a.start, teoricaHm: hm(a.start),
      stato: st?.stato ?? 'atteso', sala: st?.sala ?? pv?.sala ?? null, ingresso: pv?.ingresso_previsto ?? null, inizio: pv?.inizio_stimato ?? null, fine: pv?.fine_stimata ?? null,
      arrivo: st?.arrivo ?? null, inizioReale: st?.inizio_reale ?? null, fineReale: st?.fine_reale ?? null, rigidita: r.visite.find((v) => v.id === a.id)?.rigidita ?? 0 };
    if (x.sala) (perSala[x.sala] ??= []).push(x);
    return x;
  });
  const dentroAdesso = (sala: string) => (perSala[sala] ?? []).filter((x) => ['chiamato', 'in_preparazione', 'pronto', 'in_visita', 'visita_finita'].includes(x.stato));
  const sale = r.stanze.map((s) => {
    const dentro = dentroAdesso(s.nome);
    const prossimi = (perSala[s.nome] ?? []).filter((x) => ['atteso', 'arrivato', 'in_attesa'].includes(x.stato) && x.ingresso != null).sort((a, b) => a.ingresso - b.ingresso);
    const bloccata = s.bloccata.length > 0;
    return {
      nome: s.nome, funzione: g.grafo.stanze.find((x) => x.nome === s.nome)?.funzione ?? '', posti: s.posti,
      stato: statoSala({ bloccata, dentro: dentro.map((d) => ({ stato: d.stato as StatoPaziente })), riservata: prossimi.some((p) => p.ingresso! - g.adesso <= g.p.anticipo_ingresso_min) }),
      dentro: dentro.map((d) => ({ id: d.id, etichetta: d.etichetta, medico: d.medico, stato: d.stato, inizio: d.inizioReale ?? d.inizio })),
      prossimo: prossimi[0] ? { id: prossimi[0].id, etichetta: prossimi[0].etichetta, medico: prossimi[0].medico, ingresso: prossimi[0].ingresso, inizio: prossimi[0].inizio } : null,
      liberaFinoA: prossimi[0]?.ingresso ?? null,
    };
  });
  const medici = r.medici.map((m) => {
    const seq = pazienti.filter((x) => x.medico === m.nome && x.inizio != null && !['dimesso', 'assente', 'annullato'].includes(x.stato)).sort((a, b) => a.inizio! - b.inizio!);
    const inVisita = seq.find((x) => x.stato === 'in_visita');
    const prossime = seq.filter((x) => x.stato !== 'in_visita' && x.stato !== 'visita_finita' && (x.inizio ?? 0) >= g.adesso - 5).slice(0, 3);
    return { nome: m.nome, stato: inVisita ? 'in_visita' : (seq.length ? 'disponibile' : 'assente'), inSala: m.inSala, ritardo: m.ritardo, liberoDa: m.liberoDa,
      adesso: inVisita ? { sala: inVisita.sala, etichetta: inVisita.etichetta, fine: m.liberoDa } : null,
      prossime: prossime.map((x) => ({ id: x.id, sala: x.sala, etichetta: x.etichetta, inizio: x.inizio })) };
  });
  // L'ingresso intelligente (§10): per chi è arrivato e non ancora chiamato.
  const ingressi = pazienti.filter((x) => ['arrivato', 'in_attesa'].includes(x.stato) && x.inizio != null && x.sala).map((x) => {
    const m = r.medici.find((mm) => mm.nome === x.medico);
    const v = r.visite.find((vv) => vv.id === x.id)!;
    const arrivoMedico = Math.max(x.inizio!, m ? m.liberoDa + Math.ceil(r.distanza(m.inSala, x.sala!) / 60) : x.inizio!);
    const stanzaLibera = !dentroAdesso(x.sala!).length;
    const d = decidiIngresso({ arrivoMedico, adesso: g.adesso, prep: v.prep, pazienteArrivato: true, stanzaLibera, assistenteLibero: true }, g.p);
    return { id: x.id, etichetta: x.etichetta, sala: x.sala, medico: x.medico, azione: d.azione, quando: d.quando, quandoHm: hm(d.quando), perche: d.perche };
  });
  const [spieg, proposte, anomalie] = await Promise.all([
    query<{ id: number; livello: string; testo: string; at: string; appointment_id: string | null }>(`select id, livello, testo, at::text, appointment_id from orchestrazione_spiegazioni where studio_id = $1 and giorno = $2::date and livello <> 'silenzio' order by at desc limit 12`, [studioId, g.giorno]),
    query<{ id: string; perche: string; modello: string; created_at: string; strategia: unknown }>(`select id, perche, modello, created_at::text, strategia from orchestrazione_proposte where studio_id = $1 and giorno = $2::date and stato = 'aperta' order by created_at desc`, [studioId, g.giorno]),
    query<{ id: number; testo: string; at: string; appointment_id: string | null }>(`select id, testo, at::text, appointment_id from orchestrazione_eventi where studio_id = $1 and giorno = $2::date and tipo = 'anomalia' order by at desc limit 5`, [studioId, g.giorno]),
  ]);
  return {
    giorno: g.giorno, adesso: g.adesso, adessoHm: hm(g.adesso), versione: piano?.versione ?? null, motore: piano?.motore ?? null,
    sale, medici, pazienti, ingressi, avvisi: spieg, proposte, anomalie,
    senzaSala: piano ? pazienti.filter((x) => !x.sala && !['dimesso', 'assente', 'annullato'].includes(x.stato)).map((x) => ({ id: x.id, etichetta: x.etichetta, medico: x.medico })) : [],
    senzaPrestazione: g.app.filter((a) => !a.prestazione).length,
    comandi: g.comandi, parametri: g.p,
  };
}

// ---------- i comandi delle persone (§11) ----------
const COMANDI = new Set(['blocca_paziente', 'non_spostare', 'blocca_sala', 'sala_fuori_servizio', 'medico_resta', 'priorita', 'forza', 'visita_breve', 'sostituibile', 'medico_in_ritardo']);
export async function registraComando(studioId: string, comando: string, parametri: Record<string, any>, userId: string | null) {
  const g = await caricaGiornata(studioId);
  if (comando === 'ripristina') {
    const versione = Number(parametri.versione);
    const [p] = await query<{ id: string }>('select id from piani_giornata where studio_id = $1 and giorno = $2::date and versione = $3', [studioId, g.giorno, versione]);
    if (!p) return { ok: false, errore: 'versione non trovata' };
    await query('update piani_giornata set corrente = (id = $3) where studio_id = $1 and giorno = $2::date', [studioId, g.giorno, p.id]);
    await scrivi(g, { tipo: 'anomalia', testo: `ripristinata la versione ${versione}`, fonte: 'ui', user_id: userId }, null, 'ui');
    return { ok: true, versione };
  }
  if (comando === 'ignora_proposta') return decidiProposta(studioId, String(parametri.id), 'ignora', userId);
  if (!COMANDI.has(comando)) return { ok: false, errore: 'comando sconosciuto' };
  if (['blocca_sala', 'sala_fuori_servizio', 'medico_resta', 'forza'].includes(comando) && parametri.sala && !g.grafo.stanze.some((s) => s.nome.toLowerCase() === String(parametri.sala).toLowerCase())) {
    return { ok: false, errore: 'stanza sconosciuta' };
  }
  if (['blocca_paziente', 'non_spostare', 'priorita', 'forza', 'visita_breve', 'sostituibile'].includes(comando) && !g.app.some((a) => a.id === parametri.appointment_id)) {
    return { ok: false, errore: 'appuntamento non di oggi' };
  }
  const [c] = await query<{ id: string }>(`insert into orchestrazione_comandi (studio_id, giorno, comando, parametri, user_id) values ($1,$2::date,$3,$4::jsonb,$5) returning id`,
    [studioId, g.giorno, comando, JSON.stringify(parametri), userId]);
  const e = await eseguiPiano(await caricaGiornata(studioId), `comando:${comando}`, { tipo: 'comando' }, { orizzonte: true, conCuscinetti: false, limiteMs: g.p.limite_solver_ms });
  // Un comando che rende impossibile un altro: lo si dice, e si chiede quale togliere.
  const impossibili = e.senzaSala.filter((s) => g.corrente?.visite.get(s.id)?.sala);
  return { ok: true, id: c.id, versione: e.versione, avvisi: e.avvisi, conflitti: impossibili.map((s) => `${s.etichetta}: ${s.perche}`) };
}
export async function ritiraComando(studioId: string, id: string) {
  await query('update orchestrazione_comandi set ritirato_at = now() where studio_id = $1 and id = $2', [studioId, id]);
  const g = await caricaGiornata(studioId);
  const e = await eseguiPiano(g, 'comando:ritirato', { tipo: 'comando' }, { orizzonte: true, conCuscinetti: false, limiteMs: g.p.limite_solver_ms });
  return { ok: true, versione: e.versione };
}

// ---------- un evento scritto in italiano (§10.1) ----------
export async function eventoDaTesto(studioId: string, testo: string, userId: string | null) {
  const g = await caricaGiornata(studioId);
  const pazienti = g.app.map((a) => `${g.codici.get(a.id)} (${a.paziente}, ${hm(a.start)}, ${a.medico || 'senza medico'})`);
  const medici = [...new Set(g.app.map((a) => a.medico).filter(Boolean))];
  const stanze = g.grafo.stanze.map((s) => s.nome);
  const prompt = EVENTO_PROMPT.replace('{pazienti}', pazienti.join('; ') || 'nessuno').replace('{medici}', medici.join(', ')).replace('{stanze}', stanze.join(', ')).replace('{testo}', testo.slice(0, 500));
  const esito = await generaOllamaEsito(prompt, { modello: MODELLO_PICCOLO, timeoutMs: 60_000 });
  if (!esito.ok) return { ok: false, errore: 'Il modello locale non ha risposto.' };
  const letto = leggiEvento(esito.testo);
  if (!letto) return { ok: true, interpretazione: null, nota: 'Non è un evento dello studio.' };
  // Il codice traduce il codice-paziente in appuntamento e verifica tutto.
  const app = letto.paziente ? g.app.find((a) => g.codici.get(a.id) === letto.paziente.toUpperCase().trim() || a.paziente.toLowerCase() === letto.paziente.toLowerCase()) : null;
  const v = verificaEvento({ ...letto, paziente: app ? g.codici.get(app.id)! : letto.paziente }, { pazienti: [...g.codici.values()], medici, stanze });
  log(`evento da testo: ${letto.tipo}${v.ok ? '' : ' con problemi'} (${esito.ms} ms)`);
  return { ok: true, interpretazione: { ...letto, appointment_id: app?.id ?? null, etichetta: app?.paziente ?? null }, problemi: v.problemi, da_confermare: true };
}

// ---------- l'escalation al modello grande (§10.2), asincrona ----------
async function valutaEscalation(studioId: string, e: EsitoPiano, medico?: MedicoDisp) {
  try {
    const g = await caricaGiornata(studioId);
    const oltre = (medico?.ritardo ?? 0) >= g.p.soglia_escalation_min;
    const molti = e.senzaSala.length >= 3;
    if (!oltre && !molti) return;
    const catena = await query<{ n: string }>(`select count(*) as n from referti_audio where studio_id = $1 and stato in ('in_coda', 'elaborazione') and created_at > now() - interval '20 minutes'`, [studioId]);
    if (Number(catena[0]?.n ?? 0) > 0) { log('escalation rimandata: la catena dei referti è al lavoro'); return; }
    const aperte = await query<{ n: string }>(`select count(*) as n from orchestrazione_proposte where studio_id = $1 and giorno = $2::date and stato = 'aperta'`, [studioId, g.giorno]);
    if (Number(aperte[0]?.n ?? 0) > 0) return;
    const r = costruisciRichiesta(g);
    const versioneStato = g.corrente?.versione ?? 0;
    const dentro = r.visite.filter((v) => dentroOrizzonte({ inizio: e.piano.visite[v.id]?.inizio ?? null, teorica: v.teorica, stato: v.stato }, g.adesso, g.p));
    const daSolver = await risolviConSolver({ ...r, visite: dentro, adesso: g.adesso }, g.p, { limiteMs: 5000, quantiPiani: 3 });
    const piani = daSolver ? [daSolver.visite, ...daSolver.alternativi] : [e.piano.visite];
    const stato = [
      `ADESSO: ${hm(g.adesso)}`,
      ...r.medici.map((m) => `MEDICO ${m.nome}: ${m.inSala ? `in ${m.inSala}` : 'libero'}, libero da ${hm(m.liberoDa)}, ritardo ${m.ritardo} min`),
      ...dentro.map((v) => `${g.codici.get(v.id)}: ${v.prestazione} con ${v.medico}, teorica ${hm(v.teorica)}, ${v.stato}${v.rigidita >= 2 ? ' CONGELATO' : ''}, stanze possibili ${v.salePossibili.join('/')}`),
      ...r.stanze.map((s) => `STANZA ${s.nome}${s.bloccata.length ? ' bloccata' : ''}`),
    ].join('\n');
    const testoPiani = piani.map((pl, i) => `PIANO ${i + 1}:\n` + dentro.map((v) => { const x = pl[v.id]; return x ? `  ${g.codici.get(v.id)} → ${x.sala} alle ${hm(x.inizio)}` : `  ${g.codici.get(v.id)} → senza stanza`; }).join('\n')).join('\n');
    const esito = await generaOllamaEsito(STRATEGIA_PROMPT.replace('{stato}', stato).replace('{piani}', testoPiani), { modello: MODELLO_GRANDE, timeoutMs: 600_000, aPezzi: true });
    if (!esito.ok) { log(`escalation: il modello grande non ha risposto (${esito.causa})`); return; }
    const s = leggiStrategia(esito.testo);
    if (!s) { log('escalation: risposta senza forma, scartata'); return; }
    const gDopo = await caricaGiornata(studioId);
    if ((gDopo.corrente?.versione ?? 0) !== versioneStato) { log('escalation: lo stato è cambiato, proposta scartata'); return; }
    const ap = applicaStrategia(s, dentro, r.stanze.map((x) => x.nome));
    const scelto = piani[Math.min(Math.max(s.piano, 1), piani.length) - 1] ?? piani[0];
    // Il solver ricalcola con la strategia: le «attesa» tolgono l'ingresso, le
    // «stanza_alternativa» diventano preferenza.
    const visiteStrat = dentro.map((v) => ap.forzaAttesa.has(v.id) ? { ...v, arrivo: null } : (ap.preferisci['*'] && v.salePossibili.includes(ap.preferisci['*']) ? { ...v, salaPreferita: ap.preferisci['*'] } : v));
    const ricalcolo = (await risolviConSolver({ ...r, visite: visiteStrat, adesso: g.adesso }, g.p, { limiteMs: 5000 })) ?? pianifica({ ...r, visite: visiteStrat, adesso: g.adesso }, g.p);
    if (!Object.keys(ricalcolo.visite).length) { log('escalation: la strategia non è fattibile'); return; }
    await query(`insert into orchestrazione_proposte (studio_id, giorno, versione_stato, strategia, piano, perche, modello) values ($1,$2::date,$3,$4::jsonb,$5::jsonb,$6,$7)`,
      [studioId, g.giorno, versioneStato, JSON.stringify({ ...s, scartate: ap.scartate, pianoScelto: scelto ? 'sì' : 'no' }), JSON.stringify(ricalcolo.visite), s.perche, MODELLO_GRANDE]);
    log(`escalation: proposta scritta (${esito.ms} ms, ${s.mosse.length} mosse, ${ap.scartate.length} scartate)`);
  } catch (err) { log(`escalation: ${(err as Error).message}`); }
}

export async function decidiProposta(studioId: string, id: string, azione: 'accetta' | 'ignora', userId: string | null) {
  const [p] = await query<{ id: string; piano: Record<string, Pianificata>; versione_stato: number; stato: string }>('select id, piano, versione_stato, stato from orchestrazione_proposte where studio_id = $1 and id = $2', [studioId, id]);
  if (!p) return { ok: false, errore: 'proposta non trovata' };
  if (p.stato !== 'aperta') return { ok: false, errore: 'proposta già decisa' };
  if (azione === 'ignora') { await query(`update orchestrazione_proposte set stato = 'ignorata', decisa_da = $3, decisa_at = now() where studio_id = $1 and id = $2`, [studioId, id, userId]); return { ok: true }; }
  const g = await caricaGiornata(studioId);
  if ((g.corrente?.versione ?? 0) !== p.versione_stato) {
    await query(`update orchestrazione_proposte set stato = 'scaduta', decisa_da = $3, decisa_at = now() where studio_id = $1 and id = $2`, [studioId, id, userId]);
    return { ok: false, errore: 'lo stato è cambiato: la proposta è scaduta' };
  }
  // Accettare = i suoi ingressi diventano comandi «forza» per oggi, e si ripianifica attorno.
  for (const [appId, x] of Object.entries(p.piano)) {
    const st = g.stati.get(appId); if (!st || (st.rigidita ?? 0) >= 3) continue;
    await query(`insert into orchestrazione_comandi (studio_id, giorno, comando, parametri, user_id) values ($1,$2::date,'forza',$3::jsonb,$4)`,
      [studioId, g.giorno, JSON.stringify({ appointment_id: appId, sala: x.sala, inizio: x.inizio, da_proposta: id }), userId]);
  }
  await query(`update orchestrazione_proposte set stato = 'accettata', decisa_da = $3, decisa_at = now() where studio_id = $1 and id = $2`, [studioId, id, userId]);
  const e = await eseguiPiano(await caricaGiornata(studioId), 'proposta', { tipo: 'proposta' }, { orizzonte: true, conCuscinetti: false, limiteMs: g.p.limite_solver_ms });
  return { ok: true, versione: e.versione, avvisi: e.avvisi };
}

// La frase lunga, quando le frasi fisse non bastano: dal perché strutturato.
export async function spiegaConModello(fatti: Record<string, unknown>): Promise<string | null> {
  const esito = await generaOllamaEsito(SPIEGA_PROMPT.replace('{fatti}', JSON.stringify(fatti, null, 1)), { modello: MODELLO_PICCOLO, timeoutMs: 60_000 });
  return esito.ok ? esito.testo.trim() : null;
}

export { misura, fraseAssorbito };
