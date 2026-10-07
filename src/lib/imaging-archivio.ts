import 'server-only';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { query } from './db';
import { deleteFile } from './storage';
import { ingestaDicom } from './imaging-ingest';
import { scegliLotto } from './imaging-ordina';
import { dataDicom, filtriDaTesto, modelliNome, sceltiPerPaziente, tutti, uidValido, type EsameArchivio, type StudioArchivio } from './imaging-archivio-regole';

// Gli esami dell'archivio dello studio (6.10.2026, decisione del 5.10: «deve
// lasciare l'archivio a Philips, solo mostrare»).
//
// La piattaforma non archivia: CERCA nell'archivio (C-FIND) gli esami di un
// paziente e, quando qualcuno ne apre uno, se lo fa MANDARE (C-MOVE verso la
// nostra ricezione, `imaging/ricevi-dicom.py`). La copia che arriva è
// temporanea: dopo `GIORNI_COPIA` giorni senza che nessuno la apra, sparisce
// — l'originale è nell'archivio, e lo si richiede quando serve.
//
// Il colloquio DICOM lo fa `imaging/archivio-dicom.py`, in un processo suo.
// Nei log: conteggi, esiti, id abbreviati. Mai nomi, date di nascita o
// identificativi degli esami.

const PY = process.env.IMAGING_PYTHON ?? path.join(os.homedir(), '.referralflow-imaging', 'bin', 'python');
const STRUMENTO = path.join(process.cwd(), 'imaging', 'archivio-dicom.py');
const CACHE = path.join(process.cwd(), 'uploads', 'imaging-cache');
const base = () => process.env.REFERTI_IMAGING_BASE ?? path.join(os.homedir(), 'referti-imaging');

// `chiave`: «principale» per `archivio.conf`, il suffisso per `archivio-<chiave>.conf`.
export type ConfArchivio = { chiave: string; nome: string; host: string; porta: number; ae: string; nostroAe: string; giorni: number };

async function leggiConf(file: string): Promise<Record<string, string>> {
  const v: Record<string, string> = {};
  try {
    for (const riga of (await fs.readFile(path.join(base(), file), 'utf-8')).split('\n')) {
      const r = riga.trim();
      if (!r || r.startsWith('#') || !r.includes('=')) continue;
      const [k, ...resto] = r.split('=');
      v[k.trim().toUpperCase()] = resto.join('=').trim();
    }
  } catch { /* non c'è */ }
  return v;
}

// Gli archivi (6.10.2026: non uno solo — il software Philips dello studio, e
// può aggiungersi quello di un altro centro che lo consente). Il primo è
// `~/referti-imaging/archivio.conf`, gli altri `archivio-<chiave>.conf`; li
// scrive `mac/installa-archivio-dicom.sh`.
export async function confArchivi(): Promise<ConfArchivio[]> {
  let nomi: string[] = [];
  try { nomi = (await fs.readdir(base())).filter((n) => /^archivio(-[a-z0-9]{1,20})?\.conf$/.test(n)).sort((x, y) => Number(y === 'archivio.conf') - Number(x === 'archivio.conf') || x.localeCompare(y)); } catch { return []; }
  const out: ConfArchivio[] = [];
  for (const n of nomi) {
    const v = await leggiConf(n);
    if (!v.HOST || !v.AE) continue;
    out.push({
      chiave: n === 'archivio.conf' ? 'principale' : n.slice('archivio-'.length, -'.conf'.length),
      nome: v.NOME || 'Archivio dello studio', host: v.HOST, porta: Number(v.PORTA || 104), ae: v.AE,
      nostroAe: v.NOSTRO_AE || 'REFERRALFLOW', giorni: Math.max(1, Math.min(90, Number(v.GIORNI_COPIA || 7) || 7)),
    });
  }
  return out;
}
export const confArchivio = async (chiave?: string | null): Promise<ConfArchivio | null> => {
  const tutti = await confArchivi();
  return (chiave ? tutti.find((c) => c.chiave === chiave) : tutti[0]) ?? null;
};

function chiama(c: ConfArchivio, richiesta: Record<string, unknown>, ms: number): Promise<any> {
  return new Promise((risolvi) => {
    const figlio = execFile(PY, [STRUMENTO], { timeout: ms, maxBuffer: 16 * 1024 * 1024 }, (errore, stdout) => {
      try { risolvi(JSON.parse(String(stdout || '{}'))); } catch { risolvi({ errore: errore && (errore as any).killed ? 'tempo_scaduto' : 'lettore_non_disponibile' }); }
    });
    figlio.stdin?.end(JSON.stringify({ host: c.host, porta: c.porta, ae_archivio: c.ae, ae_nostro: c.nostroAe, ...richiesta }));
  });
}

