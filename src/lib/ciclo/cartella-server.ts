import 'server-only';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logDocumento } from '../cartella';
import { query } from '../db';
import { dopoCaricamento } from '../documenti-ocr';
import { abbinaPaziente } from '../imaging-ordina';
import { riabbinaPazienti } from '../pazienti-abbina';
import { validaAnagrafica } from '../pazienti-import';
import { testoDelPdf } from '../pressione/cartella-server';
import { deleteFile, getFile, putFile } from '../storage';
import { decodificaGdt, ecgDaGdt } from './gdt';
import { daNomeFile, daTesto, nomeDocumento } from './referto';

// Prova da sforzo: i referti PDF della ciclo (9.10.2026, [[Piattaforma/Prova da sforzo]]).
//
// Sul PC della ciclo una copia nascosta (robocopy, mac/ciclo-windows/) porta ogni PDF che
// CubeStress crea nella cartella «Ciclo da leggere/referti» del Mac. Qui, ogni quindici secondi:
// - il PDF si legge; se nome e data di nascita combaciano con UNA persona, diventa un documento
//   «Ciclo» della sua cartella; se no aspetta «da assegnare» nella pagina Immagini;
// - lo stesso nome di file (porta ora dell'esame e ora del referto) non entra due volte;
// - i file NON si spostano: se sparissero mentre l'originale è ancora sul PC, la copia li
//   rimanderebbe ogni minuto. Si tolgono dopo sette giorni, quando sul PC non ci sono più da un pezzo.
// Nei log solo conteggi.
export const cartellaCiclo = (): string => process.env.CICLO_CARTELLA || path.join(os.homedir(), 'Ciclo da leggere', 'referti');
// L'ECG a riposo (touchECG) scrive da sé, per ogni esame, un GDT e un PDF in «Ciclo da leggere/ecg».
export const cartellaEcg = (): string => process.env.ECG_CARTELLA || path.join(os.homedir(), 'Ciclo da leggere', 'ecg');
const ATTESA_PDF_MS = 10 * 60_000;      // il GDT arriva un attimo prima del suo PDF: lo si aspetta, ma non per sempre
export type Tipo = 'ciclo' | 'ecg';
const FERMO_DA_MS = 8_000;
const GIORNI = 7;
const MAX_BYTE = 30 * 1024 * 1024;

export type EsitoGiroCiclo = { visti: number; documenti: number; in_attesa: number; non_letti: number; gia_visti: number; cartella?: 'assente' };

async function comeDocumento(studioId: string, patientId: string, pdf: Buffer, key: string | null, esame: string | null, userId: string | null, tipo: Tipo = 'ciclo'): Promise<string> {
  const chiave = key ?? await putFile(pdf, 'application/pdf', '.pdf');
  const da = tipo === 'ecg' ? 'arrivato dall’ECG' : 'arrivato dalla ciclo';
  const [doc] = await query<{ id: string }>(
    `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`, [studioId, patientId, nomeDocumento(esame, tipo), chiave, tipo, da, userId]);
  await logDocumento(doc.id, 'caricamento', { studioId, userId: userId ?? undefined, dettaglio: tipo === 'ecg' ? 'dall’ECG' : 'dalla ciclo' });
  await dopoCaricamento(doc.id, pdf, '.pdf').catch(() => null);
  return doc.id;
}

