import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { query, transazione } from './db';
import { leggiMetaCartella, type MetaSuDisco } from './imaging';
import { aggiornaGeometriaSerie } from './imaging-serie';
import { abbinaPaziente, raggruppa, type MetaMinima } from './imaging-ordina';
import { chiaveNas, relativoSicuro } from './imaging-esterno';

// Catalogare gli esami che stanno già sul NAS dello studio (8.10.2026,
// [[Piattaforma/Immagini]]). Il software Philips ha archiviato lì migliaia di
// ecocardiogrammi, una cartella per esame: troppi per stare sul disco del Mac
// (1,2 TB contro 237 GB liberi), e copiarli non serve. Qui si LEGGONO le
// intestazioni e si scrive nel database che cosa c'è e dov'è: `storage_key` =
// «nas:<percorso dentro la cartella condivisa>». Sul NAS non si scrive, non si
// sposta e non si cancella niente — mai.
//
// L'abbinamento al paziente resta quello severo di sempre (nome E data di
// nascita, una persona sola). Un esame d'archivio non abbinato NON diventa
// «da verificare»: sono migliaia, e quella lista serve a ciò che arriva oggi.
// Resta «disponibile» senza paziente, si trova con la ricerca e lo abbina chi
// lo apre. Nei log entrano solo conteggi.

type Paziente = { id: string; cognome: string; nome: string; data_nascita: string | null };
export type EsitoCartella = { stato: 'fatto' | 'vuota' | 'errore' | 'gia_fatta'; esami: number; nuovi: number; immagini: number; byte: number; abbinati: number; non_dicom: number; errore?: string };

export async function pazientiDelloStudio(studioId: string): Promise<Paziente[]> {
  return query<Paziente>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);
}

