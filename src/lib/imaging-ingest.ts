import 'server-only';
import { randomUUID } from 'node:crypto';
import { query, transazione } from './db';
import { putFileAtKey } from './storage';
import { leggiMeta, leggiMisure } from './imaging';
import { abbinaPaziente, raggruppa, type MetaMinima } from './imaging-ordina';
import type { MisuraDicom } from './imaging';

// I referti strutturati: è lì che l'apparecchio scrive le misure.
// 1.2.840.10008.5.1.4.1.1.88.* = la famiglia degli Structured Report.
const SOP_SR = ['1.2.840.10008.5.1.4.1.1.88'];

// Far entrare le immagini, da qualunque parte arrivino (18.9.2026).
//
// Due porte, una strada sola: i file trascinati nella pagina e quelli spediti
// dall'ecografo con un C-STORE finiscono qui. Se fossero due strade, una delle
// due prenderebbe polvere — e sarebbe quella che nessuno guarda mentre scrive
// il codice, cioè quella degli apparecchi.

export type Riepilogo = { esami: string[]; nuovi: number; immagini: number; scartati: number };

export async function ingestaDicom(
  studioId: string,
  file: Buffer[],
  opzioni: { origine: 'import' | 'rete' | 'portale'; userId?: string | null }
): Promise<Riepilogo> {
  // Si leggono tutti PRIMA di scrivere qualcosa: un CD porta anche DICOMDIR,
  // indici e file di servizio, e quelli non sono esami.
  const lette: { indice: number; meta: MetaMinima }[] = [];
  const buoni: Buffer[] = [];
  let scartati = 0;
  for (const b of file) {
    const meta = await leggiMeta(b);
    if ('errore' in meta) { scartati++; continue; }
    lette.push({ indice: buoni.length, meta: meta as unknown as MetaMinima });
    buoni.push(b);
  }
  if (!lette.length) return { esami: [], nuovi: 0, immagini: 0, scartati };

  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(
    `select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);

  const esami = raggruppa(lette);
  const ids: string[] = []; let nuovi = 0; let immagini = 0;

  for (const e of esami) {
    const abbinato = abbinaPaziente(e.paziente_nome, e.paziente_nascita, pazienti);
    // I file su disco PRIMA del database: una riga senza il suo file è un
    // esame che non si apre; un file senza riga è solo spazio occupato, e la
    // volta dopo lo si ritrova.
    const chiavi = new Map<string, string>();
    for (const s of e.serie) {
      for (const i of s.immagini) {
        const cartella = e.study_uid.replace(/[^0-9.]/g, '').slice(0, 64) || randomUUID();
        const key = `imaging/${studioId}/${cartella}/${randomUUID()}.dcm`;
        await putFileAtKey(key, buoni[i.indice], 'application/dicom');
        chiavi.set(i.sop_uid, key);
      }
    }

    const id = await transazione(async (q) => {
      const [esame] = await q<{ id: string; nuovo: boolean }>(
        `insert into imaging_esami (studio_id, patient_id, study_uid, accession, data_esame, ora_esame, descrizione,
                                    modalita, istituto, inviante, paziente_dicom, paziente_nascita, paziente_id_dicom,
                                    stato, origine, caricato_da)
         values ($1,$2,$3,nullif($4,''),nullif($5,'')::date,nullif($6,''),nullif($7,''),$8,nullif($9,''),nullif($10,''),
                 nullif($11,''),nullif($12,'')::date,nullif($13,''),$14,$16,$15)
         on conflict (studio_id, study_uid) do update set updated_at = now()
         returning id, (xmax = 0) as nuovo`,
        [studioId, abbinato.id, e.study_uid, e.accession, e.data_esame, e.ora_esame, e.descrizione, e.modalita,
         e.istituto, e.inviante, e.paziente_nome, e.paziente_nascita, e.paziente_id,
         abbinato.id ? 'disponibile' : 'da_verificare', opzioni.userId ?? null, opzioni.origine]);
      if (esame.nuovo) nuovi++;
      for (const s of e.serie) {
        const [serie] = await q<{ id: string }>(
          `insert into imaging_serie (esame_id, serie_uid, modalita, descrizione, numero, parte_corpo)
           values ($1,$2,nullif($3,''),nullif($4,''),$5,nullif($6,''))
           on conflict (esame_id, serie_uid) do update set descrizione = coalesce(nullif(excluded.descrizione,''), imaging_serie.descrizione)
           returning id`, [esame.id, s.serie_uid, s.modalita, s.descrizione, s.numero || null, s.parte_corpo]);
        for (const i of s.immagini) {
          const [img] = await q<{ id: string }>(
            `insert into imaging_immagini (serie_id, sop_uid, numero, frame, righe, colonne, ww, wl, immagine, sop_class, storage_key, byte)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,nullif($10,''),$11,$12)
             on conflict (serie_id, sop_uid) do nothing returning id`,
            [serie.id, i.sop_uid, i.numero || null, i.frame, i.righe || null, i.colonne || null, i.ww, i.wl,
             i.immagine, i.sop_class, chiavi.get(i.sop_uid)!, buoni[i.indice].length]);
          if (img) immagini++;
        }
        await q(`update imaging_serie set n_immagini = (select count(*) from imaging_immagini where serie_id = $1) where id = $1`, [serie.id]);
      }
      await q(
        `update imaging_esami set
           n_serie = (select count(*) from imaging_serie where esame_id = $1),
           n_immagini = (select coalesce(sum(n_immagini), 0) from imaging_serie where esame_id = $1),
           byte = (select coalesce(sum(i.byte), 0) from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1),
           updated_at = now()
         where id = $1`, [esame.id]);
      return esame.id;
    });
    // Le misure fatte dall'apparecchio, dai suoi referti strutturati. Si
    // riscrivono ogni volta: se l'esame viene reimportato, valgono le ultime.
    const conSr = e.serie.flatMap((s) => s.immagini.filter((i) => SOP_SR.some((p) => (i.sop_class || '').startsWith(p))));
    if (conSr.length) {
      const misure: { m: MisuraDicom; ordine: number }[] = [];
      for (const i of conSr) {
        for (const m of await leggiMisure(buoni[i.indice])) misure.push({ m, ordine: misure.length });
      }
      if (misure.length) {
        await transazione(async (q) => {
          await q(`delete from imaging_misure where esame_id = $1`, [id]);
          for (const { m, ordine } of misure) {
            await q(`insert into imaging_misure (esame_id, gruppo, nome, valore, unita, ordine) values ($1,nullif($2,''),$3,$4,nullif($5,''),$6)`,
              [id, m.gruppo, m.nome, m.valore, m.unita, ordine]);
          }
        });
      }
    }
    ids.push(id);
    try {
      await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,$3,$4)`,
        [studioId, id, opzioni.userId ?? null, opzioni.origine === 'rete' ? 'ricevuto' : 'importato']);
    } catch (e) { console.error(`[imaging] registro accessi: ${(e as Error)?.message ?? e}`); }
  }
  return { esami: ids, nuovi, immagini, scartati };
}
