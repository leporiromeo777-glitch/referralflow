import { documentoBriefing, type DocumentoProcedura } from './procedure-documento';
import 'server-only';
import { pool, query } from './db';
import { estraiTerapia, letteraPrecedente } from './referti-lettera';
import { generaOllamaEsito, ollamaAttivo } from './ollama';
import { costruisciRevisione } from './prototipo-revisione';
import { apriTraccia, chiudiTraccia, type PassoTraccia } from './tracce';
import { costruisciBriefing, dataCh, fattiDalBriefing, testoBriefing, type AppuntamentoIn, type Briefing, type BozzaIn, type DocumentoIn, type ReferralIn, type RefertoPrecedente } from './briefing-regole';

// Procedura «briefing pre-visita» (13.9.2026): il CODICE legge la cartella
// (referral, questionario, ultimo referto e terapia, documenti, agenda,
// sospesi), applica le condizioni (ECG entro 12 mesi, eco entro 24, lettera
// precedente), scrive i fatti nel grafo (pazienti_fatti) e la traccia
// (assistente_tracce). Il modello LOCALE, se c'è, scrive solo una sintesi di
// poche frasi SOPRA il briefing già deciso; se non c'è, la risposta è il
// testo del codice. Nessun contenuto nei log.
export const PROCEDURA_BRIEFING = 'briefing_previsita';
const MODELLO = process.env.PROTOTIPO_LLM || 'gemma3:12b';

export type EsitoBriefing = {
  procedura: string;
  titolo: string;
  azioni: { etichetta: string; go?: string; href?: string }[];
  paziente: { id: string; nome: string; nascita: string };
  sintesi: string | null;
  testo: string;
  sezioni: Briefing['sezioni'];
  mancanti: Briefing['mancanti'];
  fonti: Briefing['fonti'];
  documento: DocumentoProcedura;   // la forma da documento (21.9.2026)
  traccia: { id: number; passi: PassoTraccia[]; modello: string | null; durata_ms: number; fatti: number };
};

export type BriefingGrezzo = { paziente: { id: string; nome: string; nascita: string }; briefing: Briefing; testo: string; fatti: number };

