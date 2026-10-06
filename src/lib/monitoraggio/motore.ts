import 'server-only';
import { query, transazione } from '../db';
import { normalizza, type Adattatore, type Capacita, type DispositivoAbbinato, type Lotto } from './catalogo';
import { REGOLE_DEMO, conProfilo, decidi, rientrato, valutaParametro, valutaTecnica, type Esito, type MisuraVista, type Regola, type StatoTecnico } from './regole';
import { PAZIENTI_DEMO, creaSimulatore, serialeDi, statoIniziale, type Evento, type StatoPazienteSim, type StatoSim } from './simulatore';

// Il MOTORE del monitoraggio (6.10.2026), lato server. A ogni giro:
//   1. acquisizione — chiede agli adattatori ciò che è arrivato dall'ultimo giro;
//   2. normalizzazione e validazione (catalogo.ts): ciò che non è plausibile si scarta;
//   3. archiviazione — misure (doppioni ignorati) e tracce, stato dei dispositivi;
//   4. regole (regole.ts, deterministiche) — avvisi aperti, ricadute, rientri;
//   5. notifiche — interne registrate; esterne MAI inviate in demo, e lo si scrive.
// Gira dentro il server (src/instrumentation.ts) ogni 5 secondi: non dipende da
// una scheda del browser aperta, né dall'assistente AI. Nei log: conteggi e
// codici, mai valori dei pazienti.
//
// Oggi esiste solo l'ambiente DEMO (simulatore). Un adattatore reale si
// aggiunge a `ADATTATORI`: il resto del giro non cambia.

type Q = <R = any>(text: string, params?: any[]) => Promise<R[]>;
const AMB = 'demo';
const RECUPERO_MAX_MS = 10 * 60_000;     // il server è stato fermo più di così: resta un buco, non lo si inventa
const STORIA_INIZIALE_MS = 60 * 60_000;  // la demo nasce con un'ora di storia

