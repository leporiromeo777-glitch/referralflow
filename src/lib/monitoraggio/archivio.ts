import 'server-only';
import { query, transazione } from '../db';
import { PARAMETRI, parametro, puoMon, vistaTecnica, type Capacita } from './catalogo';
import { conProfilo, controllaRegola, statoConnessione, statoPaziente, type Regola } from './regole';
import { registraMon } from './motore';

// Leggere e agire sul monitoraggio (6.10.2026): ciò che le rotte servono
// all'interfaccia. Tutto filtrato per studio E per ambiente: oggi solo «demo».
// Chi tiene in piedi i dispositivi (vista tecnica) riceve lo stato tecnico
// ma non i valori dei pazienti.
const AMB = 'demo';
const ORDINE = ['fc', 'spo2', 'fr', 'temp_cutanea', 'temp_corporea', 'pa_sistolica', 'pa_diastolica', 'attivita', 'postura', 'ritmo'];
const IN_RIGA = ['fc', 'spo2', 'fr', 'temp_cutanea', 'pa_sistolica'];

type RigaPaz = { id: string; codice: string; nome: string | null; medico: string | null; programma: string; iniziato_il: Date; terminato_il: Date | null; ultimo_dato: Date | null; ultima_ricezione: Date | null; profilo: any; patient_id: string | null };
type RigaDisp = { id: string; paziente_id: string; tipo: string; modello: string; seriale: string; capacita: Capacita[]; connesso: boolean; ultimo_contatto: Date | null; batteria: number | null; sensore_applicato: boolean | null; errore: string | null; adattatore: string; dal: Date };

async function regoleVive(studioId: string): Promise<{ id: string; chiave: string; versione: number; definizione: Regola; attiva: boolean; illustrativa: boolean; creata_il: Date; chi: string | null }[]> {
  return query(
    `select distinct on (r.chiave) r.id, r.chiave, r.versione, r.definizione, r.attiva, r.illustrativa, r.creata_il, split_part(u.email, '@', 1) as chi
       from mon_regole r left join users u on u.id = r.creata_da where r.studio_id = $1 and r.ambiente = $2 order by r.chiave, r.versione desc`, [studioId, AMB]);
}

async function attuali(pazienti: RigaPaz[], disp: RigaDisp[], ora: number) {
  const paz: string[] = [], par: string[] = [];
  const cap = new Map<string, Capacita & { dispositivo: string }>();
  for (const d of disp) for (const c of d.capacita) {
    if (c.parametro === 'ecg') continue;
    const k = `${d.paziente_id}|${c.parametro}`;
    // Se due dispositivi misurano lo stesso parametro, conta il più fitto.
    if (!cap.has(k) || cap.get(k)!.intervallo_s > c.intervallo_s) cap.set(k, { ...c, dispositivo: d.modello });
    if (!paz.some((p, i) => p === d.paziente_id && par[i] === c.parametro)) { paz.push(d.paziente_id); par.push(c.parametro); }
  }
  const righe = paz.length ? await query<{ paziente_id: string; parametro: string; valore: number | null; valore_testo: string | null; unita: string; acquisita_il: Date | null; ricevuta_il: Date | null; qualita: number | null; fonte: string | null; recuperata: boolean | null; modello: string | null }>(
    `select x.paziente_id, x.parametro, m.valore, m.valore_testo, m.unita, m.acquisita_il, m.ricevuta_il, m.qualita, m.fonte, m.recuperata, d.modello
       from unnest($1::uuid[], $2::text[]) as x(paziente_id, parametro)
       left join lateral (select * from mon_misure mm where mm.paziente_id = x.paziente_id and mm.parametro = x.parametro order by mm.acquisita_il desc limit 1) m on true
       left join mon_dispositivi d on d.id = m.dispositivo_id`, [paz, par]) : [];
  const out = new Map<string, any[]>();
  for (const p of pazienti) out.set(p.id, []);
  for (const r of righe) {
    const c = cap.get(`${r.paziente_id}|${r.parametro}`)!;
    const def = parametro(r.parametro, r.unita);
    const eta = r.acquisita_il ? Math.round((ora - r.acquisita_il.getTime()) / 1000) : null;
    out.get(r.paziente_id)?.push({
      codice: r.parametro, nome: def.nome, breve: def.breve, unita: def.unita || r.unita, decimali: def.decimali, tipo: def.tipo, nota: def.nota ?? null,
      valore: r.valore, testo: r.valore_testo, quando: r.acquisita_il, ricevuta: r.ricevuta_il, eta_s: eta, qualita: r.qualita,
      // Non aggiornato: l'ultimo valore è più vecchio di quanto il dispositivo dovrebbe mandare.
      vecchio: eta == null || eta > Math.max(120, c.intervallo_s * 3), modo: c.modo, intervallo_s: c.intervallo_s, invio_s: c.invio_s,
      fonte: r.fonte ?? c.metodo ?? null, dispositivo: r.modello ?? c.dispositivo, recuperata: !!r.recuperata, provenienza: 'simulato',
    });
  }
  for (const v of out.values()) v.sort((a, b) => (ORDINE.indexOf(a.codice) + 99) % 99 - (ORDINE.indexOf(b.codice) + 99) % 99);
  return out;
}

