import 'server-only';
import { query, transazione } from '../db';
import { proposteAccese } from './accese';
import { FARMACI_BOZZA, FONTE_BOZZA, controllaFarmaco, orario, riconosci, type Classe, type Farmaco } from './farmaci';
import {
  IMPOSTAZIONI_BASE, SOGLIE_BASE, avvisoFasce, confronta, copertura, fasce, leggiFile, proponi, punteggio, segnaScoperte, statistiche,
  type Impostazioni, type Misura, type Presa, type Soglie,
} from './calcolo';

// Pressione (7.10.2026, [[Piattaforma/Pressione]]) — il lato che parla col
// database. I conti stanno in calcolo.ts (puri); qui si leggono e si scrivono
// profili, terapie e la tabella dei farmaci, e si applicano i permessi.
//
// Nei log e nel registro non entra MAI un valore di pressione né un nome:
// solo azioni e conteggi.

// Chi fa che cosa. Il tecnico tiene in piedi il sistema e non vede dati clinici.
export const PUO_PA = {
  vedere: ['medico', 'assistente', 'segretaria', 'admin'],
  caricare: ['medico', 'assistente', 'segretaria'],
  terapia: ['medico', 'assistente'],
  decidere: ['medico'],        // soglie, tabella dei farmaci, proposte
} as const;
export const puoPa = (ruolo: string | null | undefined, cosa: keyof typeof PUO_PA): boolean => !!ruolo && (PUO_PA[cosa] as readonly string[]).includes(ruolo);

// Le proposte di orario sono un dispositivo medico interno dello studio:
// restano spente finché fascicolo, validazione e notifica non sono a posto.
export { proposteAccese } from './accese';

type Esito<T> = T | { errore: string; stato?: number };
const err = (errore: string, stato = 400) => ({ errore, stato });

async function registra(studioId: string, userId: string | null, azione: string, profiloId: string | null = null, dettaglio: Record<string, unknown> = {}): Promise<void> {
  await query(`insert into pa_registro (studio_id, profilo_id, user_id, azione, dettaglio) values ($1,$2,$3,$4,$5)`, [studioId, profiloId, userId, azione, JSON.stringify(dettaglio)])
    .catch((e) => console.error(`[pressione] registro: ${e?.code ?? e?.name ?? 'errore'}`));
}