// La parte senza modello e senza traccia: letture, regole, fatti nel grafo.
// La usa anche la «preparazione della giornata», un paziente dopo l'altro.
export async function briefingGrezzo(studioId: string, patientId: string): Promise<BriefingGrezzo | null> {
  const [p] = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(
    `select id, cognome, nome, data_nascita::text from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!p) return null;
  const nomeCompleto = `${p.cognome} ${p.nome}`.trim();
  const nascitaCh = dataCh(p.data_nascita);

  const documenti = await query<DocumentoIn>(
    `select id, filename, nota, categoria, uploaded_at::text from patient_documents where patient_id = $1 and studio_id = $2 order by uploaded_at desc limit 200`,
    [patientId, studioId]);
  const referral = await query<ReferralIn>(
    `select r.id, r.quesito, r.urgenza::text, r.status::text, d.nome as medico, r.created_at::text, r.follow_up_due::text, r.follow_up_done_at::text, r.questionario
       from referrals r left join referring_doctors d on d.id = r.referring_doctor_id
      where r.patient_id = $1 and r.studio_id = $2 order by r.created_at desc limit 50`,
    [patientId, studioId]);
  // L'agenda (robot MediOnline) conosce il paziente solo per nome: cognome e
  // nome devono comparire entrambi nel campo dell'appuntamento.
  const appuntamenti = await query<AppuntamentoIn>(
    `select a.id, a.starts_at::text, a.motivo, pr.nome as medico, a.completed_at::text
       from appointments a left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.paziente_nome is not null
        and lower(a.paziente_nome) like '%' || lower($2) || '%' and lower(a.paziente_nome) like '%' || lower($3) || '%'
      order by a.starts_at`,
    [studioId, p.cognome, p.nome]);

  // Ultimo referto confermato della catena (nome nei due ordini, data di
  // nascita se nota); altrimenti l'ultima lettera .docx/.txt in cartella.
  const [conf] = await query<{ id: string; testo_finale: string; reviewed_at: string | null }>(
    `select id, testo_finale, reviewed_at::text from referti_bozze
      where studio_id = $1 and stato = 'confermata' and tipo = 'referto' and testo_finale is not null
        and coalesce((payload->>'ombra')::boolean, false) = false
        and (patient_id = $5::uuid or (patient_id is null and lower(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', '')) in (lower($2), lower($3))))
        and ($4 = '' or coalesce(campi_confermati->>'data_nascita', payload->'campi_estratti'->>'data_nascita', '') in ('', $4))
      order by reviewed_at desc nulls last limit 1`,
    [studioId, nomeCompleto, `${p.nome} ${p.cognome}`.trim(), nascitaCh, p.id]);
  let refertoPrecedente: RefertoPrecedente = null;
  if (conf) {
    refertoPrecedente = { id: conf.id, data: conf.reviewed_at, terapia: estraiTerapia(conf.testo_finale), fonte: 'referto' };
  } else {
    const lett = await letteraPrecedente(studioId, '00000000-0000-0000-0000-000000000000', { nome_paziente: nomeCompleto, data_nascita: nascitaCh });
    if (lett && lett.id.startsWith('documento:')) {
      const docId = lett.id.slice('documento:'.length);
      const d = documenti.find((x) => x.id === docId);
      refertoPrecedente = { id: docId, data: d?.uploaded_at ?? null, terapia: estraiTerapia(lett.testo), fonte: 'documento' };
    }
  }

  // Bozze della catena ancora da rivedere per questo paziente.
  const bozzeGrezze = await query<{ id: string; created_at: string; testo_finale: string | null; payload: any }>(
    `select id, created_at::text, testo_finale, payload from referti_bozze
      where studio_id = $1 and stato = 'bozza' and coalesce((payload->>'ombra')::boolean, false) = false
        and (patient_id = $4::uuid or (patient_id is null and lower(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', '')) in (lower($2), lower($3))))
      order by created_at desc limit 5`,
    [studioId, nomeCompleto, `${p.nome} ${p.cognome}`.trim(), p.id]);
  const bozze: BozzaIn[] = bozzeGrezze.map((b) => {
    const pl = b.payload ?? {};
    let critiche = 0;
    try { critiche = costruisciRevisione({ testo: (b.testo_finale ?? pl.testo_corretto ?? '') as string, parole: Array.isArray(pl.parole) ? pl.parole : [], payload: pl }).riepilogo.crit; } catch { critiche = 0; }
    return { id: b.id, created_at: b.created_at, critiche };
  });

  const ingresso = { oggi: new Date(), documenti, referral, appuntamenti, refertoPrecedente, bozze };
  const briefing = costruisciBriefing(ingresso);
  const testo = testoBriefing(nomeCompleto, briefing);

  // Il grafo: i fatti di questa procedura vengono riscritti a ogni corsa.
  const fatti = fattiDalBriefing(briefing, ingresso);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`delete from pazienti_fatti where studio_id = $1 and patient_id = $2 and procedura = $3`, [studioId, patientId, PROCEDURA_BRIEFING]);
    for (const f of fatti) {
      await client.query(
        `insert into pazienti_fatti (studio_id, patient_id, relazione, oggetto, dettaglio, fonte_tipo, fonte_id, data_fatto, procedura)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [studioId, patientId, f.relazione, f.oggetto.slice(0, 500), JSON.stringify(f.dettaglio), f.fonte_tipo, f.fonte_id, f.data_fatto, PROCEDURA_BRIEFING]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    console.error(`[briefing] scrittura fatti fallita paziente=${patientId.slice(0, 8)} n=${fatti.length}: ${(e as Error)?.message ?? e}`);
  } finally {
    client.release();
  }

  return { paziente: { id: p.id, nome: nomeCompleto, nascita: nascitaCh }, briefing, testo, fatti: fatti.length };
}

export async function briefingPreVisita(studioId: string, patientId: string, opzioni: { userId?: string | null; conModello?: boolean } = {}): Promise<EsitoBriefing | null> {
  const t0 = Date.now();
  const grezzo = await briefingGrezzo(studioId, patientId);
  if (!grezzo) return null;
  const { briefing, testo } = grezzo;
  const fatti = { length: grezzo.fatti };
  const nomeCompleto = grezzo.paziente.nome;
  const nascitaCh = grezzo.paziente.nascita;
  const p = { id: grezzo.paziente.id };

  // Sintesi del modello locale, sopra il briefing già deciso dal codice.
  const passi: PassoTraccia[] = [...briefing.passi];
  let sintesi: string | null = null;
  let modelloUsato: string | null = null;
  if (opzioni.conModello !== false && (await ollamaAttivo())) {
    const prompt = `Ti chiami Cleo e sei l'assistente di uno studio medico svizzero. Qui sotto c'è un briefing pre-visita già compilato dal sistema. Scrivi in italiano, in 3 o 4 frasi asciutte, la sintesi per chi riceve il paziente: prima le cose da segnalare al medico, poi motivo della visita e terapia. Usa SOLO i dati del briefing, non aggiungere nulla, non dare consigli clinici, non ripetere l'elenco degli esami.

BRIEFING:
${testo}

SINTESI:`;
    const esito = await generaOllamaEsito(prompt, { modello: MODELLO, timeoutMs: 90_000 });
    modelloUsato = MODELLO;
    if (esito.ok) {
      sintesi = esito.testo.trim();
      passi.push({ passo: 'Sintesi del modello locale sul briefing del codice', esito: 'ok', fonti: [], nota: `${MODELLO} in ${(esito.ms / 1000).toFixed(1)} s` });
    } else {
      passi.push({ passo: 'Sintesi del modello locale sul briefing del codice', esito: 'vuoto', fonti: [], nota: `${MODELLO}: ${esito.causa}` });
    }
  } else {
    passi.push({ passo: 'Sintesi del modello locale', esito: 'vuoto', fonti: [], nota: opzioni.conModello === false ? 'non richiesta' : 'modello non raggiungibile: risposta del codice' });
  }
  passi.push({ passo: 'Fatti scritti nel grafo del paziente', esito: fatti.length ? 'ok' : 'vuoto', fonti: [], nota: `${fatti.length} fatti` });

  const durata = Date.now() - t0;
  const tracciaId = await apriTraccia({
    studioId, userId: opzioni.userId, patientId, procedura: PROCEDURA_BRIEFING, obiettivo: `Briefing pre-visita`,
    passi, fonti: briefing.fonti, mancanti: briefing.mancanti, modello: modelloUsato,
  });
  await chiudiTraccia(tracciaId, { durataMs: durata, caratteri: (sintesi ?? '').length + testo.length });
  console.log(`[briefing] paziente=${patientId.slice(0, 8)} passi=${passi.length} fonti=${briefing.fonti.length} mancanti=${briefing.mancanti.length} fatti=${fatti.length} modello=${modelloUsato ?? '-'} ${durata}ms traccia=${tracciaId}`);

  return {
    procedura: PROCEDURA_BRIEFING, titolo: `Briefing pre-visita · ${nomeCompleto}${nascitaCh ? ` · ${nascitaCh}` : ''}`,
    azioni: [{ etichetta: 'Scheda paziente', go: `#/patients/${p.id}` }],
    paziente: { id: p.id, nome: nomeCompleto, nascita: nascitaCh },
    sintesi, testo, sezioni: briefing.sezioni, mancanti: briefing.mancanti, fonti: briefing.fonti,
    documento: documentoBriefing({ titolo: `Briefing pre-visita · ${nomeCompleto}${nascitaCh ? ` · nato/a il ${nascitaCh}` : ''}`, sezioni: briefing.sezioni, mancanti: briefing.mancanti }),
    traccia: { id: tracciaId, passi, modello: modelloUsato, durata_ms: durata, fatti: fatti.length },
  };
}