const oltre = (r: Regola, v: number) => (r.verso === 'sopra' ? v > (r.soglia as number) : v < (r.soglia as number));

export async function panoramica(studioId: string, ruolo: string, adesso = new Date()) {
  const ora = adesso.getTime();
  const tecnica = vistaTecnica(ruolo);
  const [conf] = await query<{ attivo: boolean; ultimo_giro: Date | null; ultimo_errore: string | null; misure_ore: number; tracce_min: number }>(
    `select attivo, ultimo_giro, ultimo_errore, conservazione_misure_ore as misure_ore, conservazione_tracce_min as tracce_min from mon_config where studio_id = $1 and ambiente = $2`, [studioId, AMB]);
  const pazienti = await query<RigaPaz>(`select id, codice, nome, medico, programma, iniziato_il, terminato_il, ultimo_dato, ultima_ricezione, profilo, patient_id from mon_pazienti where studio_id = $1 and ambiente = $2 order by codice`, [studioId, AMB]);
  const ids = pazienti.map((p) => p.id);
  const disp = await query<RigaDisp>(
    `select d.id, ab.paziente_id, d.tipo, d.modello, d.seriale, d.capacita, d.connesso, d.ultimo_contatto, d.batteria, d.sensore_applicato, d.errore, d.adattatore, ab.dal
       from mon_dispositivi d join mon_abbinamenti ab on ab.dispositivo_id = d.id and ab.al is null where ab.paziente_id = any($1::uuid[]) order by d.modello`, [ids]);
  const valori = await attuali(pazienti, disp, ora);
  const serie = tecnica ? [] : await query<{ paziente_id: string; parametro: string; t: Date; v: number }>(
    `select paziente_id, parametro, date_bin('1 minute', acquisita_il, '2000-01-01') as t, avg(valore) as v from mon_misure
      where ambiente = $1 and paziente_id = any($2::uuid[]) and parametro = any($3::text[]) and valore is not null and acquisita_il > $4::timestamptz - interval '30 minutes' and acquisita_il <= $4
      group by 1, 2, 3 order by 3`, [AMB, ids, ['fc', 'spo2', 'fr'], adesso]);
  const qual = await query<{ paziente_id: string; q: number }>(
    `select paziente_id, avg(qualita)::float as q from mon_misure where ambiente = $1 and paziente_id = any($2::uuid[]) and qualita is not null and acquisita_il > $3::timestamptz - interval '3 minutes' group by 1`, [AMB, ids, adesso]);
  const avvisi = await query<{ id: string; paziente_id: string; categoria: string; livello: number | null; codice: string; regola_chiave: string; spiegazione: string; stato: string; rientrato_il: Date | null; generato_il: Date; episodi: number; responsabile: string | null }>(
    `select a.id, a.paziente_id, a.categoria, a.livello, a.codice, a.regola_chiave, a.spiegazione, a.stato, a.rientrato_il, a.generato_il, a.episodi, split_part(u.email, '@', 1) as responsabile
       from mon_avvisi a left join users u on u.id = a.responsabile where a.studio_id = $1 and a.ambiente = $2 and a.stato <> 'chiuso' order by a.generato_il`, [studioId, AMB]);
  const silenzi = await query<{ paziente_id: string; fino_a: Date }>(`select paziente_id, max(fino_a) as fino_a from mon_silenzi where ambiente = $1 and paziente_id = any($2::uuid[]) and fino_a > $3 group by 1`, [AMB, ids, adesso]);
  const regole = (await regoleVive(studioId)).filter((r) => r.attiva);
  const peso = (a: { categoria: string; livello: number | null; stato: string }) => (a.categoria === 'parametro' ? (a.livello === 2 ? 0 : 2) : 4) + (a.stato === 'aperto' ? 0 : 1);

  const righe = pazienti.map((p) => {
    const miei = disp.filter((d) => d.paziente_id === p.id);
    const par = valori.get(p.id) ?? [];
    const cont = miei.flatMap((d) => d.capacita).filter((c) => c.parametro !== 'ecg');
    const continui = cont.filter((c) => c.modo === 'continuo');
    const intervallo = (continui.length ? continui : cont).reduce((m, c) => Math.min(m, c.intervallo_s), 86400);
    const eta = p.ultimo_dato ? Math.round((ora - p.ultimo_dato.getTime()) / 1000) : null;
    const q = qual.find((x) => x.paziente_id === p.id)?.q ?? null;
    const miA = avvisi.filter((a) => a.paziente_id === p.id).sort((a, b) => peso(a) - peso(b));
    const stato = statoPaziente({ programma: p.programma, avvisi: miA.map((a) => ({ categoria: a.categoria, livello: a.livello, rientrato: !!a.rientrato_il })), eta_ultimo_dato_s: eta, qualita_media: q, continuo: continui.length > 0, intervallo_s: intervallo });
    const connessione = statoConnessione({ programma: p.programma, connessi: miei.filter((d) => d.connesso).length, dispositivi: miei.length, eta_ultimo_dato_s: eta, intervallo_s: intervallo });
    // Il valore è oltre la soglia di una regola attiva per questo paziente? Solo un segno visivo: gli avvisi li decide il motore.
    for (const v of par) {
      v.oltre = v.valore != null && regole.some((r) => { const d = conProfilo(r.definizione, p.profilo); return !!d && d.categoria === 'parametro' && d.parametro === v.codice && d.soglia != null && oltre(d, v.valore); });
      if (tecnica) { v.valore = null; v.testo = null; v.oltre = false; }
    }
    const batterie = miei.map((d) => d.batteria).filter((b): b is number => b != null);
    const primo = miA[0];
    const andamenti: Record<string, [number, number][]> = {};
    for (const s of serie) if (s.paziente_id === p.id) (andamenti[s.parametro] ??= []).push([s.t.getTime(), Math.round(s.v * 10) / 10]);
    return {
      id: p.id, codice: p.codice, nome: p.nome, medico: p.medico, programma: p.programma, terminato_il: p.terminato_il, stato, connessione,
      ultimo_dato: p.ultimo_dato, eta_s: eta, latenza_s: p.ultimo_dato && p.ultima_ricezione ? Math.max(0, Math.round((p.ultima_ricezione.getTime() - p.ultimo_dato.getTime()) / 1000)) : null,
      qualita: q == null ? null : Math.round(q), batteria: batterie.length ? Math.min(...batterie) : null, intermittente: continui.length === 0 && cont.length > 0, intervallo_s: intervallo,
      ecg: miei.some((d) => d.capacita.some((c) => c.parametro === 'ecg')),
      dispositivi: miei.map((d) => ({ id: d.id, tipo: d.tipo, modello: d.modello, connesso: d.connesso, batteria: d.batteria, ultimo_contatto: d.ultimo_contatto, sensore_applicato: d.sensore_applicato })),
      parametri: par, in_riga: IN_RIGA, andamenti,
      avvisi: { aperti: miA.length, parametro: miA.filter((a) => a.categoria === 'parametro').length, tecnici: miA.filter((a) => a.categoria === 'tecnico').length,
        prioritario: primo ? { id: primo.id, categoria: primo.categoria, livello: primo.livello, nome: regole.find((r) => r.chiave === primo.regola_chiave)?.definizione.nome ?? primo.codice, spiegazione: tecnica && primo.categoria === 'parametro' ? null : primo.spiegazione, stato: primo.stato, rientrato: !!primo.rientrato_il, generato_il: primo.generato_il, responsabile: primo.responsabile } : null },
      silenzio_fino: silenzi.find((s) => s.paziente_id === p.id)?.fino_a ?? null,
    };
  });
  const attivi = righe.filter((r) => r.programma === 'attivo');
  return {
    ambiente: AMB, ora: adesso, vista_tecnica: tecnica,
    motore: { attivo: !!conf?.attivo, ultimo_giro: conf?.ultimo_giro ?? null, ritardo_s: conf?.ultimo_giro ? Math.round((ora - conf.ultimo_giro.getTime()) / 1000) : null, errore: conf?.ultimo_errore ?? null, conservazione: conf ? { misure_ore: conf.misure_ore, tracce_min: conf.tracce_min } : null },
    riepilogo: {
      monitorati: attivi.length, totale: righe.length,
      alta_priorita: righe.filter((r) => r.stato === 'avviso_alta').length, attenzione: righe.filter((r) => r.stato === 'avviso_attenzione').length,
      con_avvisi_tecnici: righe.filter((r) => r.avvisi.tecnici > 0).length,
      dispositivi_disconnessi: attivi.reduce((n, r) => n + r.dispositivi.filter((d) => !d.connesso).length, 0),
      dati_insufficienti: righe.filter((r) => r.stato === 'dati_insufficienti').length, interrotti: righe.filter((r) => r.stato === 'interrotto').length,
    },
    medici: [...new Set(righe.map((r) => r.medico).filter(Boolean))],
    pazienti: righe,
    puo: { prendere: puoMon(ruolo, 'prendere_in_carico'), regole: puoMon(ruolo, 'modificare_regole'), dispositivi: puoMon(ruolo, 'gestire_dispositivi'), simulatore: puoMon(ruolo, 'usare_simulatore'), consultare: puoMon(ruolo, 'consultare') },
  };
}

