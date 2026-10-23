import 'server-only';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logDocumento } from '../cartella';
import { query } from '../db';
import { dopoCaricamento } from '../documenti-ocr';
import { riabbinaPazienti } from '../pazienti-abbina';
import { validaAnagrafica } from '../pazienti-import';
import { deleteFile, putFile } from '../storage';
import { slugNome } from '../imaging-ordina';
import { abbinaCartella, abbinaScansione, categoriaDi, dividiNome, nascitaSicura, nomeDaFileSciolto, nomeDaScansione, quasiStesso, dataDaNomeFile, dateNelTesto, MAX_LETTERE_PAZIENTE, nascitaProposta, nomeDaCartella, radice, stessaLettera, tocca, type Formato } from './regole';
import { cartellePazienti, lettereSulDisco, mediciScelti, scansioniSulDisco, type SulDisco } from './scopri';
import { docxDaDoc, ocrPrimePagine, testoDi } from './testo';

// Le lettere della cartella comune (22.10.2026, [[Piattaforma/Cartella comune]]).
//
// Sulla cartella comune dello studio (`/Volumes/comune`, server Windows dello studio) le lettere stanno in
// «CentroCardio/Pazienti/Rapporti_<medico>/<Cognome Nome>/…». Si abbina la CARTELLA del paziente (nome della cartella
// e data di nascita trovata nelle lettere, una persona sola); abbinata, ogni sua lettera — anche quelle che
// arriveranno — va fra i documenti del paziente, come «lettera», con la data della lettera. Se no la cartella aspetta
// «da assegnare» e una persona sceglie. Un controllo ogni notte (alle 2), e a lotti finché resta lavoro: la prima
// volta sono migliaia di lettere. La cartella comune si legge e basta. Nei log solo conteggi.

// Senza COMUNE_LETTERE la cartella vera vale solo sul server vero (next start): un server di prova non la tocca mai.
export const radiceComune = (): string => process.env.COMUNE_LETTERE || (process.env.NODE_ENV === 'production' ? '/Volumes/comune/CentroCardio/Pazienti' : '');
const LOTTO = Number(process.env.COMUNE_LOTTO) || 150;
// Le cartelle cartacee scansionate (DocuWare, 22.10.2026, dallo studio: «metti anche quelle»): un PDF per paziente.
// Pesano (OCR delle prime pagine qui, di tutte dopo): poche per giro, solo quando la coda dell'OCR è quasi vuota, e dal
// controllo automatico solo la sera, la notte e nel fine settimana. COMUNE_SCANSIONI vuota le spegne.
export const radiceScansioni = (): string => process.env.COMUNE_SCANSIONI ?? (process.env.NODE_ENV === 'production' ? '/Volumes/comune/Lavori archivio DocuWare' : '');
export const MEDICO_SCANSIONI = 'Lavori archivio DocuWare';
export const SOTTOCARTELLA_SCANSIONI = 'Cartella cartacea scansionata';
const LOTTO_SCANSIONI = Number(process.env.COMUNE_LOTTO_SCANSIONI) || 6;
const MAX_BYTE_SCANSIONE = 300 * 1024 * 1024;
export const oraDelleScansioni = (d = new Date()): boolean => d.getDay() === 0 || d.getDay() === 6 || d.getHours() >= 20 || d.getHours() < 6;
// Creare i pazienti che in ReferralFlow non ci sono (decisione dello studio, 22.10.2026); COMUNE_CREA_PAZIENTI=0 lo spegne.
const creaPazienti = (): boolean => process.env.COMUNE_CREA_PAZIENTI !== '0';
const MAX_BYTE = 40 * 1024 * 1024;
const FERMO_MS = 60_000;      // un file scritto nell'ultimo minuto lo stanno ancora salvando: al prossimo giro
const MIME: Record<Formato, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', pdf: 'application/pdf',
};

export const PUO_COMUNE = {
  vedere: ['medico', 'assistente', 'segretaria', 'admin', 'tecnico'],
  assegnare: ['medico', 'assistente', 'segretaria', 'admin', 'tecnico'],
} as const;
export const puoComune = (ruolo: string | null | undefined, cosa: keyof typeof PUO_COMUNE): boolean => !!ruolo && (PUO_COMUNE[cosa] as readonly string[]).includes(ruolo);