let inCorso = false;
export async function giroCiclo(opzioni: { fermoDaMs?: number; giorniTenuti?: number } = {}): Promise<EsitoGiroCiclo> {
  const r: EsitoGiroCiclo = { visti: 0, documenti: 0, in_attesa: 0, non_letti: 0, gia_visti: 0 };
  if (inCorso) return r;
  inCorso = true;
  try {
    const base = cartellaCiclo();
    let nomi: string[];
    try { nomi = (await fs.readdir(base, { withFileTypes: true })).filter((d) => d.isFile() && /\.pdf$/i.test(d.name) && !d.name.startsWith('.')).map((d) => d.name).sort(); }
    catch { return { ...r, cartella: 'assente' }; }
    if (!nomi.length) return r;
    const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
    if (!studio) return r;
    const gia = new Set((await query<{ nome_file: string }>(`select nome_file from ciclo_arrivi where studio_id = $1 and nome_file = any($2)`, [studio.id, nomi])).map((x) => x.nome_file));
    let pazienti: { id: string; cognome: string; nome: string; data_nascita: string | null }[] | null = null;
    const limite = Date.now() - (opzioni.giorniTenuti ?? GIORNI) * 86_400_000;
    for (const nome of nomi) {
      const p = path.join(base, nome);
      let st; try { st = await fs.stat(p); } catch { continue; }
      if (gia.has(nome)) {
        r.gia_visti++;
        // Già dentro: il file si toglie quando è vecchio (l'originale sul PC non c'è più da giorni).
        // (zero giorni, nelle prove: subito — l'ora di un file ha i decimi di millisecondo e può risultare un soffio dopo «adesso»)
        if (opzioni.giorniTenuti === 0 || Math.max(st.mtimeMs, st.ctimeMs) < limite) await fs.rm(p, { force: true }).catch(() => null);
        continue;
      }
      // Lo stanno ancora copiando? La copia conserva l'ora dell'originale: si guarda anche quando è stato scritto QUI.
      const attesa = opzioni.fermoDaMs ?? FERMO_DA_MS;
      if (attesa > 0 && Date.now() - Math.max(st.mtimeMs, st.ctimeMs) < attesa) continue;
      if (r.visti >= 20) break;
      r.visti++;
      const segna = (campi: { sha: string; stato: string; motivo?: string; key?: string | null; esame?: string | null; referto?: string | null; nomeLetto?: string; nascita?: string | null; pid?: string | null; doc?: string | null }) => query(
        `insert into ciclo_arrivi (studio_id, nome_file, sha256, storage_key, esame_il, referto_il, nome_letto, nascita_letta, stato, motivo, patient_id, documento_id, deciso_il)
         values ($1,$2,$3,$4,$5::timestamp,$6::timestamp,nullif($7,''),$8::date,$9,nullif($10,''),$11,$12, case when $9 = 'assegnato' then now() else null end)
         on conflict (studio_id, nome_file) do nothing`,
        [studio.id, nome.slice(0, 240), campi.sha, campi.key ?? null, campi.esame ?? null, campi.referto ?? null, campi.nomeLetto ?? '', campi.nascita ?? null, campi.stato, campi.motivo ?? '', campi.pid ?? null, campi.doc ?? null]);
      if (st.size === 0 || st.size > MAX_BYTE) { await segna({ sha: '', stato: 'non_letto', motivo: st.size ? 'troppo_grande' : 'vuoto' }); r.non_letti++; continue; }
      let pdf: Buffer;
      try { pdf = await fs.readFile(p); } catch { continue; }
      const sha = createHash('sha256').update(pdf).digest('hex');
      const dalNome = daNomeFile(nome);
      const dalTesto = pdf.subarray(0, 5).toString('latin1') === '%PDF-' ? daTesto(await testoDelPdf(pdf)) : null;
      if (!dalTesto) { await segna({ sha, stato: 'non_letto', motivo: 'non_referto', esame: dalNome?.esame, referto: dalNome?.referto }); r.non_letti++; continue; }
      const esame = dalNome?.esame ?? dalTesto.esame, referto = dalNome?.referto ?? null;
      const intero = `${dalTesto.cognome} ${dalTesto.nome}`.trim();
      pazienti ??= await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studio.id]);
      const abbinato = intero && dalTesto.nascita ? abbinaPaziente(intero, dalTesto.nascita, pazienti) : { id: null, motivo: intero ? 'senza_nascita' : 'senza_nome' };
      if (abbinato.id) {
        const doc = await comeDocumento(studio.id, abbinato.id, pdf, null, esame, null);
        await segna({ sha, stato: 'assegnato', esame, referto, nomeLetto: intero, nascita: dalTesto.nascita, pid: abbinato.id, doc });
        r.documenti++;
      } else {
        const key = await putFile(pdf, 'application/pdf', '.pdf');
        await segna({ sha, stato: 'in_attesa', motivo: abbinato.motivo, key, esame, referto, nomeLetto: intero, nascita: dalTesto.nascita });
        r.in_attesa++;
      }
    }
    if (r.visti) console.log(`[ciclo] referti: file ${r.visti} · in cartella ${r.documenti} · da assegnare ${r.in_attesa} · non letti ${r.non_letti}`);
    return r;
  } finally { inCorso = false; }
}