// ── La tabella dei farmaci ──────────────────────────────────────────────────
// La bozza entra una volta sola, riga per riga «da confermare». Un principio
// aggiunto al codice in seguito entra alla prima apertura; ciò che lo studio
// ha già modificato o confermato non si tocca mai.
export async function assicuraFarmaci(studioId: string): Promise<void> {
  const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from pa_farmaci where studio_id = $1`, [studioId]);
  if (n >= FARMACI_BOZZA.length) return;
  for (const f of FARMACI_BOZZA) {
    await query(
      `insert into pa_farmaci (studio_id, principio, classe, inizio_h, picco_h, durata_h, emivita_h, orario_rilevante, nota, fonte)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (studio_id, principio) do nothing`,
      [studioId, f.principio, f.classe, f.inizio_h, f.picco_h, f.durata_h, f.emivita_h, f.orario_rilevante, f.nota ?? null, FONTE_BOZZA]);
  }
}

type RigaFarmaco = { principio: string; classe: Classe; inizio_h: number; picco_h: number; durata_h: number; emivita_h: number; orario_rilevante: boolean; nota: string | null; fonte: string | null; confermato: boolean; confermato_il: string | null; confermato_da: string | null };
async function righeFarmaci(studioId: string): Promise<RigaFarmaco[]> {
  await assicuraFarmaci(studioId);
  return query<RigaFarmaco>(
    `select f.principio, f.classe, f.inizio_h::float8, f.picco_h::float8, f.durata_h::float8, f.emivita_h::float8, f.orario_rilevante, f.nota, f.fonte,
            (f.confermato_il is not null) as confermato, f.confermato_il::text, u.email as confermato_da
       from pa_farmaci f left join users u on u.id = f.confermato_da where f.studio_id = $1 order by f.classe, f.principio`, [studioId]);
}
const comeFarmaco = (r: RigaFarmaco): Farmaco => {
  const bozza = FARMACI_BOZZA.find((b) => b.principio === r.principio);
  return { principio: r.principio, classe: r.classe, inizio_h: r.inizio_h, picco_h: r.picco_h, durata_h: r.durata_h, emivita_h: r.emivita_h, orario_rilevante: r.orario_rilevante, radici: bozza?.radici ?? [], marchi: bozza?.marchi ?? [] };
};

export async function elencoFarmaci(studioId: string) {
  const righe = await righeFarmaci(studioId);
  return { farmaci: righe, confermati: righe.filter((r) => r.confermato).length, totale: righe.length };
}

export async function salvaFarmaco(studioId: string, userId: string, principio: string, v: { inizio_h: number; picco_h: number; durata_h: number; emivita_h: number; orario_rilevante?: boolean; nota?: string; fonte?: string; conferma?: boolean }): Promise<Esito<{ ok: true }>> {
  const numeri = { inizio_h: Number(v.inizio_h), picco_h: Number(v.picco_h), durata_h: Number(v.durata_h), emivita_h: Number(v.emivita_h) };
  const sbaglio = controllaFarmaco(numeri);
  if (sbaglio) return err(sbaglio);
  // Cambiare un numero toglie la conferma: la si ridà guardando il numero nuovo.
  const [r] = await query<{ id: string }>(
    `update pa_farmaci set inizio_h = $3, picco_h = $4, durata_h = $5, emivita_h = $6, orario_rilevante = coalesce($7, orario_rilevante),
            nota = coalesce($8, nota), fonte = coalesce(nullif($9, ''), fonte), aggiornato_il = now(),
            confermato_da = case when $10 then $11::uuid else null end, confermato_il = case when $10 then now() else null end
      where studio_id = $1 and principio = $2 returning id`,
    [studioId, principio, numeri.inizio_h, numeri.picco_h, numeri.durata_h, numeri.emivita_h, typeof v.orario_rilevante === 'boolean' ? v.orario_rilevante : null,
     typeof v.nota === 'string' ? v.nota.slice(0, 300) : null, typeof v.fonte === 'string' ? v.fonte.slice(0, 300) : '', v.conferma === true, userId]);
  if (!r) return err('Farmaco non trovato.', 404);
  await registra(studioId, userId, v.conferma ? 'farmaco_confermato' : 'farmaco_modificato', null, { principio });
  return { ok: true };
}

export async function togliConferma(studioId: string, userId: string, principio: string): Promise<Esito<{ ok: true }>> {
  const [r] = await query<{ id: string }>(`update pa_farmaci set confermato_da = null, confermato_il = null where studio_id = $1 and principio = $2 returning id`, [studioId, principio]);
  if (!r) return err('Farmaco non trovato.', 404);
  await registra(studioId, userId, 'farmaco_conferma_tolta', null, { principio });
  return { ok: true };
}

// ── I profili ───────────────────────────────────────────────────────────────
const MINIMO_MISURE = 10;

export async function caricaProfilo(studioId: string, userId: string, patientId: string, x: { testo: string; data_inizio?: string; apparecchio?: string }): Promise<Esito<{ id: string; misure: number; scartate: number }>> {
  const [paz] = await query<{ id: string }>(`select id from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!paz) return err('Paziente non trovato.', 404);
  if (String(x.testo ?? '').length > 400_000) return err('Il file è troppo grande per essere un profilo delle 24 ore.');
  const letto = leggiFile(x.testo, x.data_inizio);
  if (letto.errore) return err(letto.errore);
  if (letto.misure.length < MINIMO_MISURE) return err(`Nel file ci sono solo ${letto.misure.length} misure: troppo poche per un profilo.`);
  const inizio = letto.misure[0].quando, fine = letto.misure[letto.misure.length - 1].quando;
  const ore = (Date.parse(`${fine}:00Z`) - Date.parse(`${inizio}:00Z`)) / 3_600_000;
  if (ore > 80) return err('Le misure coprono più di tre giorni: non è un profilo delle 24 ore.');
  const [gia] = await query<{ id: string }>(`select id from pa_profili where studio_id = $1 and patient_id = $2 and inizio = $3::timestamp`, [studioId, patientId, inizio]);
  if (gia) return err('Questo profilo è già stato caricato per questo paziente.', 409);
  const id = await transazione(async (q) => {
    const [p] = await q<{ id: string }>(
      `insert into pa_profili (studio_id, patient_id, inizio, fine, apparecchio, caricato_da) values ($1,$2,$3::timestamp,$4::timestamp,nullif($5,''),$6) returning id`,
      [studioId, patientId, inizio, fine, String(x.apparecchio ?? '').slice(0, 80), userId]);
    for (const m of letto.misure) {
      await q(`insert into pa_misure (profilo_id, quando, sistolica, diastolica, frequenza, valida) values ($1,$2::timestamp,$3,$4,$5,$6)`, [p.id, m.quando, m.sis, m.dia, m.fc, m.valida]);
    }
    // La terapia si riprende dal profilo precedente dello stesso paziente: è
    // un punto di partenza da controllare, non un dato confermato.
    await q(
      `insert into pa_terapie (profilo_id, nome, dose, orari, principi, ordine)
       select $1, t.nome, t.dose, t.orari, t.principi, t.ordine from pa_terapie t
        where t.profilo_id = (select id from pa_profili where studio_id = $2 and patient_id = $3 and id <> $1 and inizio < $4::timestamp order by inizio desc limit 1)`,
      [p.id, studioId, patientId, inizio]);
    return p.id;
  });
  await registra(studioId, userId, 'profilo_caricato', id, { misure: letto.misure.length, scartate: letto.scartate });
  return { id, misure: letto.misure.length, scartate: letto.scartate };
}