type Paz = { id: string; cognome: string; nome: string; data_nascita: string | null; numero?: string | null; peso?: number };
type Cartella = { id: string; percorso: string; stato: string; patient_id: string | null; date_lette: string[]; motivo: string | null; nascita_proposta: string | null };
type Noto = { dimensione: string; modificato: Date; stato: string; sha256: string | null; documento_id: string | null };

export type EsitoGiro = { scansioni: number; scansioni_restano: boolean; creati: number; sciolte: number; cartelle: number; nuovi: number; caricati: number; doppioni: number; in_attesa: number; non_letti: number; abbinate: number; restano: boolean; cartella?: 'assente'; gia_in_corso?: boolean };

async function caricaDocumento(studioId: string, patientId: string, medico: string, f: SulDisco, dati: Buffer, dataLettera: string | null, prima: { documento_id: string | null } | null, scansione = false): Promise<string> {
  let corpo = dati, nome = f.nome, formato: Formato = f.formato;
  if (f.formato === 'doc') {
    const conv = await docxDaDoc(dati);
    if (conv) { corpo = conv; formato = 'docx'; nome = f.nome.replace(/\.doc$/i, '.docx'); }
  }
  const key = await putFile(corpo, MIME[formato], `.${formato}`);
  // La stessa lettera cambiata sulla cartella comune (corretta il giorno dopo): si sostituisce il file, niente doppione.
  if (prima?.documento_id) {
    const [vecchio] = await query<{ storage_key: string }>(`select storage_key from patient_documents where id = $1 and studio_id = $2`, [prima.documento_id, studioId]);
    if (vecchio) {
      await query(`update patient_documents set storage_key = $3, filename = $4 where id = $1 and studio_id = $2`, [prima.documento_id, studioId, key, nome]);
      await deleteFile(vecchio.storage_key).catch(() => null);
      await logDocumento(prima.documento_id, 'modifica', { studioId, dettaglio: 'nuova versione dalla cartella comune' });
      return prima.documento_id;
    }
  }
  const [doc] = await query<{ id: string }>(
    `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_at, cartella)
     values ($1, $2, $3, $4, $8, $5, coalesce($6::date::timestamptz + interval '12 hours', $7::timestamptz), $9) returning id`,
    // La scansione entra con l'ora di adesso: la coda dell'OCR va in ordine di caricamento, e non deve passare davanti.
    // Nella sottocartella giusta della scheda (23.10.2026): le lettere in «01_Rapporti», le scansioni intere a parte.
    scansione ? [studioId, patientId, nome, key, 'cartella cartacea scansionata (DocuWare)', null, new Date(), 'altro', SOTTOCARTELLA_SCANSIONI]
      : [studioId, patientId, nome, key, `dalla cartella comune (${medico.replace(/_/g, ' ')})`, dataLettera, f.modificato, categoriaDi(medico), categoriaDi(medico) === 'lettera' ? '01_Rapporti' : null]);
  await logDocumento(doc.id, 'caricamento', { studioId, dettaglio: 'dalla cartella comune' });
  if (formato === 'pdf') await dopoCaricamento(doc.id, corpo, '.pdf').catch(() => null);
  return doc.id;
}