export async function dettaglio(studioId: string, id: string, ruolo: string, intervallo: { da: Date; a: Date }, adesso = new Date()) {
  const tecnica = vistaTecnica(ruolo);
  const [p] = await query<RigaPaz>(`select id, codice, nome, medico, programma, iniziato_il, terminato_il, ultimo_dato, ultima_ricezione, profilo, patient_id from mon_pazienti where id = $1 and studio_id = $2 and ambiente = $3`, [id, studioId, AMB]);
  if (!p) return null;
  const disp = await query<RigaDisp>(
    `select d.id, ab.paziente_id, d.tipo, d.modello, d.seriale, d.capacita, d.connesso, d.ultimo_contatto, d.batteria, d.sensore_applicato, d.errore, d.adattatore, ab.dal
       from mon_dispositivi d join mon_abbinamenti ab on ab.dispositivo_id = d.id and ab.al is null where ab.paziente_id = $1 order by d.modello`, [id]);
  const storico = await query<{ modello: string; seriale: string; dal: Date; al: Date | null; verificato: boolean; chi: string | null }>(
    `select d.modello, d.seriale, ab.dal, ab.al, ab.verificato, split_part(u.email, '@', 1) as chi from mon_abbinamenti ab join mon_dispositivi d on d.id = ab.dispositivo_id left join users u on u.id = ab.abbinato_da where ab.paziente_id = $1 order by ab.dal desc limit 20`, [id]);
  const par = (await attuali([p], disp, adesso.getTime())).get(p.id) ?? [];
  const durata = Math.max(60, (intervallo.a.getTime() - intervallo.da.getTime()) / 1000);
  const passo = Math.max(15, Math.ceil(durata / 240));
  const punti = tecnica ? [] : await query<{ parametro: string; k: number; v: number; lo: number; hi: number; q: number | null; rec: boolean; n: number }>(
    `select parametro, floor(extract(epoch from acquisita_il - $3::timestamptz) / $5)::int as k, avg(valore)::float as v, min(valore)::float as lo, max(valore)::float as hi, avg(qualita)::float as q, bool_or(recuperata) as rec, count(*)::int as n
       from mon_misure where ambiente = $1 and paziente_id = $2 and valore is not null and acquisita_il >= $3 and acquisita_il <= $4 group by 1, 2 order by 1, 2`, [AMB, id, intervallo.da, intervallo.a, passo]);
  const categorie = tecnica ? [] : await query<{ parametro: string; quando: Date; testo: string; fonte: string | null }>(
    `select parametro, acquisita_il as quando, valore_testo as testo, fonte from mon_misure where ambiente = $1 and paziente_id = $2 and valore is null and acquisita_il >= $3 and acquisita_il <= $4 order by acquisita_il desc limit 400`, [AMB, id, intervallo.da, intervallo.a]);
  const regole = await regoleVive(studioId);
  const serie = par.filter((v) => v.tipo === 'numerico').map((v) => ({
    codice: v.codice, nome: v.nome, breve: v.breve, unita: v.unita, decimali: v.decimali, modo: v.modo, intervallo_s: v.intervallo_s, passo_s: passo, nota: v.nota, fonte: v.fonte,
    punti: punti.filter((x) => x.parametro === v.codice).map((x) => [intervallo.da.getTime() + x.k * passo * 1000, Math.round(x.v * 10) / 10, x.lo, x.hi, x.q == null ? null : Math.round(x.q), x.rec ? 1 : 0, x.n]),
    soglie: regole.filter((r) => r.attiva).map((r) => ({ r, d: conProfilo(r.definizione, p.profilo) })).filter((x) => x.d && x.d.categoria === 'parametro' && x.d.parametro === v.codice)
      .map((x) => ({ chiave: x.r.chiave, nome: x.d!.nome, livello: x.d!.livello, verso: x.d!.verso, soglia: x.d!.soglia, rientro: x.d!.rientro ?? null, versione: x.r.versione, illustrativa: x.r.illustrativa, personale: !!p.profilo?.regole?.[x.r.chiave] })),
  }));
  for (const v of par) if (tecnica) { v.valore = null; v.testo = null; }
  const avvisi = await query<any>(
    `select a.id, a.categoria, a.livello, a.codice, a.regola_chiave, a.regola_versione, a.spiegazione, a.valori, a.segmento_da, a.segmento_a, a.misurato_il, a.ricevuto_il, a.generato_il, a.stato, a.rientrato_il, a.chiuso_il, a.episodi, split_part(u.email, '@', 1) as responsabile
       from mon_avvisi a left join users u on u.id = a.responsabile where a.paziente_id = $1 and a.ambiente = $2 and (a.stato <> 'chiuso' or a.generato_il >= $3::timestamptz - interval '24 hours') order by a.generato_il desc limit 60`, [id, AMB, intervallo.da]);
  const idsA = avvisi.map((a: any) => a.id);
  const azioni = idsA.length ? await query<{ avviso_id: string; quando: Date; azione: string; motivazione: string | null; chi: string | null }>(
    `select z.avviso_id, z.quando, z.azione, z.motivazione, split_part(u.email, '@', 1) as chi from mon_azioni z left join users u on u.id = z.autore where z.avviso_id = any($1::uuid[]) order by z.quando`, [idsA]) : [];
  const notifiche = idsA.length ? await query<{ avviso_id: string; canale: string; stato: string; motivo: string | null; quando: Date }>(
    `select avviso_id, canale, stato, motivo, quando from mon_notifiche where avviso_id = any($1::uuid[]) order by quando`, [idsA]) : [];
  const [silenzio] = await query<{ fino_a: Date }>(`select max(fino_a) as fino_a from mon_silenzi where paziente_id = $1 and fino_a > $2`, [id, adesso]);
  const [ecg] = await query<{ ultimo: Date | null; hz: number | null; derivazione: string | null; mv: number | null }>(
    `select max(inizio) as ultimo, max(hz) as hz, max(derivazione) as derivazione, max(mv_per_unita) as mv from mon_tracce where paziente_id = $1 and ambiente = $2`, [id, AMB]);
  const nomeRegola = (chiave: string) => regole.find((r) => r.chiave === chiave)?.definizione.nome ?? chiave;
  return {
    ambiente: AMB, ora: adesso, vista_tecnica: tecnica, intervallo: { da: intervallo.da, a: intervallo.a, passo_s: passo },
    paziente: { id: p.id, codice: p.codice, nome: p.nome, medico: p.medico, programma: p.programma, iniziato_il: p.iniziato_il, terminato_il: p.terminato_il, ultimo_dato: p.ultimo_dato, ultima_ricezione: p.ultima_ricezione,
      // Un paziente dimostrativo non ha una cartella: non c'è niente a cui collegarlo.
      cartella: p.patient_id, profilo: p.profilo ?? {} },
    dispositivi: disp.map((d) => ({ id: d.id, tipo: d.tipo, modello: d.modello, seriale: d.seriale, adattatore: d.adattatore, connesso: d.connesso, ultimo_contatto: d.ultimo_contatto, batteria: d.batteria, sensore_applicato: d.sensore_applicato, errore: d.errore, abbinato_dal: d.dal, capacita: d.capacita })),
    abbinamenti: storico,
    parametri: par, serie,
    categorie: categorie.map((c) => ({ parametro: c.parametro, nome: parametro(c.parametro).nome, quando: c.quando, testo: c.testo, fonte: c.fonte })),
    ecg: { disponibile: disp.some((d) => d.capacita.some((c) => c.parametro === 'ecg')) && !tecnica, ultimo: ecg?.ultimo ?? null, hz: ecg?.hz ?? null, derivazione: ecg?.derivazione ?? null, mv_per_unita: ecg?.mv ?? null },
    avvisi: avvisi.map((a: any) => ({ ...a, nome: nomeRegola(a.regola_chiave), spiegazione: tecnica && a.categoria === 'parametro' ? null : a.spiegazione, valori: tecnica && a.categoria === 'parametro' ? null : a.valori,
      azioni: azioni.filter((z) => z.avviso_id === a.id), notifiche: notifiche.filter((n) => n.avviso_id === a.id) })),
    silenzio_fino: silenzio?.fino_a ?? null,
    puo: { prendere: puoMon(ruolo, 'prendere_in_carico'), regole: puoMon(ruolo, 'modificare_regole'), dispositivi: puoMon(ruolo, 'gestire_dispositivi'), simulatore: puoMon(ruolo, 'usare_simulatore') },
  };
}