async function misureDi(profiloId: string): Promise<Misura[]> {
  const r = await query<{ quando: string; sis: number; dia: number; fc: number | null; valida: boolean }>(
    `select to_char(quando, 'YYYY-MM-DD"T"HH24:MI') as quando, sistolica::int as sis, diastolica::int as dia, frequenza::int as fc, valida from pa_misure where profilo_id = $1 order by quando`, [profiloId]);
  return r;
}
type RigaProfilo = { id: string; patient_id: string; paziente: string; inizio: string; fine: string; apparecchio: string | null; sveglia: string; sonno: string; soglie: Partial<Soglie> | null; nota: string | null; created_at: string };
const SELEZIONE = `select p.id, p.patient_id, (pz.cognome || ' ' || pz.nome) as paziente, to_char(p.inizio, 'YYYY-MM-DD"T"HH24:MI') as inizio, to_char(p.fine, 'YYYY-MM-DD"T"HH24:MI') as fine,
                          p.apparecchio, p.sveglia, p.sonno, p.soglie, p.nota, p.created_at::text
                     from pa_profili p join patients pz on pz.id = p.patient_id`;
const impostazioniDi = (p: Pick<RigaProfilo, 'sveglia' | 'sonno' | 'soglie'>): Impostazioni => ({ sveglia: orario(p.sveglia) ?? IMPOSTAZIONI_BASE.sveglia, sonno: orario(p.sonno) ?? IMPOSTAZIONI_BASE.sonno, soglie: { ...SOGLIE_BASE, ...(p.soglie ?? {}) } });

export async function elencoProfili(studioId: string, patientId?: string | null) {
  const righe = await query<RigaProfilo>(`${SELEZIONE} where p.studio_id = $1 and ($2::uuid is null or p.patient_id = $2::uuid) order by p.inizio desc limit 60`, [studioId, patientId ?? null]);
  const profili = [];
  for (const p of righe) {
    const imp = impostazioniDi(p);
    const stat = statistiche(await misureDi(p.id), imp);
    profili.push({ id: p.id, patient_id: p.patient_id, paziente: p.paziente, inizio: p.inizio, fine: p.fine, misure: stat.misure, valide: stat.valide,
      sis: stat.tutte.sis, dia: stat.tutte.dia, calo_tipo: stat.calo_tipo, affidabile: stat.qualita.affidabile, punteggio: punteggio(stat.orarie, imp)?.totale ?? null });
  }
  return { profili };
}

async function terapieDi(profiloId: string) {
  return query<{ id: string; nome: string; dose: string | null; orari: string[]; principi: string[] }>(`select id, nome, dose, orari, principi from pa_terapie where profilo_id = $1 order by ordine, nome`, [profiloId]);
}