async function simulatoreDi(q: Q, studioId: string): Promise<{ adattatore: Adattatore; stato: StatoSim }> {
  const [c] = await q<{ stato: StatoSim }>(`select stato_simulatore as stato from mon_config where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
  const stato: StatoSim = c?.stato?.avviato_il ? c.stato : statoIniziale(Date.now());
  return { adattatore: creaSimulatore(() => stato), stato };
}

// ── Semina della demo ───────────────────────────────────────────────────────
export async function assicuraDemo(studioId: string): Promise<void> {
  const [c] = await query<{ ok: number }>(`select 1 as ok from mon_config where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
  if (c) return;
  await transazione(async (q) => {
    await q(`select pg_advisory_xact_lock(830600, hashtext($1))`, [studioId]);
    const [gia] = await q(`select 1 as ok from mon_config where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    if (!gia) await semina(q, studioId, new Date());
  });
  await giro(studioId);
}

async function semina(q: Q, studioId: string, ora: Date): Promise<void> {
  await q(`insert into mon_config (studio_id, ambiente, stato_simulatore) values ($1, $2, $3)`, [studioId, AMB, JSON.stringify(statoIniziale(ora.getTime()))]);
  for (const r of REGOLE_DEMO) {
    await q(`insert into mon_regole (studio_id, ambiente, chiave, versione, definizione, attiva, illustrativa) values ($1, $2, $3, 1, $4, true, true)`, [studioId, AMB, r.chiave, JSON.stringify(r)]);
  }
  for (const p of PAZIENTI_DEMO) {
    const [{ id }] = await q<{ id: string }>(
      `insert into mon_pazienti (studio_id, ambiente, codice, nome, medico, programma, iniziato_il, terminato_il)
       values ($1, $2, $3, $4, $5, $6, $7::timestamptz - interval '3 days', case when $6 = 'terminato' then $7::timestamptz - interval '20 hours' end) returning id`,
      [studioId, AMB, p.codice, p.nome, p.medico, p.programma ?? 'attivo', ora]);
    for (const d of p.dispositivi) {
      const [{ id: did }] = await q<{ id: string }>(
        `insert into mon_dispositivi (studio_id, ambiente, adattatore, tipo, modello, seriale, capacita) values ($1, $2, 'simulatore', $3, $4, $5, $6) returning id`,
        [studioId, AMB, d.tipo, d.modello, serialeDi(p.codice, d.chiave), JSON.stringify(d.capacita)]);
      await q(`insert into mon_abbinamenti (ambiente, paziente_id, dispositivo_id, dal, al, verificato, nota) values ($1, $2, $3, $4::timestamptz - interval '3 days', case when $5 = 'terminato' then $4::timestamptz - interval '20 hours' end, true, 'abbinamento della demo')`,
        [AMB, id, did, ora, p.programma ?? 'attivo']);
    }
  }
}

// ── Il giro ─────────────────────────────────────────────────────────────────
export type EsitoGiro = { fatto: boolean; misure: number; scartate: number; tracce: number; aperti: number; rientrati: number; notifiche: number };
const NIENTE: EsitoGiro = { fatto: false, misure: 0, scartate: 0, tracce: 0, aperti: 0, rientrati: 0, notifiche: 0 };

export async function giro(studioId: string, opzioni: { ora?: Date } = {}): Promise<EsitoGiro> {
  return transazione(async (q) => {
    // Un giro alla volta per studio (il timer del server e la rotta cron non si pestano i piedi).
    const [lucchetto] = await q<{ ok: boolean }>(`select pg_try_advisory_xact_lock(830600, hashtext($1)) as ok`, [studioId]);
    if (!lucchetto?.ok) return NIENTE;
    const [conf] = await q<{ attivo: boolean; ultimo_giro: Date | null; misure_ore: number; tracce_min: number }>(
      `select attivo, ultimo_giro, conservazione_misure_ore as misure_ore, conservazione_tracce_min as tracce_min from mon_config where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    if (!conf?.attivo) return NIENTE;
    const a = opzioni.ora ?? new Date();
    const da = new Date(conf.ultimo_giro ? Math.max(conf.ultimo_giro.getTime(), a.getTime() - RECUPERO_MAX_MS) : a.getTime() - STORIA_INIZIALE_MS);
    if (a.getTime() <= da.getTime()) return NIENTE;
    const esito: EsitoGiro = { ...NIENTE, fatto: true };

    // 1. Acquisizione: solo i dispositivi abbinati ORA a un paziente in monitoraggio attivo.
    const dispositivi = await q<DispositivoAbbinato & { adattatore: string }>(
      `select d.id, d.seriale, d.modello, d.tipo, d.capacita, d.adattatore, p.id as paziente_id, p.codice as paziente_codice
         from mon_dispositivi d join mon_abbinamenti ab on ab.dispositivo_id = d.id and ab.al is null
         join mon_pazienti p on p.id = ab.paziente_id
        where d.studio_id = $1 and d.ambiente = $2 and p.programma = 'attivo'`, [studioId, AMB]);
    const { adattatore } = await simulatoreDi(q, studioId);
    let lotto: Lotto = { misure: [], tracce: [], stati: [], errori: [] };
    let errore: string | null = null;
    try { lotto = await adattatore.leggi({ dispositivi: dispositivi.filter((d) => d.adattatore === adattatore.id), da, a }); }
    catch (e: any) { errore = `adattatore ${adattatore.id}: ${e?.code ?? e?.name ?? 'errore'}`; }

    // 2–3. Normalizzazione e archiviazione. L'attribuzione al paziente viene
    // dall'abbinamento del dispositivo, mai da ciò che dichiara il lotto.
    const diChi = new Map(dispositivi.map((d) => [d.id, d]));
    const col = { paz: [] as string[], dis: [] as string[], par: [] as string[], val: [] as (number | null)[], txt: [] as (string | null)[], uni: [] as string[], acq: [] as Date[], ric: [] as Date[], qua: [] as (number | null)[], fon: [] as (string | null)[], rec: [] as boolean[] };
    for (const m of lotto.misure) {
      const d = diChi.get(m.dispositivo);
      if (!d) { esito.scartate++; continue; }
      const n = normalizza(m, d.capacita as Capacita[], AMB, a);
      if ('motivo' in n) { esito.scartate++; continue; }
      col.paz.push(d.paziente_id); col.dis.push(d.id); col.par.push(n.parametro); col.val.push(n.valore); col.txt.push(n.valore_testo); col.uni.push(n.unita);
      col.acq.push(n.acquisita_il); col.ric.push(n.ricevuta_il); col.qua.push(n.qualita); col.fon.push(n.fonte); col.rec.push(n.recuperata);
    }
    if (col.paz.length) {
      const dentro = await q<{ paziente_id: string; ultimo: Date; ricevuta: Date }>(
        `with nuove as (
           insert into mon_misure (ambiente, paziente_id, dispositivo_id, parametro, valore, valore_testo, unita, acquisita_il, ricevuta_il, qualita, provenienza, fonte, recuperata)
           select $1, x.paz, x.dis, x.par, x.val, x.txt, x.uni, x.acq, x.ric, x.qua, 'simulato', x.fon, x.rec
             from unnest($2::uuid[], $3::uuid[], $4::text[], $5::float8[], $6::text[], $7::text[], $8::timestamptz[], $9::timestamptz[], $10::int2[], $11::text[], $12::bool[])
                  as x(paz, dis, par, val, txt, uni, acq, ric, qua, fon, rec)
           on conflict (dispositivo_id, parametro, acquisita_il) do nothing
           returning paziente_id, acquisita_il, ricevuta_il)
         select paziente_id, max(acquisita_il) as ultimo, max(ricevuta_il) as ricevuta, count(*)::int as n from nuove group by 1`,
        [AMB, col.paz, col.dis, col.par, col.val, col.txt, col.uni, col.acq, col.ric, col.qua, col.fon, col.rec]);
      for (const r of dentro as any[]) {
        esito.misure += r.n;
        await q(`update mon_pazienti set ultimo_dato = greatest(coalesce(ultimo_dato, $2), $2), ultima_ricezione = greatest(coalesce(ultima_ricezione, $3), $3) where id = $1`, [r.paziente_id, r.ultimo, r.ricevuta]);
      }
    }
    for (const t of lotto.tracce) {
      const d = diChi.get(t.dispositivo);
      if (!d) continue;
      const fatta = await q(`insert into mon_tracce (ambiente, paziente_id, dispositivo_id, derivazione, hz, mv_per_unita, inizio, n, campioni, qualita, provenienza)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (dispositivo_id, derivazione, inizio) do nothing returning id`,
        [AMB, d.paziente_id, d.id, t.derivazione, t.hz, t.mv_per_unita, t.inizio, t.campioni.length, Buffer.from(t.campioni.buffer, t.campioni.byteOffset, t.campioni.byteLength), t.qualita ?? null, t.provenienza]);
      esito.tracce += fatta.length;
    }
    for (const s of lotto.stati) {
      if (!diChi.has(s.dispositivo)) continue;
      await q(`update mon_dispositivi set connesso = $2, ultimo_contatto = $3, batteria = $4, sensore_applicato = $5, errore = $6 where id = $1`,
        [s.dispositivo, s.connesso, s.ultimo_contatto, s.batteria ?? null, s.sensore_applicato ?? null, errore ?? s.errore ?? null]);
    }
    if (errore) await q(`update mon_dispositivi set errore = $3 where studio_id = $1 and ambiente = $2`, [studioId, AMB, errore]);

    // 4–5. Regole e notifiche.
    await applicaRegole(q, studioId, a.getTime(), esito);

    // Conservazione: ogni dieci minuti si toglie ciò che è più vecchio del configurato.
    if (Math.floor(a.getTime() / 600_000) !== Math.floor(da.getTime() / 600_000)) {
      await q(`delete from mon_misure where ambiente = $1 and acquisita_il < $2::timestamptz - make_interval(hours => $3) and paziente_id in (select id from mon_pazienti where studio_id = $4)`, [AMB, a, conf.misure_ore, studioId]);
      await q(`delete from mon_tracce where ambiente = $1 and inizio < $2::timestamptz - make_interval(mins => $3) and paziente_id in (select id from mon_pazienti where studio_id = $4)`, [AMB, a, conf.tracce_min, studioId]);
    }
    await q(`update mon_config set ultimo_giro = $3, ultimo_errore = $4 where studio_id = $1 and ambiente = $2`, [studioId, AMB, a, errore]);
    return esito;
  });
}

async function applicaRegole(q: Q, studioId: string, ora: number, esito: EsitoGiro): Promise<void> {
  const regole = await q<{ id: string; chiave: string; versione: number; definizione: Regola }>(
    `select distinct on (chiave) id, chiave, versione, definizione from mon_regole where studio_id = $1 and ambiente = $2 and attiva order by chiave, versione desc`, [studioId, AMB]);
  // Solo l'ULTIMA versione di ogni chiave conta, e solo se è attiva.
  const ultime = await q<{ chiave: string; versione: number }>(`select chiave, max(versione) as versione from mon_regole where studio_id = $1 and ambiente = $2 group by 1`, [studioId, AMB]);
  const viva = new Map(ultime.map((u) => [u.chiave, u.versione]));
  const attive = regole.filter((r) => viva.get(r.chiave) === r.versione);
  const pazienti = await q<{ id: string; programma: StatoTecnico['programma']; profilo: any; ultimo_dato: Date | null }>(
    `select id, programma, profilo, ultimo_dato from mon_pazienti where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
  if (!pazienti.length) return;
  const ids = pazienti.map((p) => p.id);
  const righe = await q<{ paziente_id: string; parametro: string; valore: number; quando: Date; ricevuta: Date; qualita: number | null }>(
    `select paziente_id, parametro, valore, acquisita_il as quando, ricevuta_il as ricevuta, qualita from mon_misure
      where ambiente = $1 and paziente_id = any($2::uuid[]) and valore is not null
        and (acquisita_il > $3::timestamptz - interval '20 minutes' or (parametro like 'pa\\_%' and acquisita_il > $3::timestamptz - interval '5 hours'))`, [AMB, ids, new Date(ora)]);
  const misure = new Map<string, MisuraVista[]>();
  for (const r of righe) { const v = misure.get(r.paziente_id) ?? []; v.push({ parametro: r.parametro, valore: r.valore, quando: r.quando.getTime(), ricevuta: r.ricevuta.getTime(), qualita: r.qualita }); misure.set(r.paziente_id, v); }
  const disp = await q<{ paziente_id: string; modello: string; connesso: boolean; ultimo_contatto: Date | null; batteria: number | null; sensore_applicato: boolean | null; errore: string | null; capacita: Capacita[] }>(
    `select ab.paziente_id, d.modello, d.connesso, d.ultimo_contatto, d.batteria, d.sensore_applicato, d.errore, d.capacita
       from mon_dispositivi d join mon_abbinamenti ab on ab.dispositivo_id = d.id and ab.al is null where ab.paziente_id = any($1::uuid[])`, [ids]);
  const aperti = await q<{ id: string; paziente_id: string; regola_chiave: string; stato: 'aperto' | 'in_carico'; rientrato_il: Date | null; ultima_notifica: Date | null; livello: number | null; codice: string }>(
    `select id, paziente_id, regola_chiave, stato, rientrato_il, ultima_notifica, livello, codice from mon_avvisi where studio_id = $1 and ambiente = $2 and stato <> 'chiuso'`, [studioId, AMB]);
  const chiusi = await q<{ paziente_id: string; regola_chiave: string; quando: Date }>(
    `select paziente_id, regola_chiave, max(chiuso_il) as quando from mon_avvisi where studio_id = $1 and ambiente = $2 and stato = 'chiuso' and chiuso_il > $3::timestamptz - interval '2 hours' group by 1, 2`, [studioId, AMB, new Date(ora)]);

  for (const p of pazienti) {
    const mie = misure.get(p.id) ?? [];
    const miei = disp.filter((d) => d.paziente_id === p.id);
    const fresche = mie.filter((m) => m.ricevuta > ora - 120_000);
    const conQ = mie.filter((m) => m.quando > ora - 180_000 && m.qualita != null);
    const tecnico: StatoTecnico = {
      programma: p.programma,
      dispositivi: miei.map((d) => ({ nome: d.modello, connesso: d.connesso, ultimo_contatto: d.ultimo_contatto?.getTime() ?? null, batteria: d.batteria, sensore_applicato: d.sensore_applicato, errore: d.errore, continuo: d.capacita.some((c) => c.modo === 'continuo' && c.parametro !== 'ecg') })),
      ultima_misura: p.ultimo_dato?.getTime() ?? null,
      ritardo_mediano_s: fresche.length ? Math.min(...fresche.map((m) => (m.ricevuta - m.quando) / 1000)) : null,
      qualita_media: conQ.length >= 4 ? conQ.reduce((s, m) => s + (m.qualita as number), 0) / conQ.length : null,
    };
    const esiti = new Map<string, Esito>();
    const def = new Map<string, Regola>();
    for (const r of attive) {
      const regola = conProfilo(r.definizione, p.profilo);
      if (!regola) continue;
      def.set(r.chiave, regola);
      esiti.set(r.chiave, p.programma !== 'attivo' ? { stato: 'falsa' } : regola.categoria === 'tecnico' ? valutaTecnica(regola, tecnico, ora) : valutaParametro(regola, mie, ora));
    }
    for (const r of attive) {
      const regola = def.get(r.chiave); if (!regola) continue;
      let e = esiti.get(r.chiave)!;
      const mio = aperti.find((x) => x.paziente_id === p.id && x.regola_chiave === r.chiave) ?? null;
      // Un avviso di attenzione non si apre se sullo stesso parametro, nello stesso verso, c'è già l'alta priorità.
      if (!mio && regola.categoria === 'parametro' && regola.livello === 1 && e.stato === 'vera') {
        const sopra = attive.some((x) => { const d = def.get(x.chiave); return d && d.livello === 2 && d.parametro === regola.parametro && d.verso === regola.verso && (esiti.get(x.chiave)?.stato === 'vera' || aperti.some((y) => y.paziente_id === p.id && y.regola_chiave === x.chiave)); });
        if (sopra) e = { stato: 'falsa' };
      }
      const chiuso = chiusi.find((x) => x.paziente_id === p.id && x.regola_chiave === r.chiave)?.quando.getTime() ?? null;
      const cosa = decidi(regola, e, mio ? { stato: mio.stato, rientrato_il: mio.rientrato_il?.getTime() ?? null, ultima_notifica: mio.ultima_notifica?.getTime() ?? null } : null,
        regola.categoria === 'parametro' && p.programma === 'attivo' ? rientrato(regola, mie, ora) : false, chiuso, ora);
      if (cosa === 'niente') continue;
      const adesso = new Date(ora);
      if (cosa === 'apri' && e.stato === 'vera') {
        const [nuovo] = await q<{ id: string }>(
          `insert into mon_avvisi (studio_id, ambiente, paziente_id, categoria, livello, codice, regola_id, regola_chiave, regola_versione, spiegazione, valori, segmento_da, segmento_a, misurato_il, ricevuto_il, generato_il, ultima_notifica)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) on conflict do nothing returning id`,
          [studioId, AMB, p.id, regola.categoria, regola.categoria === 'parametro' ? regola.livello : null, regola.parametro ?? regola.problema, r.id, r.chiave, r.versione,
           `${e.spiegazione} ${regola.illustrativa ? 'Regola illustrativa' : 'Regola'} «${regola.nome}», versione ${r.versione}.`, JSON.stringify(e.valori), new Date(e.da), new Date(e.a), new Date(e.misurato), new Date(e.ricevuto), adesso]);
        if (!nuovo) continue;
        esito.aperti++;
        await q(`insert into mon_azioni (avviso_id, quando, azione, motivazione) values ($1, $2, 'sistema:generato', $3)`, [nuovo.id, adesso, `regola ${r.chiave} v${r.versione}`]);
        esito.notifiche += await notifica(q, nuovo.id, adesso);
      } else if (mio && cosa === 'rientro') {
        await q(`update mon_avvisi set rientrato_il = $2 where id = $1`, [mio.id, adesso]);
        await q(`insert into mon_azioni (avviso_id, quando, azione, motivazione) values ($1, $2, 'sistema:rientrato', $3)`, [mio.id, adesso, regola.categoria === 'tecnico' ? 'il problema tecnico non c\'è più' : 'il parametro è tornato entro la soglia di rientro']);
        esito.rientrati++;
      } else if (mio && cosa === 'ricaduta' && e.stato === 'vera') {
        await q(`update mon_avvisi set rientrato_il = null, episodi = episodi + 1, valori = $2, segmento_a = $3, misurato_il = $4, ricevuto_il = $5, ultima_notifica = $6 where id = $1`,
          [mio.id, JSON.stringify(e.valori), new Date(e.a), new Date(e.misurato), new Date(e.ricevuto), adesso]);
        await q(`insert into mon_azioni (avviso_id, quando, azione, motivazione) values ($1, $2, 'sistema:ricaduta', 'l''anomalia è tornata prima della chiusura dell''avviso')`, [mio.id, adesso]);
        esito.notifiche += await notifica(q, mio.id, adesso);
      } else if (mio && cosa === 'ripeti_notifica') {
        await q(`update mon_avvisi set ultima_notifica = $2, segmento_a = $2 where id = $1`, [mio.id, adesso]);
        esito.notifiche += await notifica(q, mio.id, adesso);
      }
    }
  }
}

// Notifiche: quella interna è l'avviso stesso che compare a chi ha la pagina
// aperta (e si registra come consegnata alla piattaforma); quella esterna
// (messaggio, chiamata, escalation) in demo NON parte, e resta scritto.
async function notifica(q: Q, avvisoId: string, quando: Date): Promise<number> {
  await q(`insert into mon_notifiche (avviso_id, ambiente, canale, stato, motivo, quando) values ($1, $2, 'interna', 'consegnata', null, $3), ($1, $2, 'esterna', 'non_inviata_demo', 'In demo non si inviano messaggi, chiamate o comunicazioni ai pazienti.', $3)`, [avvisoId, AMB, quando]);
  return 1;
}

// ── Il timer del server ─────────────────────────────────────────────────────
export async function giroTutti(): Promise<number> {
  let studi: { studio_id: string }[] = [];
  try { studi = await query(`select studio_id from mon_config where ambiente = $1 and attivo`, [AMB]); } catch { return 0; }
  let n = 0;
  for (const s of studi) {
    try { if ((await giro(s.studio_id)).fatto) n++; }
    catch (e: any) { console.error(`[monitoraggio] giro fallito: ${e?.code ?? e?.name ?? 'errore'}`); }
  }
  return n;
}
export function avviaMotore(): void {
  const g = globalThis as any;
  if (g.__rfMonitoraggio) return;
  let inCorso = false;
  g.__rfMonitoraggio = setInterval(() => {
    if (inCorso) return;
    inCorso = true;
    void giroTutti().finally(() => { inCorso = false; });
  }, 5000);
  if (typeof g.__rfMonitoraggio.unref === 'function') g.__rfMonitoraggio.unref();
  console.log('[monitoraggio] motore avviato (un giro ogni 5 secondi)');
}

// ── Il simulatore, dalla pagina ─────────────────────────────────────────────
export type AzioneSim = 'evento' | 'normalizza' | 'interrompi' | 'riconnetti' | 'degrada' | 'segnale_buono' | 'batteria_bassa' | 'batteria_carica' | 'stacca_sensore' | 'riapplica_sensore' | 'ritarda' | 'senza_ritardo';

async function registra(q: Q, studioId: string, autore: string | null, azione: string, oggetto: string | null, dettaglio: Record<string, unknown> = {}) {
  await q(`insert into mon_registro (studio_id, ambiente, autore, azione, oggetto, dettaglio) values ($1,$2,$3,$4,$5,$6)`, [studioId, AMB, autore, azione, oggetto, JSON.stringify(dettaglio)]);
}
export const registraMon = (studioId: string, autore: string | null, azione: string, oggetto: string | null, dettaglio: Record<string, unknown> = {}) => registra(query as Q, studioId, autore, azione, oggetto, dettaglio);

export async function scenario(studioId: string, pazienteId: string, azione: AzioneSim, tipo: string | null, autore: string | null, ora = new Date()): Promise<{ ok: true } | { errore: string }> {
  return transazione(async (q) => {
    const [p] = await q<{ codice: string }>(`select codice from mon_pazienti where id = $1 and studio_id = $2 and ambiente = $3`, [pazienteId, studioId, AMB]);
    if (!p) return { errore: 'Paziente della demo non trovato.' };
    const [c] = await q<{ stato: StatoSim }>(`select stato_simulatore as stato from mon_config where studio_id = $1 and ambiente = $2 for update`, [studioId, AMB]);
    if (!c) return { errore: 'La demo non è avviata.' };
    const s: StatoPazienteSim = { ...(c.stato.pazienti?.[p.codice] ?? {}) };
    const t = ora.getTime();
    switch (azione) {
      case 'evento': {
        const ammessi: Evento[] = ['tachicardia_riposo', 'tachicardia', 'bradicardia', 'desaturazione', 'febbre', 'ipertensione', 'ritmo_irregolare'];
        if (!ammessi.includes(tipo as Evento)) return { errore: 'Scenario sconosciuto.' };
        s.evento = { tipo: tipo as Evento, dal: t }; break;
      }
      case 'normalizza': s.evento = null; break;
      case 'interrompi': s.connessione = { interrotta_dal: t, ripresa_il: null }; break;
      case 'riconnetti': if (s.connessione && s.connessione.ripresa_il == null) s.connessione = { ...s.connessione, ripresa_il: t }; break;
      case 'degrada': s.segnale = { scarso_dal: t }; break;
      case 'segnale_buono': s.segnale = null; break;
      case 'batteria_bassa': s.batteria = { livello: 11, dal: t }; break;
      case 'batteria_carica': s.batteria = { livello: 96, dal: t }; break;
      case 'stacca_sensore': s.sensore = { staccato_dal: t }; break;
      case 'riapplica_sensore': s.sensore = null; break;
      case 'ritarda': s.ritardo_s = 300; break;
      case 'senza_ritardo': s.ritardo_s = null; break;
      default: return { errore: 'Azione sconosciuta.' };
    }
    const nuovo: StatoSim = { ...c.stato, pazienti: { ...(c.stato.pazienti ?? {}), [p.codice]: s } };
    await q(`update mon_config set stato_simulatore = $3 where studio_id = $1 and ambiente = $2`, [studioId, AMB, JSON.stringify(nuovo)]);
    await registra(q, studioId, autore, `simulatore:${azione}`, p.codice, tipo ? { tipo } : {});
    return { ok: true as const };
  });
}

// «Ripristina lo stato iniziale»: via tutti i dati DEMO di questo studio (solo
// quelli: ogni cancellazione è filtrata sull'ambiente) e semina da capo.
export async function ripristinaDemo(studioId: string, autore: string | null): Promise<void> {
  await transazione(async (q) => {
    await q(`select pg_advisory_xact_lock(830600, hashtext($1))`, [studioId]);
    await q(`delete from mon_avvisi where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    await q(`delete from mon_pazienti where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    await q(`delete from mon_dispositivi where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    await q(`delete from mon_regole where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    await q(`delete from mon_config where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
    await semina(q, studioId, new Date());
    await registra(q, studioId, autore, 'simulatore:ripristino', null);
  });
  await giro(studioId);
}

// Spegnere la demo: niente più giri né dati nuovi (quelli vecchi scadono da soli).
export async function accendiDemo(studioId: string, attivo: boolean, autore: string | null): Promise<void> {
  await query(`update mon_config set attivo = $3 where studio_id = $1 and ambiente = $2`, [studioId, AMB, attivo]);
  await registraMon(studioId, autore, attivo ? 'demo:accesa' : 'demo:spenta', null);
}