// ── ECG a riposo ─────────────────────────────────────────────────────────────
// Per ogni esame touchECG scrive un GDT (chi è, quando) e il tracciato in PDF. Qui i file li
// scrive direttamente il programma, non una copia: letti, si TOLGONO dalla cartella (il PDF è
// nell'archivio dei file, l'originale resta nell'archivio di touchECG). Lo stesso esame rimandato
// ha lo stesso nome di PDF: non entra due volte.
export type EsitoGiroEcg = { visti: number; documenti: number; in_attesa: number; non_letti: number; gia_visti: number; aspettano_pdf: number; cartella?: 'assente' };
let ecgInCorso = false;
export async function giroEcg(opzioni: { fermoDaMs?: number; attesaPdfMs?: number } = {}): Promise<EsitoGiroEcg> {
  const r: EsitoGiroEcg = { visti: 0, documenti: 0, in_attesa: 0, non_letti: 0, gia_visti: 0, aspettano_pdf: 0 };
  if (ecgInCorso) return r;
  ecgInCorso = true;
  try {
    const base = cartellaEcg();
    let tutti: string[];
    try { tutti = (await fs.readdir(base, { withFileTypes: true })).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => d.name); }
    catch { return { ...r, cartella: 'assente' }; }
    const gdt = tutti.filter((n) => /\.gdt$/i.test(n)).sort();
    if (!gdt.length) return r;
    const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
    if (!studio) return r;
    let pazienti: { id: string; cognome: string; nome: string; data_nascita: string | null }[] | null = null;
    const attesa = opzioni.fermoDaMs ?? FERMO_DA_MS, attesaPdf = opzioni.attesaPdfMs ?? ATTESA_PDF_MS;
    const via = async (...nomi: string[]) => { for (const n of nomi) await fs.rm(path.join(base, n), { force: true }).catch(() => null); };
    for (const nome of gdt) {
      const p = path.join(base, nome);
      let st; try { st = await fs.stat(p); } catch { continue; }
      const eta = Date.now() - Math.max(st.mtimeMs, st.ctimeMs);
      if (attesa > 0 && eta < attesa) continue;
      if (r.visti >= 20) break;
      let grezzo: Buffer;
      try { grezzo = await fs.readFile(p); } catch { continue; }
      const e = st.size > 0 && st.size < 2 * 1024 * 1024 ? ecgDaGdt(decodificaGdt(grezzo)) : null;
      if (!e) {
        // Non è un esame ECG con un PDF: si lascia lì una settimana (per chi volesse capire), poi via. Niente righe: non c'è niente da assegnare.
        if (eta > GIORNI * 86_400_000) await via(nome);
        continue;
      }
      const nomePdf = tutti.find((n) => n.toLowerCase() === e.pdf.toLowerCase());
      if (!nomePdf) {
        // Il PDF non c'è (ancora): si aspetta; passato il tempo il GDT da solo non serve a niente.
        if (attesaPdf > 0 && eta < attesaPdf) { r.aspettano_pdf++; continue; }
        await via(nome); r.non_letti++; continue;
      }
      const pp = path.join(base, nomePdf);
      let sp; try { sp = await fs.stat(pp); } catch { continue; }
      if (attesa > 0 && Date.now() - Math.max(sp.mtimeMs, sp.ctimeMs) < attesa) continue;
      r.visti++;
      const [gia] = await query<{ id: string }>(`select id from ciclo_arrivi where studio_id = $1 and nome_file = $2`, [studio.id, nomePdf.slice(0, 240)]);
      if (gia) { await via(nome, nomePdf); r.gia_visti++; continue; }       // lo stesso esame, rimandato
      if (sp.size === 0 || sp.size > MAX_BYTE) { await via(nome); r.non_letti++; continue; }
      let pdf: Buffer;
      try { pdf = await fs.readFile(pp); } catch { continue; }
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') { await via(nome); r.non_letti++; continue; }
      const sha = createHash('sha256').update(pdf).digest('hex');
      const intero = `${e.cognome} ${e.nome}`.trim();
      pazienti ??= await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studio.id]);
      const abbinato = intero && e.nascita ? abbinaPaziente(intero, e.nascita, pazienti) : { id: null, motivo: intero ? 'senza_nascita' : 'senza_nome' };
      const scrivi = (stato: string, altro: { motivo?: string; key?: string | null; pid?: string | null; doc?: string | null }) => query(
        `insert into ciclo_arrivi (studio_id, tipo, nome_file, sha256, storage_key, esame_il, nome_letto, nascita_letta, stato, motivo, patient_id, documento_id, deciso_il)
         values ($1,'ecg',$2,$3,$4,$5::timestamp,nullif($6,''),$7::date,$8,nullif($9,''),$10,$11, case when $8 = 'assegnato' then now() else null end)
         on conflict (studio_id, nome_file) do nothing`,
        [studio.id, nomePdf.slice(0, 240), sha, altro.key ?? null, e.esame, intero, e.nascita, stato, altro.motivo ?? '', altro.pid ?? null, altro.doc ?? null]);
      if (abbinato.id) {
        const doc = await comeDocumento(studio.id, abbinato.id, pdf, null, e.esame, null, 'ecg');
        await scrivi('assegnato', { pid: abbinato.id, doc });
        r.documenti++;
      } else {
        const key = await putFile(pdf, 'application/pdf', '.pdf');
        await scrivi('in_attesa', { motivo: abbinato.motivo, key });
        r.in_attesa++;
      }
      await via(nome, nomePdf);
    }
    if (r.visti || r.non_letti) console.log(`[ecg] esami: ${r.visti} · in cartella ${r.documenti} · da assegnare ${r.in_attesa} · già visti ${r.gia_visti} · non letti ${r.non_letti}`);
    return r;
  } finally { ecgInCorso = false; }
}

