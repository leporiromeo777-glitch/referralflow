import 'server-only';
import { query } from './db';
import { dettatoConTerapia, letteraPrecedente } from './referti-lettera';
import { misureCliniche } from './referti-misure-cliniche';
import { costruisciRevisione } from './prototipo-revisione';
import { apriTraccia, chiudiTraccia } from './tracce';
import { confrontaReferti, controlloPreFirma, richiamiDelMese, type EsitoProcedura, type RichiamoIn } from './procedure-regole';

// Le procedure dell'assistente oltre il briefing (13.9.2026): il codice legge
// il DB, le regole pure (`procedure-regole.ts`) decidono, la traccia finisce
// in `assistente_tracce`. Nessun modello: sono confronti e conteggi.
// Nei log solo id abbreviati e numeri.

type Traccia = EsitoProcedura & { traccia: { id: number; modello: null; durata_ms: number } };

async function conTraccia(studioId: string, userId: string | null | undefined, patientId: string | null, e: EsitoProcedura, t0: number): Promise<Traccia> {
  const durata = Date.now() - t0;
  const id = await apriTraccia({ studioId, userId, patientId, procedura: e.procedura, obiettivo: e.titolo, passi: e.passi, fonti: e.fonti, mancanti: e.mancanti, modello: null });
  await chiudiTraccia(id, { durataMs: durata, caratteri: (e.sintesi ?? '').length });
  console.log(`[procedura] ${e.procedura} passi=${e.passi.length} fonti=${e.fonti.length} mancanti=${e.mancanti.length} ${durata}ms traccia=${id}`);
  return { ...e, traccia: { id, modello: null, durata_ms: durata } };
}

/* ---------- cosa è cambiato dall'ultima visita ---------- */
export async function cambiamentiUltimaVisita(studioId: string, patientId: string, userId?: string | null): Promise<Traccia | null> {
  const t0 = Date.now();
  const [p] = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(
    `select id, cognome, nome, data_nascita::text from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!p) return null;
  const nome = `${p.cognome} ${p.nome}`.trim();
  const referti = await query<{ id: string; testo_finale: string; reviewed_at: string | null }>(
    `select id, testo_finale, reviewed_at::text from referti_bozze
      where studio_id = $1 and stato = 'confermata' and tipo = 'referto' and testo_finale is not null
        and coalesce((payload->>'ombra')::boolean, false) = false
        and lower(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', '')) in (lower($2), lower($3))
      order by reviewed_at desc nulls last limit 2`,
    [studioId, nome, `${p.nome} ${p.cognome}`.trim()]);
  const dopo = referti[0] ? { id: referti[0].id, data: referti[0].reviewed_at, testo: referti[0].testo_finale } : null;
  const prima = referti[1] ? { id: referti[1].id, data: referti[1].reviewed_at, testo: referti[1].testo_finale } : null;
  const e = confrontaReferti(prima, dopo, misureCliniche);
  return conTraccia(studioId, userId, patientId, {
    ...e, procedura: 'cambiamenti_ultima_visita', titolo: `Cosa è cambiato · ${nome}`,
    azioni: [{ etichetta: 'Scheda paziente', go: `#/patients/${p.id}` }, ...(dopo ? [{ etichetta: 'Ultimo referto', go: `#/review/${dopo.id}` }] : [])],
  }, t0);
}

/* ---------- richiami del mese ---------- */
export async function richiamiMese(studioId: string, userId?: string | null): Promise<Traccia> {
  const t0 = Date.now();
  const righe = await query<RichiamoIn>(
    `select r.id, 'referral' as tipo, r.follow_up_due::text as due, r.follow_up_months as mesi,
            p.cognome || ' ' || p.nome as paziente, d.nome as medico, r.quesito as motivo, p.id as patient_id
       from referrals r join patients p on p.id = r.patient_id left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 and r.follow_up_due is not null and r.follow_up_done_at is null and r.follow_up_due <= current_date + 30
     union all
     select a.id, 'appuntamento' as tipo, a.follow_up_due::text as due, a.follow_up_months as mesi,
            coalesce(a.paziente_nome, a.titolo, 'Paziente') as paziente, pr.nome as medico, a.motivo, null as patient_id
       from appointments a left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.follow_up_due is not null and a.follow_up_done_at is null and a.referral_id is null and a.follow_up_due <= current_date + 30
      order by due`,
    [studioId]);
  const [fatti] = await query<{ n: number }>(
    `select (select count(*) from referrals where studio_id = $1 and follow_up_done_at >= now() - interval '30 days')::int
          + (select count(*) from appointments where studio_id = $1 and follow_up_done_at >= now() - interval '30 days')::int as n`,
    [studioId]);
  const e = richiamiDelMese(righe, new Date(), Number(fatti?.n ?? 0));
  return conTraccia(studioId, userId, null, { ...e, procedura: 'richiami_mese', titolo: 'Richiami del mese', azioni: [{ etichetta: 'Cose da fare', go: '#/inbox' }] }, t0);
}