// Tutto ciò che la pagina di un profilo mostra, già calcolato.
export async function dettaglio(studioId: string, id: string, ruolo: string) {
  const [p] = await query<RigaProfilo>(`${SELEZIONE} where p.studio_id = $1 and p.id = $2`, [studioId, id]);
  if (!p) return null;
  const imp = impostazioniDi(p);
  const misure = await misureDi(id);
  const stat = statistiche(misure, imp);
  const righe = await righeFarmaci(studioId);
  const confermati = new Map(righe.filter((r) => r.confermato).map((r) => [r.principio, comeFarmaco(r)]));
  const tutti = new Map(righe.map((r) => [r.principio, r]));
  const terapie = await terapieDi(id);
  const prese: Presa[] = terapie.flatMap((t) => t.principi.map((pr) => ({ id: `${t.id}:${pr}`, nome: t.nome, principio: pr, orari: t.orari })));
  const cop = copertura(prese, confermati);
  const f = segnaScoperte(fasce(stat.orarie, imp.soglie), cop);
  const punti = punteggio(stat.orarie, imp);

  // Il profilo precedente dello stesso paziente, per il prima e dopo.
  const [prec] = await query<RigaProfilo>(`${SELEZIONE} where p.studio_id = $1 and p.patient_id = $2 and p.inizio < $3::timestamp order by p.inizio desc limit 1`, [studioId, p.patient_id, p.inizio]);
  let precedente = null;
  if (prec) {
    const impP = impostazioniDi(prec);
    const statP = statistiche(await misureDi(prec.id), impP);
    const puntiP = punteggio(statP.orarie, impP);
    precedente = { id: prec.id, inizio: prec.inizio, orarie: statP.orarie.map((o) => ({ ora: o.ora, sis: o.sis, dia: o.dia })), punteggio: puntiP?.totale ?? null,
      terapie: (await terapieDi(prec.id)).map((t) => ({ nome: t.nome, dose: t.dose, orari: t.orari })), confronto: confronta({ stat: statP, punti: puntiP }, { stat, punti }) };
  }

  const accese = proposteAccese();
  const proposte = accese ? await query<{ id: string; versione: string; contenuto: unknown; stato: string; orario_scelto: string | null; nota: string | null; decisa_il: string | null; decisa_da: string | null }>(
    `select pr.id, pr.versione, pr.contenuto, pr.stato, pr.orario_scelto, pr.nota, pr.decisa_il::text, u.email as decisa_da
       from pa_proposte pr left join users u on u.id = pr.decisa_da where pr.profilo_id = $1 order by pr.creata_il desc, pr.id`, [id]) : [];

  return {
    profilo: { id: p.id, patient_id: p.patient_id, paziente: p.paziente, inizio: p.inizio, fine: p.fine, apparecchio: p.apparecchio, nota: p.nota },
    impostazioni: imp,
    misure, statistiche: stat, fasce: f, punteggio: punti,
    terapie: terapie.map((t) => ({
      ...t,
      // Per ogni principio riconosciuto: c'è in tabella? è confermato? ha una finestra oraria?
      farmaci: t.principi.map((pr) => { const r = tutti.get(pr); return { principio: pr, confermato: !!r?.confermato, orario_rilevante: r?.orario_rilevante ?? true, nota: r?.nota ?? null }; }),
    })),
    copertura: cop,
    precedente,
    proposte_accese: accese, proposte,
    puo: { caricare: puoPa(ruolo, 'caricare'), terapia: puoPa(ruolo, 'terapia'), decidere: puoPa(ruolo, 'decidere') },
  };
}