// Il tracciato: i pezzi archiviati da `da` in poi (al massimo `secondi`).
export async function pezziEcg(studioId: string, id: string, da: Date, secondi: number) {
  const righe = await query<{ inizio: Date; hz: number; mv: number; derivazione: string; n: number; campioni: Buffer; qualita: number | null; provenienza: string }>(
    `select t.inizio, t.hz, t.mv_per_unita as mv, t.derivazione, t.n, t.campioni, t.qualita, t.provenienza from mon_tracce t join mon_pazienti p on p.id = t.paziente_id
      where t.paziente_id = $1 and p.studio_id = $2 and t.ambiente = $3 and t.inizio >= $4 and t.inizio < $4::timestamptz + make_interval(secs => $5) order by t.inizio limit 120`, [id, studioId, AMB, da, Math.max(1, Math.min(600, secondi))]);
  return righe.map((r) => ({ inizio: r.inizio, hz: r.hz, mv_per_unita: r.mv, derivazione: r.derivazione, n: r.n, qualita: r.qualita, provenienza: r.provenienza, campioni: r.campioni.toString('base64') }));
}

// ── Azioni sugli avvisi ─────────────────────────────────────────────────────
// Aperto → preso in carico → chiuso. Ogni passo ha autore, orario e (per la
// chiusura) motivazione. Chiudere è un atto di una persona: né il rientro del
// parametro né l'assistente AI chiudono un avviso.
export async function azioneAvviso(studioId: string, utente: { id: string; role: string }, c: { id: string; azione: string; motivazione?: string }): Promise<{ ok: true } | { errore: string; stato?: number }> {
  if (!puoMon(utente.role, 'prendere_in_carico')) return { errore: 'Il tuo ruolo consulta gli avvisi ma non li prende in carico.', stato: 403 };
  const motivo = String(c.motivazione ?? '').trim().slice(0, 500);
  return transazione(async (q) => {
    const [a] = await q<{ id: string; stato: string }>(`select id, stato from mon_avvisi where id = $1 and studio_id = $2 and ambiente = $3 for update`, [c.id, studioId, AMB]);
    if (!a) return { errore: 'Avviso non trovato.', stato: 404 };
    if (c.azione === 'prendi') {
      if (a.stato !== 'aperto') return { errore: a.stato === 'chiuso' ? 'L\'avviso è già chiuso.' : 'L\'avviso è già stato preso in carico.', stato: 409 };
      await q(`update mon_avvisi set stato = 'in_carico', responsabile = $2 where id = $1`, [a.id, utente.id]);
      await q(`insert into mon_azioni (avviso_id, autore, azione, motivazione) values ($1, $2, 'preso_in_carico', nullif($3, ''))`, [a.id, utente.id, motivo]);
    } else if (c.azione === 'chiudi') {
      if (a.stato === 'chiuso') return { errore: 'L\'avviso è già chiuso.', stato: 409 };
      if (motivo.length < 3) return { errore: 'Per chiudere un avviso serve una motivazione.', stato: 400 };
      await q(`update mon_avvisi set stato = 'chiuso', chiuso_il = now(), responsabile = coalesce(responsabile, $2) where id = $1`, [a.id, utente.id]);
      await q(`insert into mon_azioni (avviso_id, autore, azione, motivazione) values ($1, $2, 'chiuso', $3)`, [a.id, utente.id, motivo]);
    } else if (c.azione === 'nota') {
      if (motivo.length < 3) return { errore: 'La nota è vuota.', stato: 400 };
      await q(`insert into mon_azioni (avviso_id, autore, azione, motivazione) values ($1, $2, 'nota', $3)`, [a.id, utente.id, motivo]);
    } else return { errore: 'Azione sconosciuta.', stato: 400 };
    return { ok: true as const };
  });
}