async function trova(c: ConfArchivio, filtri: Record<string, string>, massimo = 200): Promise<{ studi: StudioArchivio[]; troncata: boolean; errore?: string }> {
  const r = await chiama(c, { azione: 'trova', filtri, massimo }, 60_000);
  if (!r?.ok) return { studi: [], troncata: false, errore: String(r?.errore ?? 'ricerca_rifiutata') };
  return { studi: Array.isArray(r.studi) ? r.studi : [], troncata: !!r.troncata };
}

// La nostra ricezione è in ascolto? (senza, l'archivio non saprebbe dove mandare)
export async function ricezioneInAscolto(): Promise<{ accesa: boolean; porta: number; apreAllArchivio: boolean }> {
  const v = await leggiConf('ricezione.conf');
  const archivi = await confArchivi();
  const porta = Number(v.PORTA || 11112);
  const accesa = await new Promise<boolean>((risolvi) => {
    const s = net.connect({ host: '127.0.0.1', port: porta });
    const fine = (ok: boolean) => { s.destroy(); risolvi(ok); };
    s.setTimeout(700, () => fine(false)); s.once('connect', () => fine(true)); s.once('error', () => fine(false));
  });
  const ammessi = (v.CONSENTITI || '').split(/[,;]/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const apreAllArchivio = archivi.length > 0 && archivi.every((c) => ammessi.some((x) => x === `*@${c.host}`.toUpperCase() || x === c.ae.toUpperCase() || x === `${c.ae}@${c.host}`.toUpperCase()));
  return { accesa, porta, apreAllArchivio };
}

export type StatoArchivio = { configurato: boolean; nome?: string; archivi?: { chiave: string; nome: string; risponde?: boolean }[]; risponde?: boolean; ricezione?: boolean; aperta?: boolean; ae?: string; porta?: number; giorni?: number };

// Per la pagina: quali archivi ci sono? E, a richiesta, rispondono (C-ECHO)?
export async function statoArchivio(prova = false): Promise<StatoArchivio> {
  const tutti = await confArchivi();
  if (!tutti.length) return { configurato: false };
  const r = await ricezioneInAscolto();
  const archivi: { chiave: string; nome: string; risponde?: boolean }[] = tutti.map((c) => ({ chiave: c.chiave, nome: c.nome }));
  if (prova) await Promise.all(tutti.map(async (c, i) => { archivi[i].risponde = !!(await chiama(c, { azione: 'eco' }, 20_000))?.ok; }));
  return {
    configurato: true, nome: tutti.map((c) => c.nome).join(' · '), archivi, ricezione: r.accesa, aperta: r.apreAllArchivio, ae: tutti[0].nostroAe, porta: r.porta, giorni: tutti[0].giorni,
    ...(prova ? { risponde: archivi.every((x) => x.risponde) } : {}),
  };
}

export type Trovato = EsameArchivio & { esame_id: string | null; archivio: string; archivio_nome: string };


async function conLocali(studioId: string, esami: EsameArchivio[], da: Map<string, ConfArchivio>): Promise<Trovato[]> {
  if (!esami.length) return [];
  const qui = await query<{ id: string; study_uid: string }>(`select id, study_uid from imaging_esami where studio_id = $1 and study_uid = any($2::text[]) and stato <> 'nascosto'`, [studioId, esami.map((e) => e.study_uid)]);
  const mappa = new Map(qui.map((x) => [x.study_uid, x.id]));
  return esami.map((e) => ({ ...e, esame_id: mappa.get(e.study_uid) ?? null, archivio: da.get(e.study_uid)?.chiave ?? 'principale', archivio_nome: da.get(e.study_uid)?.nome ?? '' }));
}

type Paziente = { cognome: string; nome: string; data_nascita: string | null };

// Gli esami di UN paziente della cartella. Si chiede per data di nascita (i
// nomi sugli apparecchi sono battuti a mano) e per cognome (per gli esami
// senza data di nascita); poi si tengono solo quelli che sono suoi, con le
// regole di `sceltiPerPaziente`.
// Una ricerca su TUTTI gli archivi: ogni risposta ricorda da dove viene (il
// primo archivio che ha un esame vince). Un archivio che non risponde non
// ferma gli altri: lo si dice e basta.
async function suTutti(cerca: (c: ConfArchivio) => Promise<{ studi: StudioArchivio[]; troncata: boolean; errore?: string }>): Promise<{ studi: StudioArchivio[]; da: Map<string, ConfArchivio>; troncata: boolean; errore?: string; muti: string[]; risposte: number }> {
  const tutti = await confArchivi();
  const da = new Map<string, ConfArchivio>();
  if (!tutti.length) return { studi: [], da, troncata: false, errore: 'non_configurato', muti: [], risposte: 0 };
  const studi: StudioArchivio[] = [], muti: string[] = [];
  let troncata = false, errore: string | undefined, risposte = 0;
  for (const c of tutti) {
    const r = await cerca(c);
    if (r.errore) { muti.push(c.nome); errore = errore ?? r.errore; continue; }
    risposte += r.studi.length; troncata = troncata || r.troncata;
    for (const x of r.studi) { if (!da.has(x.StudyInstanceUID)) da.set(x.StudyInstanceUID, c); studi.push(x); }
  }
  return { studi, da, troncata, errore: muti.length === tutti.length ? errore : undefined, muti, risposte };
}

// Gli esami di UN paziente della cartella. Si chiede per data di nascita (i
// nomi sugli apparecchi sono battuti a mano) e per cognome (per gli esami
// senza data di nascita); poi si tengono solo quelli che sono suoi, con le
// regole di `sceltiPerPaziente`.
export async function cercaPerPaziente(studioId: string, patientId: string): Promise<{ esami: Trovato[]; errore?: string; muti?: string[] }> {
  const [p] = await query<Paziente>(`select cognome, nome, data_nascita::text from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!p) return { esami: [], errore: 'paziente' };
  const nascita = dataDicom(p.data_nascita);
  const r = await suTutti(async (c) => {
    const studi: StudioArchivio[] = [];
    if (nascita) {
      const x = await trova(c, { nascita });
      if (x.errore) return x;
      // Troncata = l'archivio non filtra per data di nascita: quelle risposte non servono.
      if (!x.troncata) studi.push(...x.studi);
    }
    for (const nome of modelliNome(p.cognome)) {
      const x = await trova(c, { nome });
      if (x.errore) { if (!studi.length) return x; break; }
      studi.push(...x.studi);
    }
    return { studi, troncata: false };
  });
  if (r.errore) return { esami: [], errore: r.errore };
  const esami = sceltiPerPaziente(r.studi, p);
  console.log(`[archivio] ricerca per paziente: archivi=${r.da.size ? new Set([...r.da.values()].map((c) => c.chiave)).size : 0} risposte=${r.risposte} tenuti=${esami.length} muti=${r.muti.length}`);
  return { esami: await conLocali(studioId, esami, r.da), muti: r.muti };
}

// Ricerca libera dalla pagina Immagini: un cognome o una data di nascita.
export async function cercaLibera(studioId: string, testo: string): Promise<{ esami: Trovato[]; troncata?: boolean; errore?: string; muti?: string[] }> {
  const f = filtriDaTesto(testo);
  if (!f) return { esami: [], errore: 'cosa_cercare' };
  const r = await suTutti(async (c) => {
    const studi: StudioArchivio[] = [];
    let troncata = false;
    for (const nome of f.nome ?? [undefined]) {
      const x = await trova(c, { ...(nome ? { nome } : {}), ...(f.nascita ? { nascita: f.nascita } : {}) }, 100);
      if (x.errore) { if (!studi.length) return x; break; }
      studi.push(...x.studi); troncata = troncata || x.troncata;
    }
    return { studi, troncata };
  });
  if (r.errore) return { esami: [], errore: r.errore };
  const esami = tutti(r.studi).slice(0, 100);
  console.log(`[archivio] ricerca libera: tenuti=${esami.length} troncata=${r.troncata} muti=${r.muti.length}`);
  return { esami: await conLocali(studioId, esami, r.da), troncata: r.troncata, muti: r.muti };
}

// ── lo spool della ricezione → gli esami in piattaforma ─────────────────────
// (era dentro `api/cron/imaging`: ora lo chiamano la rotta, ogni quarto d'ora
// e all'avviso della ricezione, e il recupero dall'archivio appena finisce.)
// Un giro alla volta: due insieme leggerebbero gli stessi file.
const PER_GIRO = 400;
// Un ecocardiogramma sono decine di filmati da decine di megabyte: letti tutti
// insieme sono gigabyte in memoria (7.10.2026). Un lotto si ferma a questo peso
// (un file solo passa sempre, per grande che sia) e il giro continua coi lotti
// successivi finché lo spool non è vuoto.
const PESO_LOTTO = 384 * 1024 * 1024;
const LOTTI_PER_GIRO = 60;
export type EsitoSpool = { file: number; esami: number; nuovi: number; immagini: number; scartati: number; spool?: 'assente' };
let coda: Promise<unknown> = Promise.resolve();
export function svuotaSpool(): Promise<EsitoSpool> {
  const p = coda.then(giro, giro);
  coda = p.catch(() => null);
  return p;
}

async function giro(): Promise<EsitoSpool> {
  const SPOOL = path.join(base(), 'ingresso'), SCARTATI = path.join(base(), 'scartati');
  const tot: EsitoSpool = { file: 0, esami: 0, nuovi: 0, immagini: 0, scartati: 0 };
  const esamiVisti = new Set<string>();
  for (let lotto = 0; lotto < LOTTI_PER_GIRO; lotto++) {
    let nomi: string[] = [];
    try { nomi = (await fs.readdir(SPOOL)).filter((n) => n.endsWith('.dcm')).sort(); } catch { return lotto ? tot : { ...tot, spool: 'assente' }; }
    if (!nomi.length) break;
    const pesati: { nome: string; byte: number }[] = [];
    for (const n of nomi.slice(0, PER_GIRO)) {
      try { pesati.push({ nome: n, byte: (await fs.stat(path.join(SPOOL, n))).size }); } catch { /* sparito mentre guardavamo */ }
    }
    const scelti = scegliLotto(pesati, PER_GIRO, PESO_LOTTO);
    if (!scelti.length) break;
    // Un solo studio, oggi; il giorno che ce ne fossero due, l'apparecchio si
    // dichiara con l'AE Title e la scelta si farà da lì.
    const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
    if (!studio) throw new Error('nessuno studio');
    const file: Buffer[] = [], letti: string[] = [];
    for (const n of scelti) {
      try { file.push(await fs.readFile(path.join(SPOOL, n))); letti.push(n); } catch { /* sparito mentre leggevamo: pazienza */ }
    }
    if (!file.length) break;
    const r = await ingestaDicom(studio.id, file, { origine: 'rete', userId: null });
    // Cancellare solo ciò che è entrato davvero. Se non è entrato niente, i file
    // si mettono da parte: capirà una persona che cosa sono.
    if (r.esami.length) {
      for (const n of letti) { try { await fs.rm(path.join(SPOOL, n), { force: true }); } catch { /* al prossimo giro */ } }
      try { await segnaDallArchivio(studio.id, r.esami); } catch (e: any) { console.error(`[archivio] segno: ${e?.code ?? e?.name ?? 'errore'}`); }
      try { await restaQui(studio.id, r.esami, r.conNuove); } catch (e: any) { console.error(`[imaging] resta: ${e?.code ?? e?.name ?? 'errore'}`); }
    } else {
      await fs.mkdir(SCARTATI, { recursive: true }).catch(() => {});
      for (const n of letti) { try { await fs.rename(path.join(SPOOL, n), path.join(SCARTATI, n)); } catch { /* al prossimo giro */ } }
    }
    console.log(`[imaging] ricezione file=${letti.length} esami=${r.esami.length} nuovi=${r.nuovi} immagini=${r.immagini} scartati=${r.scartati} doppioni=${r.doppioni}`);
    for (const id of r.esami) esamiVisti.add(id);
    tot.file += letti.length; tot.nuovi += r.nuovi; tot.immagini += r.immagini; tot.scartati += r.scartati;
  }
  tot.esami = esamiVisti.size;
  return tot;
}

// Una copia temporanea presa dall'archivio diventa un esame che RESTA quando
// l'apparecchio manda per conto suo immagini di quello stesso esame (7.10.2026:
// l'ecografo spedisce anche al Mac). Non vale se le immagini sono arrivate
// perché qualcuno le ha appena chieste all'archivio: quella è ancora la copia.
async function restaQui(studioId: string, ids: string[], conNuove: string[]): Promise<void> {
  if (!conNuove.length) return;
  await query(
    `update imaging_esami e set origine = 'rete', scade_il = null, updated_at = now()
      where e.studio_id = $1 and e.id = any($2::uuid[]) and e.id = any($3::uuid[]) and e.origine = 'archivio'
        and not exists (select 1 from imaging_richieste r where r.studio_id = e.studio_id and r.study_uid = e.study_uid
                         and r.chiesto_il > now() - interval '1 day')`, [studioId, ids, conNuove]);
}

// Gli esami appena entrati che qualcuno aveva CHIESTO all'archivio: sono copie
// temporanee (solo se la riga è nata per quella richiesta: un esame già qui
// resta com'era), e si agganciano al paziente se la richiesta lo diceva.
async function segnaDallArchivio(studioId: string, ids: string[]): Promise<void> {
  const c = await confArchivio();
  const righe = await query<{ id: string; richiesta: string; patient_id: string | null; abbina: boolean; chiesto_da: string | null; gia: string | null }>(
    `with r as (select distinct on (study_uid) id, study_uid, patient_id, abbina, chiesto_da, chiesto_il from imaging_richieste
                 where studio_id = $1 and chiesto_il > now() - interval '1 day' order by study_uid, chiesto_il desc)
     update imaging_esami e set origine = 'archivio', scade_il = now() + make_interval(days => $3), updated_at = now()
       from r where e.studio_id = $1 and e.id = any($2::uuid[]) and r.study_uid = e.study_uid
        and (e.origine = 'archivio' or (e.origine = 'rete' and e.created_at > r.chiesto_il - interval '1 minute'))
     returning e.id, r.id as richiesta, r.patient_id, r.abbina, r.chiesto_da, e.patient_id as gia`, [studioId, ids, c?.giorni ?? 7]);
  for (const x of righe) {
    if (x.abbina && x.patient_id && !x.gia) {
      await query(`update imaging_esami set patient_id = $2, stato = 'disponibile' where id = $1 and patient_id is null`, [x.id, x.patient_id]);
      await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,$3,'abbinato')`, [studioId, x.id, x.chiesto_da]).catch(() => null);
    }
    await query(`update imaging_richieste set stato = 'arrivato', esame_id = $2, finito_il = coalesce(finito_il, now()) where id = $1`, [x.richiesta, x.id]);
  }
}