/* ---------- controllo prima della firma ---------- */
export async function controlloPrimaDellaFirma(studioId: string, bozzaId: string, userId?: string | null): Promise<Traccia | null> {
  const t0 = Date.now();
  const [b] = await query<{ id: string; stato: string; testo_finale: string | null; payload: any; campi_confermati: any; revisione_stato: any }>(
    `select id, stato, testo_finale, payload, campi_confermati, revisione_stato from referti_bozze where id = $1 and studio_id = $2`, [bozzaId, studioId]);
  if (!b) return null;
  const pl = b.payload ?? {};
  const testo = (b.testo_finale ?? pl.testo_corretto ?? '') as string;
  let issues: { cat: string; sev: string }[] = [];
  try { issues = costruisciRevisione({ testo, parole: Array.isArray(pl.parole) ? pl.parole : [], payload: pl }).issues.map((x) => ({ cat: x.cat, sev: x.sev })); } catch { issues = []; }
  const campi: Record<string, string> = {};
  for (const k of ['nome_paziente', 'data_nascita', 'medico_destinatario']) {
    const v = b.campi_confermati?.[k] ?? b.revisione_stato?.campi?.[k] ?? pl.campi_estratti?.[k];
    campi[k] = typeof v === 'string' ? v : '';
  }
  const st = b.revisione_stato ?? {};
  const manifesto = pl.manifesto && typeof pl.manifesto === 'object' ? pl.manifesto : {};
  const lett = testo ? await letteraPrecedente(studioId, b.id, { nome_paziente: campi.nome_paziente, data_nascita: campi.data_nascita }) : null;
  const e = controlloPreFirma({
    bozzaId: b.id, stato: b.stato, livelloVerifica: typeof manifesto.livello_verifica === 'string' ? manifesto.livello_verifica : '',
    fiducia: pl.fiducia && typeof pl.fiducia === 'object' ? pl.fiducia : null,
    issues, fatte: Array.isArray(st.fatte) ? st.fatte.filter((x: unknown) => typeof x === 'string') : [], chiuse: Number(st.chiuse ?? 0),
    campi, testoFinale: !!testo.trim(), letteraPrecedente: !!lett, dettatoConTerapia: dettatoConTerapia(testo),
  });
  const nome = campi.nome_paziente && campi.nome_paziente.toLowerCase() !== 'non indicato' ? campi.nome_paziente : 'paziente non indicato';
  return conTraccia(studioId, userId, null, {
    ...e, procedura: 'controllo_prefirma', titolo: `Controllo prima della firma · ${nome}`,
    azioni: [{ etichetta: 'Apri la revisione', go: `#/review/${b.id}` }],
  }, t0);
}

/* ---------- preparazione della giornata ---------- */
// Il briefing di tutti i pazienti in agenda oggi (o in una data), uno dopo
// l'altro con le stesse regole del singolo (`briefingGrezzo`: niente modello,
// i fatti nel grafo si aggiornano), le mancanze raccolte in cima. L'agenda del
// robot conosce i pazienti per nome: abbinamento per cognome+nome nei due
// ordini, come il resto della piattaforma.
export async function preparazioneGiornata(studioId: string, userId?: string | null, giorno?: string): Promise<Traccia> {
  const t0 = Date.now();
  const { briefingGrezzo } = await import('./briefing');
  const { aggregaGiornata } = await import('./procedure-regole');
  const data = giorno && /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? giorno : null;
  const appts = await query<{ id: string; starts_at: string; paziente_nome: string | null; titolo: string | null; motivo: string | null; medico: string | null; completed_at: string | null }>(
    `select a.id, a.starts_at::text, a.paziente_nome, a.titolo, a.motivo, pr.nome as medico, a.completed_at::text
       from appointments a left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.starts_at >= coalesce($2::date, current_date) and a.starts_at < coalesce($2::date, current_date) + 1
      order by a.starts_at`,
    [studioId, data]);
  const pazienti = await query<{ id: string; cognome: string; nome: string }>(`select id, cognome, nome from patients where studio_id = $1`, [studioId]);
  const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const perNome = new Map<string, string>();
  for (const p of pazienti) { perNome.set(slug(`${p.cognome} ${p.nome}`), p.id); perNome.set(slug(`${p.nome} ${p.cognome}`), p.id); }
  const voci = [];
  const cache = new Map<string, Awaited<ReturnType<typeof briefingGrezzo>>>();
  for (const a of appts) {
    const nome = (a.paziente_nome ?? a.titolo ?? 'Paziente').trim();
    const pid = perNome.get(slug(nome)) ?? null;
    let b = pid ? cache.get(pid) : undefined;
    if (pid && b === undefined) { b = await briefingGrezzo(studioId, pid); cache.set(pid, b); }
    const d = new Date(a.starts_at);
    voci.push({
      ora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      paziente: nome, medico: a.medico, motivo: a.motivo, patientId: pid,
      briefing: b ? { sezioni: b.briefing.sezioni, mancanti: b.briefing.mancanti, fonti: b.briefing.fonti } : null,
    });
  }
  const dd = data ? new Date(`${data}T12:00:00`) : new Date();
  const dataCh = `${String(dd.getDate()).padStart(2, '0')}.${String(dd.getMonth() + 1).padStart(2, '0')}.${dd.getFullYear()}`;
  const e = aggregaGiornata(voci, dataCh);
  return conTraccia(studioId, userId, null, { ...e, procedura: 'preparazione_giornata', titolo: `Preparazione della giornata · ${dataCh}`, azioni: [{ etichetta: 'Agenda', go: '#/agenda' }] }, t0);
}