// Una cartella d'esame. `rel` è il percorso dentro la radice («2024/3f…»).
// Con `prova` non si scrive niente: si contano soltanto esami, immagini e abbinamenti.
export async function catalogaCartella(studioId: string, radice: string, rel: string, pazienti: Paziente[], opzioni: { prova?: boolean; rifai?: boolean } = {}): Promise<EsitoCartella> {
  const vuoto = { esami: 0, nuovi: 0, immagini: 0, byte: 0, abbinati: 0, non_dicom: 0 };
  const sicuro = relativoSicuro(rel);
  if (!sicuro) return { stato: 'errore', ...vuoto, errore: 'percorso_non_valido' };
  if (!opzioni.prova && !opzioni.rifai) {
    const [gia] = await query<{ stato: string }>(`select stato from imaging_catalogo where studio_id = $1 and cartella = $2 and stato in ('fatto', 'vuota')`, [studioId, sicuro]);
    if (gia) return { stato: 'gia_fatta', ...vuoto };
  }
  const letto = await leggiMetaCartella(path.join(radice, sicuro));
  const segna = async (stato: 'fatto' | 'vuota' | 'errore', e: Partial<EsitoCartella>, errore: string | null = null) => {
    if (opzioni.prova) return;
    await query(
      `insert into imaging_catalogo (studio_id, cartella, stato, esami, immagini, byte, errore) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (studio_id, cartella) do update set stato = excluded.stato, esami = excluded.esami, immagini = excluded.immagini, byte = excluded.byte, errore = excluded.errore, quando = now()`,
      [studioId, sicuro, stato, e.esami ?? 0, e.immagini ?? 0, e.byte ?? 0, errore]);
  };
  if ('errore' in letto) { await segna('errore', {}, letto.errore); return { stato: 'errore', ...vuoto, errore: letto.errore }; }
  if (!letto.file.length) { await segna('vuota', {}); return { stato: 'vuota', ...vuoto, non_dicom: letto.non_dicom }; }

  const lette = letto.file.map((m, indice) => ({ indice, meta: m as unknown as MetaMinima }));
  const file: MetaSuDisco[] = letto.file;
  const esami = raggruppa(lette);
  const esito: EsitoCartella = { stato: 'fatto', ...vuoto, non_dicom: letto.non_dicom };
  for (const e of esami) {
    const abbinato = abbinaPaziente(e.paziente_nome, e.paziente_nascita, pazienti);
    esito.esami++; if (abbinato.id) esito.abbinati++;
    const righe = e.serie.flatMap((s) => s.immagini.map((i) => ({ s, i, f: file[i.indice] })));
    const conChiave = righe.map((r) => ({ ...r, key: chiaveNas(`${sicuro}/${r.f.percorso}`) })).filter((r): r is typeof r & { key: string } => !!r.key);
    esito.immagini += conChiave.length; esito.byte += conChiave.reduce((n, r) => n + (Number(r.f.byte) || 0), 0);
    if (opzioni.prova) continue;

    const serieToccate: string[] = [];
    const nuovo = await transazione(async (q) => {
      // Se l'esame c'è già (arrivato dall'ecografo, o preso dall'archivio Philips) resta com'è:
      // si aggiungono solo le immagini che mancano. Il paziente già scelto non si tocca.
      const [esame] = await q<{ id: string; nuovo: boolean }>(
        `insert into imaging_esami (studio_id, patient_id, study_uid, accession, data_esame, ora_esame, descrizione, modalita, istituto, inviante,
                                    paziente_dicom, paziente_nascita, paziente_id_dicom, stato, origine)
         values ($1,$2,$3,nullif($4,''),nullif($5,'')::date,nullif($6,''),nullif($7,''),$8,nullif($9,''),nullif($10,''),nullif($11,''),nullif($12,'')::date,nullif($13,''),'disponibile','nas')
         on conflict (studio_id, study_uid) do update set updated_at = now()
         returning id, (xmax = 0) as nuovo`,
        [studioId, abbinato.id, e.study_uid, e.accession, e.data_esame, e.ora_esame, e.descrizione, e.modalita, e.istituto, e.inviante, e.paziente_nome, e.paziente_nascita, e.paziente_id]);
      for (const s of e.serie) {
        const [serie] = await q<{ id: string }>(
          `insert into imaging_serie (esame_id, serie_uid, modalita, descrizione, numero, parte_corpo) values ($1,$2,nullif($3,''),nullif($4,''),$5,nullif($6,''))
           on conflict (esame_id, serie_uid) do update set descrizione = coalesce(nullif(excluded.descrizione,''), imaging_serie.descrizione) returning id`,
          [esame.id, s.serie_uid, s.modalita, s.descrizione, s.numero || null, s.parte_corpo]);
        for (const r of conChiave.filter((x) => x.s === s)) {
          const i = r.i;
          await q(
            `insert into imaging_immagini (serie_id, sop_uid, numero, frame, righe, colonne, ww, wl, immagine, sop_class, storage_key, byte, calibrazione, geometria, sha256)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,nullif($10,''),$11,$12,$13,$14,null) on conflict (serie_id, sop_uid) do nothing`,
            [serie.id, i.sop_uid, i.numero || null, i.frame, i.righe || null, i.colonne || null, i.ww, i.wl, i.immagine, i.sop_class, r.key, Number(r.f.byte) || 0,
             i.calibrazione ? JSON.stringify(i.calibrazione) : null,
             // La geometria completa pesa un kilobyte a immagine, e qui le immagini sono più di un milione:
             // si tiene per TAC e RM (serve a ordinare le fette e ai piani ricostruiti); per le ecografie
             // basta la calibrazione, e la geometria si rilegge dal file se un giorno serve.
             i.geometria && e.modalita !== 'US' && !String(e.modalita).split(/[\\/, ]+/).every((m) => m === 'US') ? JSON.stringify(i.geometria) : null]);
        }
        await q(`update imaging_serie set n_immagini = (select count(*) from imaging_immagini where serie_id = $1) where id = $1`, [serie.id]);
        serieToccate.push(serie.id);
      }
      await q(
        `update imaging_esami set n_serie = (select count(*) from imaging_serie where esame_id = $1),
                n_immagini = (select coalesce(sum(n_immagini), 0) from imaging_serie where esame_id = $1),
                byte = (select coalesce(sum(i.byte), 0) from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1), updated_at = now()
          where id = $1`, [esame.id]);
      if (esame.nuovo) await q(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,null,'catalogato')`, [studioId, esame.id]);
      return esame.nuovo;
    });
    if (nuovo) esito.nuovi++;
    for (const sid of serieToccate) { try { await aggiornaGeometriaSerie(sid); } catch { /* si rifà alla prima apertura */ } }
  }
  await segna('fatto', esito);
  return esito;
}

export type Riepilogo = { cartelle: number; fatte: number; gia_fatte: number; vuote: number; errori: number; esami: number; nuovi: number; immagini: number; byte: number; abbinati: number; non_dicom: number; interrotto?: string };

// Tutte le cartelle d'esame sotto `sotto` (es. «2024»). Si può fermare e
// riprendere: le cartelle già catalogate si saltano. `avanza` riceve solo numeri.
export async function catalogaTutto(studioId: string, radice: string, sotto: string, opzioni: { prova?: boolean; limite?: number; rifai?: boolean; insieme?: number; avanza?: (r: Riepilogo, i: number) => void } = {}): Promise<Riepilogo> {
  const r: Riepilogo = { cartelle: 0, fatte: 0, gia_fatte: 0, vuote: 0, errori: 0, esami: 0, nuovi: 0, immagini: 0, byte: 0, abbinati: 0, non_dicom: 0 };
  const sicuro = relativoSicuro(sotto);
  if (!sicuro) return { ...r, interrotto: 'percorso_non_valido' };
  let nomi: string[];
  try { nomi = (await fs.readdir(path.join(radice, sicuro), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(); }
  catch { return { ...r, interrotto: 'archivio_non_collegato' }; }
  const pazienti = await pazientiDelloStudio(studioId);
  const elenco = opzioni.limite ? nomi.slice(0, opzioni.limite) : nomi;
  r.cartelle = elenco.length;
  // Qualche cartella insieme: leggere le intestazioni dal NAS è attesa di rete, non lavoro del Mac.
  const INSIEME = Math.max(1, Math.min(6, opzioni.insieme ?? 3));
  let prossima = 0, finite = 0, inFila = 0;
  const lavora = async () => {
    while (!r.interrotto) {
      const i = prossima++; if (i >= elenco.length) return;
      const e = await catalogaCartella(studioId, radice, `${sicuro}/${elenco[i]}`, pazienti, opzioni);
      if (e.stato === 'gia_fatta') r.gia_fatte++; else if (e.stato === 'vuota') r.vuote++; else if (e.stato === 'errore') r.errori++; else r.fatte++;
      r.esami += e.esami; r.nuovi += e.nuovi; r.immagini += e.immagini; r.byte += e.byte; r.abbinati += e.abbinati; r.non_dicom += e.non_dicom;
      // La cartella si è scollegata a metà: ci si ferma, non si segnano migliaia di errori.
      inFila = e.stato === 'errore' ? inFila + 1 : 0;
      if (inFila >= 5) { try { await fs.readdir(radice); } catch { r.interrotto = 'archivio_non_collegato'; return; } }
      finite++;
      if (opzioni.avanza && finite % 25 === 0) opzioni.avanza(r, finite);
    }
  };
  await Promise.all(Array.from({ length: INSIEME }, lavora));
  return r;
}

// Gli esami d'archivio senza paziente trovano la loro cartella quando la
// cartella nasce (8.10.2026): la piattaforma ha poche decine di pazienti, gli
// esami del NAS sono migliaia e di anni fa. Stessa regola severa di sempre —
// nome E data di nascita, una persona sola — riprovata a ogni giro.
export async function riabbinaEsami(studioId: string): Promise<number> {
  const esami = await query<{ id: string; paziente_dicom: string | null; nascita: string | null }>(
    `select id, paziente_dicom, paziente_nascita::text as nascita from imaging_esami
      where studio_id = $1 and patient_id is null and stato <> 'nascosto' and paziente_nascita is not null and coalesce(paziente_dicom, '') <> ''`, [studioId]);
  if (!esami.length) return 0;
  const pazienti = await pazientiDelloStudio(studioId);
  let n = 0;
  for (const e of esami) {
    const a = abbinaPaziente(e.paziente_dicom ?? '', e.nascita ?? '', pazienti);
    if (!a.id) continue;
    const [agg] = await query<{ id: string }>(`update imaging_esami set patient_id = $2, stato = 'disponibile', updated_at = now() where id = $1 and patient_id is null returning id`, [e.id, a.id]);
    if (agg) { n++; await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,null,'abbinato')`, [studioId, e.id]).catch(() => null); }
  }
  return n;
}