// ── chiedere un esame all'archivio ──────────────────────────────────────────
export async function chiediEsame(studioId: string, userId: string, studyUid: string, patientId: string | null, archivio?: string | null): Promise<{ richiesta: string } | { esame_id: string } | { errore: string }> {
  const c = await confArchivio(archivio);
  if (!c) return { errore: 'non_configurato' };
  if (!uidValido(studyUid)) return { errore: 'study_uid' };
  const [qui] = await query<{ id: string }>(`select id from imaging_esami where studio_id = $1 and study_uid = $2 and stato <> 'nascosto'`, [studioId, studyUid]);
  if (qui) { await allunga(qui.id); return { esame_id: qui.id }; }
  const [inCorso] = await query<{ id: string }>(`select id from imaging_richieste where studio_id = $1 and study_uid = $2 and stato = 'in_corso' and chiesto_il > now() - interval '15 minutes' order by chiesto_il desc limit 1`, [studioId, studyUid]);
  if (inCorso) return { richiesta: inCorso.id };
  if (!(await ricezioneInAscolto()).accesa) return { errore: 'ricezione_spenta' };
  // Dalla cartella di un paziente: l'esame si aggancia a lui solo se nome e
  // data di nascita dell'archivio corrispondono — lo ricontrolla il server.
  let abbina = false;
  if (patientId) {
    const [p] = await query<Paziente>(`select cognome, nome, data_nascita::text from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
    if (!p) return { errore: 'paziente' };
    const r = await trova(c, { study_uid: studyUid }, 5);
    if (r.errore) return { errore: r.errore };
    abbina = sceltiPerPaziente(r.studi.filter((s) => s.StudyInstanceUID === studyUid), p)[0]?.certezza === 'sicuro';
  }
  const [r] = await query<{ id: string }>(`insert into imaging_richieste (studio_id, study_uid, patient_id, abbina, chiesto_da) values ($1,$2,$3,$4,$5) returning id`, [studioId, studyUid, patientId, abbina, userId]);
  await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,null,$2,'archivio_richiesta')`, [studioId, userId]).catch(() => null);
  void lavora(c, studioId, r.id, studyUid);
  return { richiesta: r.id };
}

async function lavora(c: ConfArchivio, studioId: string, richiesta: string, studyUid: string): Promise<void> {
  const t0 = Date.now();
  let esito: any = {};
  try {
    esito = await chiama(c, { azione: 'sposta', study_uid: studyUid, destinazione: c.nostroAe }, 16 * 60_000);
    for (let i = 0; i < 12; i++) { if (!(await svuotaSpool()).file) break; }
  } catch (e: any) { esito = { errore: 'inatteso' }; console.error(`[archivio] ${richiesta.slice(0, 8)}: ${e?.code ?? e?.name ?? 'errore'}`); }
  const [e] = await query<{ id: string }>(`select id from imaging_esami where studio_id = $1 and study_uid = $2`, [studioId, studyUid]).catch(() => []);
  if (e) await query(`update imaging_richieste set stato = 'arrivato', esame_id = $2, motivo = $3, finito_il = coalesce(finito_il, now()) where id = $1`, [richiesta, e.id, esito?.ok ? null : String(esito?.errore ?? '') || null]).catch(() => null);
  else await query(`update imaging_richieste set stato = 'fallito', motivo = $2, finito_il = now() where id = $1`, [richiesta, esito?.ok ? 'niente_arrivato' : String(esito?.errore ?? 'archivio_in_errore')]).catch(() => null);
  console.log(`[archivio] richiesta ${richiesta.slice(0, 8)}: ${e ? 'arrivato' : 'fallito'} completate=${esito?.completate ?? 0} fallite=${esito?.fallite ?? 0} ${esito?.errore ? `motivo=${esito.errore} ` : ''}(${Date.now() - t0} ms)`);
}

export async function statoRichiesta(studioId: string, id: string): Promise<{ stato: 'in_corso' | 'arrivato' | 'fallito'; esame_id: string | null; motivo: string | null; in_arrivo: number } | null> {
  const [r] = await query<{ stato: 'in_corso' | 'arrivato' | 'fallito'; esame_id: string | null; motivo: string | null; vecchia: boolean }>(
    `select stato, esame_id, motivo, chiesto_il < now() - interval '20 minutes' as vecchia from imaging_richieste where id = $1 and studio_id = $2`, [id, studioId]);
  if (!r) return null;
  let inArrivo = 0;
  try { inArrivo = (await fs.readdir(path.join(base(), 'ingresso'))).filter((n) => n.endsWith('.dcm')).length; } catch { /* nessuno spool */ }
  if (r.stato === 'in_corso' && r.vecchia) return { stato: 'fallito', esame_id: null, motivo: 'tempo_scaduto', in_arrivo: inArrivo };
  return { stato: r.stato, esame_id: r.esame_id, motivo: r.motivo, in_arrivo: inArrivo };
}

// ── la copia è temporanea ───────────────────────────────────────────────────
// Ogni apertura allunga la vita della copia.
export async function allunga(esameId: string): Promise<void> {
  const c = await confArchivio();
  await query(`update imaging_esami set scade_il = greatest(scade_il, now() + make_interval(days => $2)) where id = $1 and scade_il is not null`, [esameId, c?.giorni ?? 7]).catch(() => null);
}

// Via le copie scadute: righe, file e immagini già disegnate. Mai un esame
// su cui qualcuno ha misurato (la misura è un atto, e ha bisogno del suo file).
export async function scadutiVia(): Promise<number> {
  const scaduti = await query<{ id: string; studio_id: string }>(
    `select e.id, e.studio_id from imaging_esami e where e.origine = 'archivio' and e.scade_il < now()
        and not exists (select 1 from imaging_misure_manuali m where m.esame_id = e.id) limit 50`);
  let tolti = 0;
  for (const e of scaduti) {
    const file = await query<{ storage_key: string }>(`select i.storage_key from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1`, [e.id]);
    const [via] = await query<{ id: string }>(`delete from imaging_esami where id = $1 and origine = 'archivio' and scade_il < now() returning id`, [e.id]);
    if (!via) continue;
    let disegnate: string[] = [];
    try { disegnate = await fs.readdir(CACHE); } catch { /* nessuna cache */ }
    for (const f of file) {
      await deleteFile(f.storage_key).catch(() => null);
      const prefisso = `${f.storage_key.replace(/[^a-z0-9]+/gi, '_')}-`;
      for (const n of disegnate) if (n.startsWith(prefisso)) await fs.rm(path.join(CACHE, n), { force: true }).catch(() => null);
    }
    if (file[0]) await fs.rmdir(path.join(process.cwd(), 'uploads', path.dirname(file[0].storage_key))).catch(() => null);
    await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,null,null,'copia_scaduta')`, [e.studio_id]).catch(() => null);
    tolti++;
  }
  if (tolti) console.log(`[archivio] copie scadute tolte: ${tolti}`);
  return tolti;
}