// Silenziare un paziente per un po': tace il richiamo sonoro e visivo, NON
// l'acquisizione, le regole o la registrazione degli avvisi.
export async function silenzia(studioId: string, utente: { id: string; role: string }, pazienteId: string, minuti: number): Promise<{ ok: true; fino_a: Date | null } | { errore: string; stato?: number }> {
  if (!puoMon(utente.role, 'prendere_in_carico')) return { errore: 'Il tuo ruolo non può silenziare gli avvisi.', stato: 403 };
  const [p] = await query<{ id: string; codice: string }>(`select id, codice from mon_pazienti where id = $1 and studio_id = $2 and ambiente = $3`, [pazienteId, studioId, AMB]);
  if (!p) return { errore: 'Paziente non trovato.', stato: 404 };
  if (minuti <= 0) {
    await query(`update mon_silenzi set fino_a = now() where paziente_id = $1 and fino_a > now()`, [p.id]);
    await registraMon(studioId, utente.id, 'silenzio:tolto', p.codice);
    return { ok: true, fino_a: null };
  }
  const m = [15, 30, 60].includes(minuti) ? minuti : 15;
  const [s] = await query<{ fino_a: Date }>(`insert into mon_silenzi (ambiente, paziente_id, fino_a, autore) values ($1, $2, now() + make_interval(mins => $3), $4) returning fino_a`, [AMB, p.id, m, utente.id]);
  await registraMon(studioId, utente.id, 'silenzio:messo', p.codice, { minuti: m });
  return { ok: true, fino_a: s.fino_a };
}