type Esito<T> = T | { errore: string; stato?: number };
export async function elencoCiclo(studioId: string) {
  const arrivi = await query<{ id: string; tipo: Tipo; esame_il: string | null; referto_il: string | null; nome_letto: string | null; nascita_letta: string | null; motivo: string | null; quando: string }>(
    `select id, tipo, to_char(esame_il, 'YYYY-MM-DD"T"HH24:MI') as esame_il, to_char(referto_il, 'YYYY-MM-DD"T"HH24:MI') as referto_il, nome_letto, nascita_letta::text, motivo, quando::text
       from ciclo_arrivi where studio_id = $1 and stato = 'in_attesa' order by quando desc limit 50`, [studioId]);
  const [c] = await query<{ totale: number; in_cartella: number; ultimo: string | null }>(
    `select count(*) filter (where stato in ('in_attesa', 'assegnato'))::int as totale, count(*) filter (where stato = 'assegnato')::int as in_cartella,
            to_char(max(quando) filter (where stato in ('in_attesa', 'assegnato')), 'YYYY-MM-DD"T"HH24:MI') as ultimo
       from ciclo_arrivi where studio_id = $1`, [studioId]);
  // Cognome e nome già separati dal referto («Cognome, Nome» non si conserva: si ripropone dalla prima parola).
  return { arrivi: arrivi.map((a) => { const [cg, ...resto] = (a.nome_letto ?? '').split(' '); return { ...a, proposta: a.nome_letto ? { cognome: cg, nome: resto.join(' ') } : null }; }), conta: c ?? { totale: 0, in_cartella: 0, ultimo: null } };
}
export async function pdfArrivo(studioId: string, id: string): Promise<Buffer | null> {
  const [a] = await query<{ storage_key: string | null }>(`select storage_key from ciclo_arrivi where id = $1 and studio_id = $2 and stato = 'in_attesa'`, [id, studioId]);
  if (!a?.storage_key) return null;
  try { return (await getFile(a.storage_key)).body; } catch { return null; }
}
export async function assegnaCiclo(studioId: string, userId: string, id: string, patientId: string): Promise<Esito<{ ok: true; documento: string }>> {
  const [a] = await query<{ storage_key: string | null; esame_il: string | null; tipo: Tipo }>(`select storage_key, tipo, to_char(esame_il, 'YYYY-MM-DD"T"HH24:MI:SS') as esame_il from ciclo_arrivi where id = $1 and studio_id = $2 and stato = 'in_attesa'`, [id, studioId]);
  if (!a || !a.storage_key) return { errore: 'Referto non trovato, o già assegnato.', stato: 404 };
  const [p] = await query<{ id: string }>(`select id from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!p) return { errore: 'Paziente non trovato.', stato: 404 };
  let pdf: Buffer;
  try { pdf = (await getFile(a.storage_key)).body; } catch { return { errore: 'Il file del referto non si trova più.', stato: 410 }; }
  const doc = await comeDocumento(studioId, patientId, pdf, a.storage_key, a.esame_il, userId, a.tipo);
  await query(`update ciclo_arrivi set stato = 'assegnato', patient_id = $2, documento_id = $3, storage_key = null, deciso_da = $4, deciso_il = now() where id = $1`, [id, patientId, doc, userId]);
  return { ok: true, documento: doc };
}
// La persona non ha ancora la cartella: nasce qui coi dati confermati da chi assegna (mai un doppione).
export async function creaCartellaCiclo(studioId: string, userId: string, id: string, c: { cognome?: unknown; nome?: unknown; data_nascita?: unknown }): Promise<Esito<{ ok: true; documento: string; patient_id: string; nuova: boolean }>> {
  const [a] = await query<{ id: string }>(`select id from ciclo_arrivi where id = $1 and studio_id = $2 and stato = 'in_attesa'`, [id, studioId]);
  if (!a) return { errore: 'Referto non trovato, o già assegnato.', stato: 404 };
  const { dati, errori } = validaAnagrafica({ cognome: c.cognome, nome: c.nome, data_nascita: c.data_nascita });
  if (!dati.cognome || !dati.nome) return { errore: 'Cognome e nome sono obbligatori.' };
  if (errori.data_nascita || !dati.data_nascita) return { errore: 'Scrivi la data di nascita (31.12.1950).' };
  const [gia] = await query<{ id: string }>(
    `select id from patients where studio_id = $1 and lower(btrim(cognome)) = lower($2) and lower(btrim(nome)) = lower($3) and data_nascita = $4::date limit 1`,
    [studioId, dati.cognome, dati.nome, dati.data_nascita]);
  let pid = gia?.id ?? '';
  if (!pid) {
    const [p] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, $2, $3, $4::date) returning id`, [studioId, dati.cognome, dati.nome, dati.data_nascita]);
    pid = p.id;
    console.log(`[ciclo] cartella ${pid.slice(0, 8)} creata da un referto arrivato`);
  }
  const r = await assegnaCiclo(studioId, userId, id, pid);
  if ('errore' in r) return r;
  if (!gia) { try { await riabbinaPazienti(studioId); } catch { /* best-effort */ } }
  return { ok: true, documento: r.documento, patient_id: pid, nuova: !gia };
}
export async function scartaCiclo(studioId: string, userId: string, id: string): Promise<Esito<{ ok: true }>> {
  const [a] = await query<{ storage_key: string | null }>(`update ciclo_arrivi set stato = 'scartato', deciso_da = $3, deciso_il = now() where id = $1 and studio_id = $2 and stato = 'in_attesa' returning storage_key`, [id, studioId, userId]);
  if (!a) return { errore: 'Referto non trovato, o già deciso.', stato: 404 };
  if (a.storage_key) { await deleteFile(a.storage_key).catch(() => null); await query(`update ciclo_arrivi set storage_key = null where id = $1`, [id]); }
  return { ok: true };
}

// Il giro parte col server e ripassa ogni quindici secondi; si spegne con CICLO_CARTELLA_GIRO=spento.
let avviato = false;
export function avviaCiclo(): void {
  if (avviato) return; avviato = true;
  setInterval(() => { giroCiclo().catch((e) => console.error(`[ciclo] cartella: ${e?.code ?? e?.name ?? 'errore'}`)); }, 15_000).unref?.();
  setInterval(() => { giroEcg().catch((e) => console.error(`[ecg] cartella: ${e?.code ?? e?.name ?? 'errore'}`)); }, 15_000).unref?.();
}