export async function salvaTerapia(studioId: string, userId: string, profiloId: string, righe: unknown): Promise<Esito<{ ok: true; righe: number; non_riconosciuti: number }>> {
  const [p] = await query<{ id: string }>(`select id from pa_profili where id = $1 and studio_id = $2`, [profiloId, studioId]);
  if (!p) return err('Profilo non trovato.', 404);
  if (!Array.isArray(righe) || righe.length > 20) return err('Terapia non valida.');
  const tabella = (await righeFarmaci(studioId)).map(comeFarmaco);
  const pulite: { nome: string; dose: string | null; orari: string[]; principi: string[] }[] = [];
  for (const r of righe as Record<string, unknown>[]) {
    const nome = String(r?.nome ?? '').trim().slice(0, 80);
    if (!nome) continue;
    const scritti = (Array.isArray(r.orari) ? r.orari.map(String) : String(r.orari ?? '').split(/[,; ]+/)).map((o) => o.trim()).filter(Boolean);
    const orari = scritti.map((o) => orario(o));
    if (orari.some((o) => !o)) return err(`Orario non valido per «${nome}»: scrivilo come 08:00.`);
    pulite.push({ nome, dose: String(r.dose ?? '').trim().slice(0, 40) || null, orari: [...new Set(orari as string[])].sort(), principi: riconosci(nome, tabella) });
  }
  await transazione(async (q) => {
    await q(`delete from pa_terapie where profilo_id = $1`, [profiloId]);
    // Una terapia cambiata rende vecchie le proposte ancora aperte.
    await q(`delete from pa_proposte where profilo_id = $1 and stato = 'aperta'`, [profiloId]);
    for (const [i, r] of pulite.entries()) await q(`insert into pa_terapie (profilo_id, nome, dose, orari, principi, ordine) values ($1,$2,$3,$4,$5,$6)`, [profiloId, r.nome, r.dose, r.orari, r.principi, i]);
  });
  await registra(studioId, userId, 'terapia_salvata', profiloId, { righe: pulite.length });
  return { ok: true, righe: pulite.length, non_riconosciuti: pulite.filter((r) => !r.principi.length).length };
}

export async function salvaImpostazioni(studioId: string, userId: string, profiloId: string, x: { sveglia?: string; sonno?: string; soglie?: Partial<Soglie> | null; nota?: string }, puoSoglie: boolean): Promise<Esito<{ ok: true }>> {
  const sveglia = x.sveglia === undefined ? null : orario(x.sveglia), sonno = x.sonno === undefined ? null : orario(x.sonno);
  if ((x.sveglia !== undefined && !sveglia) || (x.sonno !== undefined && !sonno)) return err('Orario non valido: scrivilo come 07:00.');
  let soglie: Soglie | null | undefined;
  if (x.soglie !== undefined) {
    if (!puoSoglie) return err('Le soglie le cambia il medico.', 403);
    if (x.soglie === null) soglie = null;
    else {
      const s = { ...SOGLIE_BASE, ...x.soglie };
      const v = Object.values(s).map(Number);
      if (v.some((n) => !Number.isFinite(n) || n < 40 || n > 220) || s.giorno_dia >= s.giorno_sis || s.notte_dia >= s.notte_sis || s.basso_giorno >= s.giorno_sis || s.basso_notte >= s.notte_sis) return err('Soglie non valide.');
      soglie = { giorno_sis: +s.giorno_sis, giorno_dia: +s.giorno_dia, notte_sis: +s.notte_sis, notte_dia: +s.notte_dia, basso_giorno: +s.basso_giorno, basso_notte: +s.basso_notte };
    }
  }
  const [p] = await query<{ id: string }>(
    `update pa_profili set sveglia = coalesce($3, sveglia), sonno = coalesce($4, sonno),
            soglie = case when $5 then $6::jsonb else soglie end, nota = case when $7 then nullif($8, '') else nota end
      where id = $1 and studio_id = $2 returning id`,
    [profiloId, studioId, sveglia, sonno, soglie !== undefined, soglie ? JSON.stringify(soglie) : null, x.nota !== undefined, String(x.nota ?? '').slice(0, 500)]);
  if (!p) return err('Profilo non trovato.', 404);
  // Giorno, notte e soglie cambiano i conti: le proposte aperte non valgono più.
  await query(`delete from pa_proposte where profilo_id = $1 and stato = 'aperta'`, [profiloId]);
  await registra(studioId, userId, 'impostazioni_salvate', profiloId, { soglie: soglie !== undefined });
  return { ok: true };
}

export async function eliminaProfilo(studioId: string, userId: string, profiloId: string): Promise<Esito<{ ok: true }>> {
  const [p] = await query<{ id: string }>(`delete from pa_profili where id = $1 and studio_id = $2 returning id`, [profiloId, studioId]);
  if (!p) return err('Profilo non trovato.', 404);
  await registra(studioId, userId, 'profilo_eliminato', profiloId);
  return { ok: true };
}