/* ---------- lettere in ritardo ---------- */
// Referti confermati senza l'evento «word_scaricato» dopo 3 giorni, bozze
// ferme da 7, referral in stato «vista» da 10 giorni senza «referto_inviato».
// L'evento «word_scaricato» esiste dal 13.9.2026: i referti confermati prima
// non possono essere giudicati (risulterebbero tutti in ritardo).
const EVENTO_WORD_DAL = '2026-09-13';

async function lettereRitardoGrezzo(studioId: string) {
  const { lettereInRitardo } = await import('./procedure-regole');
  const lettere = await query<{ id: string; paziente: string; medico: string | null; confermata_il: string | null; dettata_il: string; stato: 'confermata' | 'bozza'; word_scaricato: boolean }>(
    `select b.id,
            coalesce(nullif(b.campi_confermati->>'nome_paziente', ''), nullif(b.payload->'campi_estratti'->>'nome_paziente', ''), 'paziente non indicato') as paziente,
            b.payload->'medico'->>'nome' as medico, b.reviewed_at::text as confermata_il, b.created_at::text as dettata_il, b.stato,
            exists (select 1 from referti_eventi e where e.bozza_id = b.id and e.azione = 'word_scaricato' and e.created_at >= coalesce(b.reviewed_at, b.created_at)) as word_scaricato
       from referti_bozze b
      where b.studio_id = $1 and b.stato in ('confermata', 'bozza') and b.tipo = 'referto'
        and coalesce((b.payload->>'ombra')::boolean, false) = false
        and coalesce(b.reviewed_at, b.created_at) >= now() - interval '120 days'
        and (b.stato = 'bozza' or b.reviewed_at >= $2::date)`,
    [studioId, EVENTO_WORD_DAL]);
  const viste = await query<{ id: string; paziente: string; vista_il: string; medico: string | null }>(
    `select r.id, p.cognome || ' ' || p.nome as paziente, coalesce(h.vista_il, r.updated_at)::text as vista_il, d.nome as medico
       from referrals r join patients p on p.id = r.patient_id left join referring_doctors d on d.id = r.referring_doctor_id
       left join lateral (select max(changed_at) as vista_il from referral_status_history where referral_id = r.id and to_status = 'vista') h on true
      where r.studio_id = $1 and r.status = 'vista'`,
    [studioId]);
  return lettereInRitardo(lettere, viste, new Date());
}

export async function lettereRitardo(studioId: string, userId?: string | null): Promise<Traccia> {
  const t0 = Date.now();
  const e = await lettereRitardoGrezzo(studioId);
  return conTraccia(studioId, userId, null, { ...e, procedura: 'lettere_ritardo', titolo: 'Lettere in ritardo', azioni: [{ etichetta: 'Referti', go: '#/reports' }] }, t0);
}