// ── Regole ──────────────────────────────────────────────────────────────────
export async function elencoRegole(studioId: string) {
  const vive = await regoleVive(studioId);
  const storia = await query<{ chiave: string; versioni: number }>(`select chiave, count(*)::int as versioni from mon_regole where studio_id = $1 and ambiente = $2 group by 1`, [studioId, AMB]);
  const registro = await query<{ quando: Date; azione: string; oggetto: string | null; dettaglio: any; chi: string | null }>(
    `select r.quando, r.azione, r.oggetto, r.dettaglio, split_part(u.email, '@', 1) as chi from mon_registro r left join users u on u.id = r.autore where r.studio_id = $1 and r.ambiente = $2 order by r.quando desc limit 40`, [studioId, AMB]);
  return {
    regole: vive.map((r) => ({ ...r.definizione, chiave: r.chiave, versione: r.versione, attiva: r.attiva, illustrativa: r.illustrativa, creata_il: r.creata_il, chi: r.chi, versioni: storia.find((s) => s.chiave === r.chiave)?.versioni ?? 1,
      parametro_nome: r.definizione.parametro ? parametro(r.definizione.parametro).nome : null, unita: r.definizione.parametro ? parametro(r.definizione.parametro).unita : null })),
    registro,
  };
}

// Cambiare una regola = scriverne una VERSIONE nuova. La vecchia resta, e gli
// avvisi già generati continuano a dire da quale versione vengono.
export async function nuovaVersione(studioId: string, utente: { id: string; role: string }, chiave: string, cambi: Record<string, unknown>): Promise<{ ok: true; versione: number } | { errore: string; stato?: number }> {
  if (!puoMon(utente.role, 'modificare_regole')) return { errore: 'Il tuo ruolo non può modificare le regole.', stato: 403 };
  return transazione(async (q) => {
    const [r] = await q<{ versione: number; definizione: Regola; attiva: boolean; illustrativa: boolean }>(
      `select versione, definizione, attiva, illustrativa from mon_regole where studio_id = $1 and ambiente = $2 and chiave = $3 order by versione desc limit 1 for update`, [studioId, AMB, chiave]);
    if (!r) return { errore: 'Regola non trovata.', stato: 404 };
    const d: any = { ...r.definizione };
    for (const k of ['soglia', 'rientro', 'durata_s', 'minimo_misure', 'qualita_minima', 'ripeti_notifica_s', 'limite', 'attesa_s'] as const) if (typeof cambi[k] === 'number' && Number.isFinite(cambi[k] as number)) d[k] = cambi[k];
    const attiva = typeof cambi.attiva === 'boolean' ? cambi.attiva : r.attiva;
    const problema = controllaRegola(d);
    if (problema) return { errore: problema, stato: 400 };
    await q(`insert into mon_regole (studio_id, ambiente, chiave, versione, definizione, attiva, illustrativa, creata_da) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [studioId, AMB, chiave, r.versione + 1, JSON.stringify(d), attiva, r.illustrativa, utente.id]);
    await q(`insert into mon_registro (studio_id, ambiente, autore, azione, oggetto, dettaglio) values ($1,$2,$3,'regola:nuova_versione',$4,$5)`, [studioId, AMB, utente.id, chiave,
      JSON.stringify({ da_versione: r.versione, a_versione: r.versione + 1, prima: { soglia: r.definizione.soglia ?? null, rientro: r.definizione.rientro ?? null, durata_s: r.definizione.durata_s ?? null, attiva: r.attiva }, dopo: { soglia: d.soglia ?? null, rientro: d.rientro ?? null, durata_s: d.durata_s ?? null, attiva } })]);
    return { ok: true as const, versione: r.versione + 1 };
  });
}

// La soglia del SINGOLO paziente: sta nel suo profilo, non tocca la regola di tutti.
export async function sogliaPaziente(studioId: string, utente: { id: string; role: string }, pazienteId: string, chiave: string, c: { soglia?: number | null; rientro?: number | null; spenta?: boolean; togli?: boolean }): Promise<{ ok: true } | { errore: string; stato?: number }> {
  if (!puoMon(utente.role, 'modificare_regole')) return { errore: 'Il tuo ruolo non può modificare le regole.', stato: 403 };
  return transazione(async (q) => {
    const [p] = await q<{ codice: string; profilo: any }>(`select codice, profilo from mon_pazienti where id = $1 and studio_id = $2 and ambiente = $3 for update`, [pazienteId, studioId, AMB]);
    const [r] = await q<{ definizione: Regola }>(`select definizione from mon_regole where studio_id = $1 and ambiente = $2 and chiave = $3 order by versione desc limit 1`, [studioId, AMB, chiave]);
    if (!p || !r) return { errore: 'Paziente o regola non trovati.', stato: 404 };
    const profilo = { ...(p.profilo ?? {}), regole: { ...(p.profilo?.regole ?? {}) } };
    const prima = profilo.regole[chiave] ?? null;
    if (c.togli) delete profilo.regole[chiave];
    else {
      const sua: any = { ...(c.spenta ? { spenta: true } : {}), ...(typeof c.soglia === 'number' ? { soglia: c.soglia } : {}), ...(typeof c.rientro === 'number' ? { rientro: c.rientro } : {}) };
      const problema = sua.spenta ? null : controllaRegola({ ...r.definizione, ...sua });
      if (problema) return { errore: problema, stato: 400 };
      profilo.regole[chiave] = sua;
    }
    await q(`update mon_pazienti set profilo = $2 where id = $1`, [pazienteId, JSON.stringify(profilo)]);
    await q(`insert into mon_registro (studio_id, ambiente, autore, azione, oggetto, dettaglio) values ($1,$2,$3,'soglia:paziente',$4,$5)`, [studioId, AMB, utente.id, p.codice, JSON.stringify({ regola: chiave, prima, dopo: profilo.regole[chiave] ?? null })]);
    return { ok: true as const };
  });
}

// ── Dispositivi e abbinamenti ───────────────────────────────────────────────
export async function elencoDispositivi(studioId: string) {
  const righe = await query<any>(
    `select d.id, d.tipo, d.modello, d.seriale, d.adattatore, d.capacita, d.connesso, d.ultimo_contatto, d.batteria, d.sensore_applicato, d.errore,
            p.id as paziente_id, p.codice as paziente_codice, p.nome as paziente_nome, ab.dal, ab.verificato
       from mon_dispositivi d left join mon_abbinamenti ab on ab.dispositivo_id = d.id and ab.al is null left join mon_pazienti p on p.id = ab.paziente_id
      where d.studio_id = $1 and d.ambiente = $2 order by p.codice nulls last, d.modello`, [studioId, AMB]);
  const pazienti = await query<{ id: string; codice: string; nome: string | null; programma: string }>(`select id, codice, nome, programma from mon_pazienti where studio_id = $1 and ambiente = $2 order by codice`, [studioId, AMB]);
  return { dispositivi: righe.map((d: any) => ({ ...d, capacita: (d.capacita as Capacita[]).map((c) => ({ ...c, nome: PARAMETRI[c.parametro]?.nome ?? c.parametro })) })), pazienti };
}

// Staccare o abbinare un dispositivo. L'abbinamento chiede di riscrivere il
// codice del paziente: è la verifica esplicita contro l'attribuzione sbagliata.
// Lo storico resta: i dati presi prima restano del paziente di prima.
export async function abbinamento(studioId: string, utente: { id: string; role: string }, c: { azione: 'stacca' | 'abbina'; dispositivo: string; paziente?: string; conferma?: string }): Promise<{ ok: true } | { errore: string; stato?: number }> {
  if (!puoMon(utente.role, 'gestire_dispositivi')) return { errore: 'Il tuo ruolo non gestisce i dispositivi.', stato: 403 };
  return transazione(async (q) => {
    const [d] = await q<{ id: string; seriale: string }>(`select id, seriale from mon_dispositivi where id = $1 and studio_id = $2 and ambiente = $3 for update`, [c.dispositivo, studioId, AMB]);
    if (!d) return { errore: 'Dispositivo non trovato.', stato: 404 };
    const [aperto] = await q<{ id: string; paziente_id: string }>(`select id, paziente_id from mon_abbinamenti where dispositivo_id = $1 and al is null`, [d.id]);
    if (c.azione === 'stacca') {
      if (!aperto) return { errore: 'Il dispositivo non è abbinato a nessuno.', stato: 409 };
      await q(`update mon_abbinamenti set al = now() where id = $1`, [aperto.id]);
      await q(`update mon_dispositivi set connesso = false where id = $1`, [d.id]);
      await q(`insert into mon_registro (studio_id, ambiente, autore, azione, oggetto, dettaglio) values ($1,$2,$3,'dispositivo:staccato',$4,'{}')`, [studioId, AMB, utente.id, d.seriale]);
      return { ok: true as const };
    }
    if (aperto) return { errore: 'Il dispositivo è ancora abbinato a un paziente: prima va staccato.', stato: 409 };
    const [p] = await q<{ id: string; codice: string }>(`select id, codice from mon_pazienti where id = $1 and studio_id = $2 and ambiente = $3`, [c.paziente ?? '', studioId, AMB]);
    if (!p) return { errore: 'Paziente non trovato.', stato: 404 };
    if (String(c.conferma ?? '').trim().toUpperCase() !== p.codice.toUpperCase()) return { errore: 'Il codice di conferma non corrisponde a quello del paziente: abbinamento non fatto.', stato: 400 };
    await q(`insert into mon_abbinamenti (ambiente, paziente_id, dispositivo_id, abbinato_da, verificato, nota) values ($1,$2,$3,$4,true,'verificato col codice del paziente')`, [AMB, p.id, d.id, utente.id]);
    await q(`insert into mon_registro (studio_id, ambiente, autore, azione, oggetto, dettaglio) values ($1,$2,$3,'dispositivo:abbinato',$4,$5)`, [studioId, AMB, utente.id, d.seriale, JSON.stringify({ paziente: p.codice })]);
    return { ok: true as const };
  });
}

// Tutti gli avvisi dello studio (pagina «Avvisi»), anche quelli chiusi di recente.
export async function elencoAvvisi(studioId: string, ruolo: string) {
  const tecnica = vistaTecnica(ruolo);
  const regole = await regoleVive(studioId);
  const righe = await query<any>(
    `select a.id, a.paziente_id, p.codice, p.nome as paziente, a.categoria, a.livello, a.codice as cosa, a.regola_chiave, a.regola_versione, a.spiegazione, a.generato_il, a.misurato_il, a.ricevuto_il, a.stato, a.rientrato_il, a.chiuso_il, a.episodi,
            split_part(u.email, '@', 1) as responsabile,
            (select count(*)::int from mon_notifiche n where n.avviso_id = a.id and n.canale = 'interna') as notifiche,
            (select count(*)::int from mon_notifiche n where n.avviso_id = a.id and n.stato <> 'consegnata') as non_consegnate
       from mon_avvisi a join mon_pazienti p on p.id = a.paziente_id left join users u on u.id = a.responsabile
      where a.studio_id = $1 and a.ambiente = $2 and (a.stato <> 'chiuso' or a.chiuso_il > now() - interval '24 hours')
      order by (a.stato = 'chiuso'), (a.categoria = 'tecnico'), a.livello desc nulls last, a.generato_il desc limit 200`, [studioId, AMB]);
  return righe.map((a: any) => ({ ...a, nome: regole.find((r) => r.chiave === a.regola_chiave)?.definizione.nome ?? a.cosa, spiegazione: tecnica && a.categoria === 'parametro' ? null : a.spiegazione }));
}