// ── Le proposte di orario (dispositivo interno, spento di serie) ────────────
export async function generaProposte(studioId: string, userId: string, profiloId: string): Promise<Esito<{ ok: true; proposte: number; avviso: string | null; motivo_nessuna: string | null }>> {
  if (!proposteAccese()) return err('proposte_spente', 403);
  const [p] = await query<RigaProfilo>(`${SELEZIONE} where p.studio_id = $1 and p.id = $2`, [studioId, profiloId]);
  if (!p) return err('Profilo non trovato.', 404);
  const imp = impostazioniDi(p);
  const stat = statistiche(await misureDi(profiloId), imp);
  const confermati = new Map((await righeFarmaci(studioId)).filter((r) => r.confermato).map((r) => [r.principio, comeFarmaco(r)]));
  const terapie = await terapieDi(profiloId);
  const prese: Presa[] = terapie.flatMap((t) => t.principi.map((pr) => ({ id: `${t.id}:${pr}`, nome: t.nome, principio: pr, orari: t.orari })));
  const esito = proponi(stat.orarie, prese, confermati, imp, stat.qualita);
  await transazione(async (q) => {
    await q(`delete from pa_proposte where profilo_id = $1 and stato = 'aperta'`, [profiloId]);
    for (const pr of esito.proposte) {
      await q(`insert into pa_proposte (profilo_id, versione, contenuto) values ($1,$2,$3)`, [profiloId, esito.versione, JSON.stringify({ ...pr, ipotesi: esito.ipotesi })]);
    }
  });
  await registra(studioId, userId, 'proposte_generate', profiloId, { proposte: esito.proposte.length, versione: esito.versione });
  return { ok: true, proposte: esito.proposte.length, avviso: esito.avviso, motivo_nessuna: esito.motivo_nessuna };
}

// L'avviso «resta sopra soglia» senza generare proposte: si calcola quando la
// pagina lo chiede, solo a proposte accese.
export async function avvisoProfilo(studioId: string, profiloId: string): Promise<string | null> {
  if (!proposteAccese()) return null;
  const [p] = await query<RigaProfilo>(`${SELEZIONE} where p.studio_id = $1 and p.id = $2`, [studioId, profiloId]);
  if (!p) return null;
  const imp = impostazioniDi(p);
  const stat = statistiche(await misureDi(profiloId), imp);
  if (!stat.qualita.affidabile) return null;
  const confermati = new Map((await righeFarmaci(studioId)).filter((r) => r.confermato).map((r) => [r.principio, comeFarmaco(r)]));
  const prese: Presa[] = (await terapieDi(profiloId)).flatMap((t) => t.principi.map((pr) => ({ id: `${t.id}:${pr}`, nome: t.nome, principio: pr, orari: t.orari })));
  return proponi(stat.orarie, prese, confermati, imp, stat.qualita).avviso;
}
export { avvisoFasce };

export async function decidiProposta(studioId: string, userId: string, propostaId: string, x: { stato: string; orario?: string; nota?: string }): Promise<Esito<{ ok: true }>> {
  if (!proposteAccese()) return err('proposte_spente', 403);
  const stato = ['accettata', 'modificata', 'scartata'].includes(x.stato) ? x.stato : null;
  if (!stato) return err('Decisione non valida.');
  const scelto = stato === 'modificata' ? orario(String(x.orario ?? '')) : null;
  if (stato === 'modificata' && !scelto) return err('Per modificare la proposta serve l’orario scelto, come 20:00.');
  const [r] = await query<{ id: string; profilo_id: string }>(
    `update pa_proposte pr set stato = $3, orario_scelto = $4, nota = nullif($5, ''), decisa_da = $6, decisa_il = now()
       from pa_profili p where pr.id = $1 and p.id = pr.profilo_id and p.studio_id = $2 and pr.stato = 'aperta' returning pr.id, pr.profilo_id`,
    [propostaId, studioId, stato, scelto, String(x.nota ?? '').slice(0, 300), userId]);
  if (!r) return err('Proposta non trovata, o già decisa.', 404);
  await registra(studioId, userId, `proposta_${stato}`, r.profilo_id);
  return { ok: true };
}