/* ---------- chiusura mensile ---------- */
// I numeri del mese (corrente, o «AAAA-MM») e ciò che resta aperto. Solo
// conteggi e id: nessun testo clinico entra nella traccia.
export async function chiusuraMese(studioId: string, userId?: string | null, mese?: string): Promise<Traccia> {
  const t0 = Date.now();
  const { chiusuraMensile } = await import('./procedure-regole');
  const m = mese && /^\d{4}-\d{2}$/.test(mese) ? `${mese}-01` : null;
  const [per] = await query<{ inizio: string; fine: string }>(`select date_trunc('month', coalesce($1::date, current_date))::date::text as inizio, (date_trunc('month', coalesce($1::date, current_date)) + interval '1 month')::date::text as fine`, [m]);
  const args = [studioId, per.inizio, per.fine];
  const [ref] = await query<{ dettati: number; confermati: number; scartati: number; aperti: number; mediana: number | null }>(
    `select count(*) filter (where created_at >= $2 and created_at < $3)::int as dettati,
            count(*) filter (where stato = 'confermata' and reviewed_at >= $2 and reviewed_at < $3)::int as confermati,
            count(*) filter (where stato = 'scartata' and reviewed_at >= $2 and reviewed_at < $3)::int as scartati,
            count(*) filter (where stato = 'bozza' and created_at >= $2 and created_at < $3)::int as aperti,
            (percentile_cont(0.5) within group (order by extract(epoch from (reviewed_at - created_at)) / 86400) filter (where stato = 'confermata' and reviewed_at >= $2 and reviewed_at < $3))::numeric as mediana
       from referti_bozze where studio_id = $1 and tipo = 'referto' and coalesce((payload->>'ombra')::boolean, false) = false`, args);
  const [rr] = await query<{ ricevute: number; chiuse: number }>(
    `select count(*) filter (where created_at >= $2 and created_at < $3)::int as ricevute,
            count(*) filter (where status = 'chiusa' and updated_at >= $2 and updated_at < $3)::int as chiuse
       from referrals where studio_id = $1`, args);
  const ferme = await query<{ id: string; paziente: string; da: string }>(
    `select r.id, p.cognome || ' ' || p.nome as paziente, r.created_at::text as da from referrals r join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.status in ('ricevuta', 'triage', 'da_prenotare') and r.appuntamento_at is null and r.created_at < now() - interval '30 days' order by r.created_at limit 50`, [studioId]);
  const [ric] = await query<{ fatti: number }>(
    `select (select count(*) from referrals where studio_id = $1 and follow_up_done_at >= $2 and follow_up_done_at < $3)::int
          + (select count(*) from appointments where studio_id = $1 and follow_up_done_at >= $2 and follow_up_done_at < $3)::int as fatti`, args);
  const scaduti = await query<{ id: string; paziente: string; due: string }>(
    `select r.id, p.cognome || ' ' || p.nome as paziente, r.follow_up_due::text as due from referrals r join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.follow_up_due is not null and r.follow_up_done_at is null and r.follow_up_due < current_date order by r.follow_up_due limit 50`, [studioId]);
  const [doc] = await query<{ n: number }>(`select count(*)::int as n from patient_documents where studio_id = $1 and uploaded_at >= $2 and uploaded_at < $3`, args);
  const senzaEcg = await query<{ id: string; paziente: string }>(
    `select distinct p.id, p.cognome || ' ' || p.nome as paziente from referrals r join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.follow_up_due is not null and r.follow_up_done_at is null
        and not exists (select 1 from patient_documents d where d.patient_id = p.id and d.uploaded_at >= now() - interval '12 months'
                          and (d.categoria = 'ecg' or lower(coalesce(d.nota, '') || ' ' || d.filename) ~ '(^|[^a-z])ecg([^a-z]|$)|elettrocardiogramm'))
      order by paziente limit 50`, [studioId]);
  const tracce = await query<{ procedura: string; n: number }>(`select procedura, count(*)::int as n from assistente_tracce where studio_id = $1 and created_at >= $2 and created_at < $3 group by 1 order by 2 desc`, args);
  const [diz] = await query<{ n: number }>(`select count(*)::int as n from referti_dizionario where studio_id = $1 and stato = 'confermata' and deciso_at >= $2 and deciso_at < $3`, args);
  const lettere = await lettereRitardoGrezzo(studioId);
  const nomeMese = new Date(`${per.inizio}T12:00:00`).toLocaleDateString('it-CH', { month: 'long', year: 'numeric' });
  const e = chiusuraMensile({
    mese: nomeMese, dettati: ref.dettati, confermati: ref.confermati, scartati: ref.scartati, ancoraAperti: ref.aperti,
    giorniMedianiConferma: ref.mediana === null ? null : Math.round(Number(ref.mediana) * 10) / 10,
    referralRicevute: rr.ricevute, referralChiuse: rr.chiuse, referralAperteSenzaAppuntamento: ferme,
    richiamiFatti: Number(ric.fatti), richiamiScaduti: scaduti, documentiCaricati: doc.n, senzaEcg,
    lettereInRitardo: lettere.mancanti.reduce((s, x) => s + (parseInt(x.testo, 10) || 0), 0),
    tracce, dizionarioConfermato: diz.n,
  });
  return conTraccia(studioId, userId, null, { ...e, procedura: 'chiusura_mensile', titolo: `Chiusura mensile · ${nomeMese}`, azioni: [{ etichetta: 'Cose da fare', go: '#/inbox' }, { etichetta: 'Referti', go: '#/reports' }] }, t0);
}