let inCorso = false;
export async function giroComune(opzioni: { lotto?: number; fermoMs?: number; scansioni?: boolean } = {}): Promise<EsitoGiro> {
  const r: EsitoGiro = { scansioni: 0, scansioni_restano: false, creati: 0, sciolte: 0, cartelle: 0, nuovi: 0, caricati: 0, doppioni: 0, in_attesa: 0, non_letti: 0, abbinate: 0, restano: false };
  if (inCorso) return { ...r, gia_in_corso: true };
  inCorso = true;
  let giroId: string | null = null, studioId = '';
  try {
    const base = radiceComune();
    try { await fs.access(base); } catch { return { ...r, cartella: 'assente' }; }
    const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
    if (!studio) return r;
    studioId = studio.id;
    [{ id: giroId }] = await query<{ id: string }>(`insert into comune_giri (studio_id) values ($1) returning id`, [studioId]);
    const lotto = opzioni.lotto ?? LOTTO, fermo = opzioni.fermoMs ?? FERMO_MS;
    const cartelle = new Map((await query<Cartella>(`select id, percorso, stato, patient_id, date_lette, motivo, nascita_proposta::text from comune_cartelle where studio_id = $1`, [studioId])).map((c) => [c.percorso, c]));
    const noti = new Map<string, Noto>((await query<Noto & { percorso: string }>(`select percorso, dimensione::text, modificato, stato, sha256, documento_id from comune_file where studio_id = $1`, [studioId])).map((f) => [f.percorso, f]));
    // il «peso» sceglie fra due schede della stessa persona (unaPersona): numero di MediOnline, documenti, appuntamenti
    const pazienti = await query<Paz>(
      `select p.id, p.cognome, p.nome, p.data_nascita::text, p.numero,
              (case when p.numero is not null then 1000 else 0 end + coalesce(d.n, 0) + coalesce(a.n, 0))::int as peso
         from patients p
         left join (select patient_id, count(*) as n from patient_documents where studio_id = $1 group by 1) d on d.patient_id = p.id
         left join (select patient_id, count(*) as n from appointments where studio_id = $1 group by 1) a on a.patient_id = p.id
        where p.studio_id = $1`, [studioId]);
    const nomi = new Set(pazienti.map((p) => slugNome(`${p.cognome} ${p.nome}`)));
    const { trovate: cartelleTrovate, sciolte, sciolti } = await cartellePazienti(base, nomi, mediciScelti());
    r.sciolte = sciolte;
    type Unita = { rel: string; nome: string; medico: string; base: string; scansione?: SulDisco; sciolto?: SulDisco };
    const trovate: Unita[] = cartelleTrovate.map((t) => ({ ...t, base }));
    // Le lettere sciolte: ognuna un'unità come una cartella, col nome dal nome del file. Mai un paziente creato da un
    // nome di file (ci sono parole in più): solo nome e data di nascita, o il nome quasi uguale con la stessa nascita.
    // Un file nominato con un codice («L1234.doc») non dice di chi è: resta fuori, contato fra le sciolte.
    for (const f of sciolti) {
      const nome = nomeDaFileSciolto(f.nome);
      if (slugNome(nome).split(' ').filter((w) => w.length >= 2).length >= 2) trovate.push({ rel: f.rel, nome, medico: f.medico, base, sciolto: f });
    }
    // Le scansioni: ogni PDF è un'unità come una cartella, col nome dal nome del file.
    const rs = opzioni.scansioni === false ? '' : radiceScansioni();
    if (rs) {
      const sc = await scansioniSulDisco(rs).catch(() => null);
      if (sc) for (const f of sc.file) trovate.push({ rel: f.rel, nome: nomeDaScansione(f.nome), medico: MEDICO_SCANSIONI, base: sc.base, scansione: f });
    }
    const ocrInCoda = async () => (await query<{ n: number }>(`select count(*)::int as n from patient_documents where ocr_stato = 'da_fare'`))[0].n;
    let scansioniLette = 0;
    let letti = 0;
    // Di chi è la cartella: regola severa; se il nome non c'è in ReferralFlow, il nome quasi uguale con la stessa nascita,
    // o il paziente nuovo (22.10.2026, dallo studio: «quelli che non ci sono su ReferralFlow creali») — solo con una data
    // di nascita sicura (nel nome della cartella, o `nascitaSicura` nelle lettere appena lette). Senza, aspetta con la proposta.
    const decidi = async (c: Cartella, nomeCartella: string, date: string[], proposta: string | null, sicura: string | null = null, fileScansione: string | null = null, nonCreare = false): Promise<Cartella> => {
      const a = fileScansione ? abbinaScansione(fileScansione, date, pazienti) : abbinaCartella(nomeCartella, date, pazienti);
      let id = a.id, motivo: string | null = null;
      if (!id && a.motivo === 'nessuno' && creaPazienti()) {
        id = quasiStesso(nomeCartella, date, pazienti);
        if (id) motivo = 'nome_quasi';
        const nascita = nomeDaCartella(nomeCartella).nascita ?? sicura;
        const diviso = nonCreare ? null : dividiNome(nomeCartella);
        // una data di nascita da adulto (non il giorno di un esame scritto nel nome della cartella)
        if (!id && nascita && diviso && Number(nascita.slice(0, 4)) <= new Date().getFullYear() - 10) {
          const [gia] = await query<{ id: string }>(
            `select id from patients where studio_id = $1 and lower(btrim(cognome)) = lower($2) and lower(btrim(nome)) = lower($3) and data_nascita = $4::date limit 1`,
            [studioId, diviso.cognome, diviso.nome, nascita]);
          id = gia?.id ?? (await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, $2, $3, $4::date) returning id`,
            [studioId, diviso.cognome, diviso.nome, nascita]))[0].id;
          if (!gia) { r.creati++; pazienti.push({ id, cognome: diviso.cognome, nome: diviso.nome, data_nascita: nascita }); nomi.add(slugNome(`${diviso.cognome} ${diviso.nome}`)); }
          motivo = 'paziente_creato';
        }
      }
      if (id) {
        await query(`update comune_cartelle set stato = 'abbinata', patient_id = $2, motivo = $3, date_lette = $4 where id = $1`, [c.id, id, motivo, date]);
        r.abbinate++;
        return { ...c, stato: 'abbinata', patient_id: id, motivo, date_lette: date };
      }
      if (a.motivo !== c.motivo || date.length !== c.date_lette.length || (proposta && !c.nascita_proposta))
        await query(`update comune_cartelle set motivo = $2, date_lette = $3, nascita_proposta = coalesce(nascita_proposta, $4::date) where id = $1`, [c.id, a.motivo, date, proposta]);
      return { ...c, motivo: a.motivo, date_lette: date, nascita_proposta: c.nascita_proposta ?? proposta };
    };

    for (const { rel, nome: nomeCartella, medico, base, scansione, sciolto } of trovate) {
      let c = cartelle.get(rel);
      if (!c) {
        [c] = await query<Cartella>(
          `insert into comune_cartelle (studio_id, percorso, medico, nome_letto, stato, motivo) values ($1, $2, $3, $4, 'in_attesa', 'da_leggere')
           on conflict (studio_id, percorso) do update set vista_il = now() returning id, percorso, stato, patient_id, date_lette, motivo, nascita_proposta::text`,
          [studioId, rel, medico, nomeDaCartella(nomeCartella).nome.slice(0, 200)]);
        cartelle.set(rel, c);
      }
      if (c.stato === 'scartata' || c.stato === 'non_paziente') continue;
      r.cartelle++;
      // Una cartella che aspettava si riabbina con le date già lette (un paziente nato dopo, un'importazione).
      if (c.stato === 'in_attesa' && c.motivo !== 'da_leggere') {
        c = await decidi(c, nomeCartella, c.date_lette, c.nascita_proposta, null, scansione?.nome ?? null, !!sciolto); cartelle.set(rel, c);
      }
      const sulDisco = scansione ? [scansione] : sciolto ? [sciolto] : await lettereSulDisco(base, rel);
      // Centinaia di lettere in una cartella sola che non porta il nome di un paziente conosciuto: è un archivio.
      if (!scansione && !sciolto && sulDisco.length > MAX_LETTERE_PAZIENTE && c.stato !== 'abbinata' && !nomi.has(slugNome(nomeDaCartella(nomeCartella).nome))) {
        await query(`update comune_cartelle set stato = 'non_paziente', motivo = 'archivio', lettere = $2 where id = $1`, [c.id, sulDisco.length]);
        r.cartelle--; continue;
      }
      const daFare = sulDisco.filter((f) => {
        const k = noti.get(f.rel);
        if (Date.now() - f.modificato.getTime() < fermo) return false;
        if (!k) return true;
        if (Number(k.dimensione) !== f.dimensione || k.modificato.getTime() !== f.modificato.getTime()) return true;
        return c!.stato === 'abbinata' && k.stato === 'in_attesa';
      });
      if (!daFare.length) continue;
      let lot: SulDisco[];
      if (scansione) {
        // Poche per giro, e solo se l'OCR dei documenti è quasi in pari (le scansioni senza testo vanno in coda lì).
        if (scansioniLette >= LOTTO_SCANSIONI || (await ocrInCoda()) >= 3) { r.scansioni_restano = true; continue; }
        scansioniLette++; lot = daFare;
      } else {
        if (letti >= lotto) { r.restano = true; continue; }
        lot = daFare.slice(0, lotto - letti);
        if (lot.length < daFare.length) r.restano = true;
        letti += lot.length;
      }

      // Letti i file nuovi: impronta, testo, date.
      const letture: { f: SulDisco; dati: Buffer | null; sha: string; testo: string }[] = [];
      for (const f of lot) {
        if (f.dimensione === 0 || f.dimensione > (scansione ? MAX_BYTE_SCANSIONE : MAX_BYTE)) { letture.push({ f, dati: null, sha: '', testo: '' }); continue; }
        const dati = await fs.readFile(path.join(base, f.rel)).catch(() => null);
        let testo = dati ? await testoDi(dati, f.formato) : '';
        // Una scansione senza testo: le prime pagine con Tesseract, per sapere di chi è.
        if (dati && scansione && testo.replace(/\s+/g, '').length < 200) testo = `${testo}\n${await ocrPrimePagine(dati)}`;
        letture.push({ f, dati, sha: dati ? createHash('sha256').update(dati).digest('hex') : '', testo });
      }
      const date = new Set(c.date_lette);
      for (const l of letture) for (const d of dateNelTesto(l.testo)) date.add(d);
      const dateLette = [...date].sort().slice(-400);

      if (c.stato !== 'abbinata') {
        const proposta = c.nascita_proposta ?? letture.map((l) => nascitaProposta(l.testo, nomeDaCartella(nomeCartella).nome)).find(Boolean) ?? null;
        const primaLettera = sulDisco.map((f) => dataDaNomeFile(f.nome) ?? f.modificato.toISOString().slice(0, 10)).sort()[0] ?? null;
        const sicura = letture.map((l) => nascitaSicura(l.testo, nomeDaCartella(nomeCartella).nome, primaLettera)).find(Boolean) ?? null;
        c = await decidi(c, nomeCartella, dateLette, sicura ?? proposta, sicura, scansione?.nome ?? null, !!sciolto);
        cartelle.set(rel, c);
      } else {
        await query(`update comune_cartelle set date_lette = $2 where id = $1`, [c.id, dateLette]);
      }

      const segna = async (f: SulDisco, stato: string, campi: { sha?: string; motivo?: string; doc?: string | null; data?: string | null } = {}) => {
        await query(
          `insert into comune_file (studio_id, cartella_id, percorso, dimensione, modificato, sha256, stato, motivo, documento_id, data_lettera)
           values ($1, $2, $3, $4, $5, nullif($6, ''), $7, nullif($8, ''), $9, $10::date)
           on conflict (studio_id, percorso) do update set dimensione = excluded.dimensione, modificato = excluded.modificato, sha256 = excluded.sha256,
             stato = excluded.stato, motivo = excluded.motivo, documento_id = coalesce(excluded.documento_id, comune_file.documento_id),
             data_lettera = excluded.data_lettera, quando = now()`,
          [studioId, c!.id, f.rel, f.dimensione, f.modificato, campi.sha ?? '', stato, campi.motivo ?? '', campi.doc ?? null, campi.data ?? null]);
        noti.set(f.rel, { dimensione: String(f.dimensione), modificato: f.modificato, stato, sha256: campi.sha ?? null, documento_id: campi.doc ?? null });
      };

      // Il testo delle lettere Word della cartella, per riconoscere un PDF che è la stessa lettera (letto solo se serve).
      let testiWord: string[] | null = null;
      const word = async () => {
        if (testiWord) return testiWord;
        testiWord = letture.filter((l) => l.f.formato !== 'pdf' && l.testo).map((l) => l.testo);
        if (!testiWord.length) for (const f of sulDisco.filter((x) => x.formato !== 'pdf').slice(0, 15)) {
          const b = await fs.readFile(path.join(base, f.rel)).catch(() => null);
          if (b) testiWord.push(await testoDi(b, f.formato));
        }
        return testiWord;
      };
      const radiciWord = new Set(sulDisco.filter((x) => x.formato !== 'pdf').map((x) => `${path.dirname(x.rel)}|${radice(x.nome)}`));
      const caricatiSha = new Set((await query<{ sha256: string }>(`select sha256 from comune_file where cartella_id = $1 and stato = 'caricato' and sha256 is not null`, [c.id])).map((x) => x.sha256));

      for (const l of letture) {
        const dataLettera = dataDaNomeFile(l.f.nome);
        r.nuovi++;
        if (!l.dati) { await segna(l.f, 'non_letto', { motivo: l.f.dimensione ? 'troppo_grande' : 'vuoto' }); r.non_letti++; continue; }
        if (c.stato !== 'abbinata') { await segna(l.f, 'in_attesa', { sha: l.sha, data: dataLettera }); r.in_attesa++; continue; }
        const prima = noti.get(l.f.rel);
        if (prima?.stato === 'caricato' && prima.sha256 === l.sha) { await segna(l.f, 'caricato', { sha: l.sha, doc: prima.documento_id, data: dataLettera }); continue; }
        if (caricatiSha.has(l.sha) && !prima?.documento_id) { await segna(l.f, 'doppione', { sha: l.sha, motivo: 'stesso_file' }); r.doppioni++; continue; }
        if (l.f.formato === 'pdf' && (radiciWord.has(`${path.dirname(l.f.rel)}|${radice(l.f.nome)}`) || (l.testo.trim().length > 200 && (await word()).some((t) => stessaLettera(l.testo, t))))) {
          await segna(l.f, 'doppione', { sha: l.sha, motivo: 'pdf_del_word' }); r.doppioni++; continue;
        }
        if (l.f.formato !== 'pdf' && !l.testo.trim()) { await segna(l.f, 'non_letto', { sha: l.sha, motivo: 'non_si_legge' }); r.non_letti++; continue; }
        const doc = await caricaDocumento(studioId, c.patient_id!, medico, l.f, l.dati, scansione ? null : dataLettera, prima?.documento_id ? { documento_id: prima.documento_id } : null, !!scansione);
        caricatiSha.add(l.sha);
        await segna(l.f, 'caricato', { sha: l.sha, doc, data: scansione ? null : dataLettera });
        r.caricati++;
        if (scansione) r.scansioni++;
      }
      await query(`update comune_cartelle set lettere = $2, vista_il = now() where id = $1`, [c.id, sulDisco.length]);
    }
    if (r.creati) { try { await riabbinaPazienti(studioId); } catch { /* best-effort */ } }
    await query(
      `update comune_giri set finito = now(), cartelle = $2, nuovi = $3, caricati = $4, doppioni = $5, in_attesa = $6, non_letti = $7, abbinate = $8, restano = $9, sciolte = $10 where id = $1`,
      [giroId, r.cartelle, r.nuovi, r.caricati, r.doppioni, r.in_attesa, r.non_letti, r.abbinate, r.restano, r.sciolte]);
    scansioniRestano = r.scansioni_restano;
    if (r.nuovi || r.abbinate) console.log(`[comune] lettere: nuove ${r.nuovi} · caricate ${r.caricati} · doppioni ${r.doppioni} · da assegnare ${r.in_attesa} · non lette ${r.non_letti} · cartelle abbinate ${r.abbinate}${r.creati ? ` · pazienti creati ${r.creati}` : ''}${r.scansioni ? ` · scansioni caricate ${r.scansioni}` : ''}${r.restano ? ' · ne restano' : ''}${r.scansioni_restano ? ' · restano scansioni' : ''}`);
    return r;
  } catch (e: any) {
    if (giroId) await query(`update comune_giri set finito = now(), errore = $2, restano = true where id = $1`, [giroId, String(e?.code ?? e?.name ?? 'errore').slice(0, 60)]).catch(() => null);
    console.error(`[comune] giro: ${e?.code ?? e?.name ?? 'errore'}`);
    return { ...r, restano: true };
  } finally { inCorso = false; }
}

// Il controllo automatico: ogni due minuti si guarda se tocca (alle 2 di notte, o se il giro prima ha lasciato lavoro).
// Acceso solo sul server vero (next start) o con COMUNE_LETTERE_GIRO=acceso; COMUNE_LETTERE_GIRO=spento lo spegne.
// I server di prova (next dev, DB demo) non toccano mai la cartella comune.
let timer: NodeJS.Timeout | null = null;
let scansioniRestano = true;
export function avviaComune(): void {
  const acceso = process.env.COMUNE_LETTERE_GIRO === 'acceso' || (process.env.NODE_ENV === 'production' && process.env.COMUNE_LETTERE_GIRO !== 'spento');
  if (!acceso || timer) return;
  let assenteDal = 0;
  const passo = async () => {
    try {
      const [s] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
      if (!s) return;
      const [u] = await query<{ finito: Date | null; restano: boolean; ultimo: Date | null }>(
        `select (select max(finito) from comune_giri where studio_id = $1 and not restano and errore is null) as ultimo,
                coalesce((select restano from comune_giri where studio_id = $1 and finito is not null order by iniziato desc limit 1), false) as restano, null as finito`, [s.id]);
      // Le scansioni vanno avanti da sole la sera, la notte e nel fine settimana; di giorno solo le lettere.
      const scansioni = oraDelleScansioni() && scansioniRestano;
      if (!tocca(new Date(), u?.ultimo ?? null, !!u?.restano) && !scansioni) return;
      // La cartella non è collegata: si riprova, ma lo si dice una volta all'ora.
      if (assenteDal && Date.now() - assenteDal < 10 * 60_000) return;
      const e = await giroComune({ scansioni: oraDelleScansioni() });
      if (e.cartella === 'assente') { if (!assenteDal || Date.now() - assenteDal > 3_600_000) console.log('[comune] cartella comune non collegata'); assenteDal = Date.now(); }
      else assenteDal = 0;
    } catch (e: any) { console.error(`[comune] passo: ${e?.code ?? e?.name ?? 'errore'}`); }
  };
  timer = setInterval(() => { void passo(); }, 2 * 60_000);
  setTimeout(() => { void passo(); }, 30_000);
}

// ── La pagina ────────────────────────────────────────────────────────────────
export async function stato(studioId: string) {
  const collegata = await fs.access(radiceComune()).then(() => true, () => false);
  const giri = await query<{ iniziato: string; finito: string | null; sciolte: number; nuovi: number; caricati: number; doppioni: number; in_attesa: number; non_letti: number; abbinate: number; restano: boolean; errore: string | null }>(
    `select to_char(iniziato, 'YYYY-MM-DD"T"HH24:MI') as iniziato, to_char(finito, 'YYYY-MM-DD"T"HH24:MI') as finito, sciolte, nuovi, caricati, doppioni, in_attesa, non_letti, abbinate, restano, errore
       from comune_giri where studio_id = $1 and (nuovi > 0 or abbinate > 0 or errore is not null or iniziato > now() - interval '2 days') order by iniziato desc limit 8`, [studioId]);
  const [conti] = await query<Record<string, number>>(
    `select count(*) filter (where stato = 'abbinata')::int as abbinate, count(*) filter (where stato = 'abbinata' and motivo = 'paziente_creato')::int as creati,
            count(*) filter (where stato = 'abbinata' and motivo = 'nome_quasi')::int as quasi, count(*) filter (where stato = 'in_attesa')::int as in_attesa,
            count(*) filter (where stato = 'scartata')::int as scartate, count(*) filter (where stato = 'non_paziente')::int as non_pazienti,
            (select count(*)::int from comune_file where studio_id = $1 and stato = 'caricato') as caricati,
            (select count(*)::int from comune_file where studio_id = $1 and stato = 'doppione') as doppioni,
            (select count(*)::int from comune_file where studio_id = $1 and stato = 'non_letto') as non_letti
       from comune_cartelle where studio_id = $1 and (($2::text[] is null and medico ~* '^rap+orti') or cardinality($2::text[]) = 0 or medico = any($2) or medico = 'Lavori archivio DocuWare')`, [studioId, mediciScelti()]);
  const attesa = await query<{ id: string; percorso: string; medico: string; nome_letto: string; motivo: string | null; lettere: number; nascita_proposta: string | null }>(
    `select id, percorso, medico, nome_letto, motivo, lettere, nascita_proposta::text from comune_cartelle
      where studio_id = $1 and stato = 'in_attesa' and motivo is distinct from 'da_leggere' and (($2::text[] is null and medico ~* '^rap+orti') or cardinality($2::text[]) = 0 or medico = any($2) or medico = 'Lavori archivio DocuWare')
      order by medico, nome_letto limit 8000`, [studioId, mediciScelti()]);
  const recenti = await query<{ patient_id: string; cognome: string; nome: string; filename: string; data_lettera: string | null; quando: string; documento_id: string }>(
    `select c.patient_id, p.cognome, p.nome, d.filename, f.data_lettera::text, to_char(f.quando, 'YYYY-MM-DD"T"HH24:MI') as quando, f.documento_id
       from comune_file f join comune_cartelle c on c.id = f.cartella_id join patients p on p.id = c.patient_id join patient_documents d on d.id = f.documento_id
      where f.studio_id = $1 and f.stato = 'caricato' and f.quando > now() - interval '7 days' order by f.quando desc limit 150`, [studioId]);
  const nonPazienti = await query<{ id: string; percorso: string }>(
    `select id, percorso from comune_cartelle where studio_id = $1 and stato = 'non_paziente' and (($2::text[] is null and medico ~* '^rap+orti') or cardinality($2::text[]) = 0 or medico = any($2) or medico = 'Lavori archivio DocuWare') order by percorso limit 50`, [studioId, mediciScelti()]);
  return { radice: radiceComune(), medici: mediciScelti(), collegata, giri, conti, attesa, recenti, non_pazienti: nonPazienti };
}

type Esito<T> = T | { errore: string; stato: number };
const err = (errore: string, stato = 400) => ({ errore, stato });

// Una cartella che aspetta va al paziente scelto: le sue lettere entrano al giro subito dopo.
export async function assegna(studioId: string, userId: string, id: string, patientId: string): Promise<Esito<{ ok: true }>> {
  const [p] = await query<{ id: string }>(`select id from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!p) return err('Paziente non trovato.', 404);
  const [c] = await query<{ id: string }>(
    `update comune_cartelle set stato = 'abbinata', patient_id = $3, motivo = null, deciso_da = $4, deciso_il = now()
      where id = $1 and studio_id = $2 and stato in ('in_attesa', 'scartata', 'non_paziente') returning id`, [id, studioId, patientId, userId]);
  if (!c) return err('Cartella non trovata, o già assegnata.', 404);
  console.log('[comune] cartella assegnata a mano');
  void giroComune({ fermoMs: 0 }).catch(() => null);
  return { ok: true };
}

export async function creaCartellaEAssegna(studioId: string, userId: string, id: string, d: { cognome?: unknown; nome?: unknown; data_nascita?: unknown }): Promise<Esito<{ ok: true; patient_id: string; nuova: boolean }>> {
  const { dati, errori } = validaAnagrafica({ cognome: d.cognome, nome: d.nome, data_nascita: d.data_nascita });
  if (!dati.cognome || !dati.nome) return err('Cognome e nome sono obbligatori.');
  if (errori.data_nascita || !dati.data_nascita) return err('Scrivi la data di nascita (31.12.1950).');
  const [c] = await query<{ id: string }>(`select id from comune_cartelle where id = $1 and studio_id = $2 and stato <> 'abbinata'`, [id, studioId]);
  if (!c) return err('Cartella non trovata, o già assegnata.', 404);
  const [gia] = await query<{ id: string }>(
    `select id from patients where studio_id = $1 and lower(btrim(cognome)) = lower($2) and lower(btrim(nome)) = lower($3) and data_nascita = $4::date limit 1`,
    [studioId, dati.cognome, dati.nome, dati.data_nascita]);
  let pid = gia?.id ?? '';
  if (!pid) [{ id: pid }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, $2, $3, $4::date) returning id`, [studioId, dati.cognome, dati.nome, dati.data_nascita]);
  const r = await assegna(studioId, userId, id, pid);
  if ('errore' in r) return r;
  if (!gia) { try { await riabbinaPazienti(studioId); } catch { /* best-effort */ } }
  return { ok: true, patient_id: pid, nuova: !gia };
}

// «Non è un paziente» / «non caricare»: le sue lettere restano solo sulla cartella comune.
export async function scarta(studioId: string, userId: string, id: string): Promise<Esito<{ ok: true }>> {
  const [c] = await query<{ id: string }>(`update comune_cartelle set stato = 'scartata', deciso_da = $3, deciso_il = now() where id = $1 and studio_id = $2 and stato = 'in_attesa' returning id`, [id, studioId, userId]);
  return c ? { ok: true } : err('Cartella non trovata, o già decisa.', 404);
}
