import 'server-only';
import { query } from '../db';
import { putFile } from '../storage';
import { logDocumento } from '../cartella';
import { abbinaPaziente } from '../imaging-ordina';
import { riabbinaPazienti } from '../pazienti-abbina';
import { validaAnagrafica } from '../pazienti-import';
import { impronta, ora, validaInvio, type Notte, type Totale } from './regole';

// Saturazione notturna (22.10.2026, [[Piattaforma/Saturazione notturna]]): ricezione dal generatore dei referti,
// elenco, dettaglio, «da assegnare». Stessa regola severa della pressione: nome E data di nascita, una persona sola;
// se no l'invio aspetta e una persona sceglie. Non si indovina mai. Nei log solo conteggi.

// Chi fa che cosa (applicato dal server): vedere chi cura; assegnare, creare la cartella e scartare chi carica i file
// dei pazienti. Il tecnico tiene in piedi il sistema e non vede dati clinici (non ha la sezione nei ruoli di cura).
export const PUO_SAT = {
  vedere: ['medico', 'assistente', 'segretaria', 'admin'],
  assegnare: ['medico', 'assistente', 'segretaria', 'admin'],
} as const;
export const puoSat = (ruolo: string | null | undefined, cosa: keyof typeof PUO_SAT): boolean => !!ruolo && (PUO_SAT[cosa] as readonly string[]).includes(ruolo);

type Esito<T> = T | { errore: string; stato: number };
const err = (errore: string, stato = 400) => ({ errore, stato });
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const;

async function allega(studioId: string, patientId: string, userId: string | null, r: { key: string; nome: string }): Promise<string> {
  const [doc] = await query<{ id: string }>(
    `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by)
     values ($1, $2, $3, $4, 'referto', 'rapporto del sonno dal generatore (O2Ring)', $5) returning id`, [studioId, patientId, r.nome, r.key, userId]);
  await logDocumento(doc.id, 'caricamento', { studioId, userId: userId ?? undefined, dettaglio: 'dal generatore, saturazione notturna' });
  return doc.id;
}

export type EsitoInvio =
  | { stato: 201; esito: 'nella_cartella'; notti: number; referto: boolean }
  | { stato: 202; esito: 'da_assegnare'; motivo: string; notti: number }
  | { stato: 200; esito: 'gia_presente' | 'gia_in_attesa' }
  | { stato: 400; errore: string };

export async function riceviInvio(studioId: string, corpo: unknown): Promise<EsitoInvio> {
  const v = validaInvio(corpo);
  if ('errore' in v) return { stato: 400, errore: v.errore };
  const imp = impronta(v.chi, v.notti);
  const [gia] = await query<{ stato: string }>(`select stato from sat_registrazioni where studio_id = $1 and impronta = $2`, [studioId, imp]);
  if (gia) return { stato: 200, esito: gia.stato === 'in_attesa' ? 'gia_in_attesa' : 'gia_presente' };

  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(
    `select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);
  const abbinato = abbinaPaziente(`${v.chi.cognome} ${v.chi.nome}`, v.chi.nascita, pazienti);
  const chiave = v.referto ? await putFile(v.referto.dati, MIME[v.referto.tipo], `.${v.referto.tipo}`) : null;
  const doc = abbinato.id && chiave && v.referto ? await allega(studioId, abbinato.id, null, { key: chiave, nome: v.referto.nome }) : null;
  const ultima = v.notti[v.notti.length - 1];
  await query(
    `insert into sat_registrazioni (studio_id, patient_id, stato, motivo, nome_letto, nascita_letta, apparecchio, inizio, fine, notti, totale, nota, valutazione,
       referto_key, referto_nome, documento_id, impronta)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8::timestamp, $9::timestamp, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [studioId, abbinato.id, abbinato.id ? 'assegnata' : 'in_attesa', abbinato.id ? null : abbinato.motivo, `${v.chi.cognome} ${v.chi.nome}`, v.chi.nascita,
     v.apparecchio, ora(v.notti[0].inizio), ora(ultima.fine), JSON.stringify(v.notti), JSON.stringify(v.totale), v.nota, v.valutazione,
     abbinato.id ? null : chiave, abbinato.id ? null : v.referto?.nome ?? null, doc, imp]);
  if (abbinato.id) {
    console.log(`[saturazione] invio: ${v.notti.length} notti nella cartella${doc ? ' col referto' : ''}`);
    return { stato: 201, esito: 'nella_cartella', notti: v.notti.length, referto: !!doc };
  }
  console.log(`[saturazione] invio: da assegnare (${abbinato.motivo}), ${v.notti.length} notti`);
  return { stato: 202, esito: 'da_assegnare', motivo: abbinato.motivo, notti: v.notti.length };
}

type Riga = { id: string; patient_id: string | null; stato: string; motivo: string | null; nome_letto: string | null; nascita_letta: string | null; apparecchio: string;
  inizio: string; fine: string; totale: Totale; documento_id: string | null; referto_nome: string | null; arrivato_il: string; cognome: string | null; nome: string | null; data_nascita: string | null };
const COLONNE = `r.id, r.patient_id, r.stato, r.motivo, r.nome_letto, r.nascita_letta::text, r.apparecchio, to_char(r.inizio, 'YYYY-MM-DD"T"HH24:MI') as inizio,
  to_char(r.fine, 'YYYY-MM-DD"T"HH24:MI') as fine, r.totale, r.documento_id, r.referto_nome, r.arrivato_il::text, p.cognome, p.nome, p.data_nascita::text`;

// L'elenco: le registrazioni nelle cartelle (di un paziente, o tutte) e gli invii che aspettano di essere assegnati.
export async function elenco(studioId: string, patientId?: string | null) {
  const registrazioni = await query<Riga>(
    `select ${COLONNE} from sat_registrazioni r left join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.stato = 'assegnata' and ($2::uuid is null or r.patient_id = $2) order by r.inizio desc limit 300`, [studioId, patientId ?? null]);
  const arrivi = patientId ? [] : await query<Riga>(
    `select ${COLONNE} from sat_registrazioni r left join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.stato = 'in_attesa' order by r.arrivato_il desc limit 50`, [studioId]);
  return { registrazioni, arrivi };
}

// Il dettaglio di una registrazione: le notti con le curve, i totali, il referto in cartella; le altre dello stesso paziente.
export async function dettaglio(studioId: string, id: string) {
  const [r] = await query<Riga & { notti: Notte[]; nota: string | null; valutazione: string | null }>(
    `select ${COLONNE}, r.notti, r.nota, r.valutazione from sat_registrazioni r left join patients p on p.id = r.patient_id
      where r.id = $1 and r.studio_id = $2 and r.stato <> 'scartata'`, [id, studioId]);
  if (!r) return null;
  const altre = r.patient_id ? await query<{ id: string; inizio: string; fine: string; totale: Totale }>(
    `select id, to_char(inizio, 'YYYY-MM-DD"T"HH24:MI') as inizio, to_char(fine, 'YYYY-MM-DD"T"HH24:MI') as fine, totale from sat_registrazioni
      where studio_id = $1 and patient_id = $2 and stato = 'assegnata' and id <> $3 order by inizio desc limit 10`, [studioId, r.patient_id, id]) : [];
  return { ...r, altre };
}

// Un invio «da assegnare» va nella cartella scelta: la registrazione, e il suo referto fra i documenti.
export async function assegna(studioId: string, userId: string, id: string, patientId: string): Promise<Esito<{ ok: true; id: string }>> {
  const [a] = await query<{ referto_key: string | null; referto_nome: string | null }>(
    `select referto_key, referto_nome from sat_registrazioni where id = $1 and studio_id = $2 and stato = 'in_attesa'`, [id, studioId]);
  if (!a) return err('Invio non trovato, o già assegnato.', 404);
  const [p] = await query<{ id: string }>(`select id from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
  if (!p) return err('Paziente non trovato.', 404);
  const doc = a.referto_key ? await allega(studioId, patientId, userId, { key: a.referto_key, nome: a.referto_nome || 'Rapporto del sonno.pdf' }) : null;
  await query(`update sat_registrazioni set stato = 'assegnata', patient_id = $3, documento_id = $4, referto_key = null, motivo = null, deciso_da = $5, deciso_il = now()
    where id = $1 and studio_id = $2`, [id, studioId, patientId, doc, userId]);
  console.log(`[saturazione] invio assegnato a mano${doc ? ' col referto' : ''}`);
  return { ok: true, id };
}

// La persona non ha ancora la cartella: nasce qui coi dati confermati da chi assegna (mai un doppione).
export async function creaCartellaEAssegna(studioId: string, userId: string, id: string, c: { cognome?: unknown; nome?: unknown; data_nascita?: unknown }): Promise<Esito<{ ok: true; id: string; patient_id: string; nuova: boolean }>> {
  const [a] = await query<{ id: string }>(`select id from sat_registrazioni where id = $1 and studio_id = $2 and stato = 'in_attesa'`, [id, studioId]);
  if (!a) return err('Invio non trovato, o già assegnato.', 404);
  const { dati, errori } = validaAnagrafica({ cognome: c.cognome, nome: c.nome, data_nascita: c.data_nascita });
  if (!dati.cognome || !dati.nome) return err('Cognome e nome sono obbligatori.');
  if (errori.data_nascita || !dati.data_nascita) return err('Scrivi la data di nascita (31.12.1950).');
  const [gia] = await query<{ id: string }>(
    `select id from patients where studio_id = $1 and lower(btrim(cognome)) = lower($2) and lower(btrim(nome)) = lower($3) and data_nascita = $4::date limit 1`,
    [studioId, dati.cognome, dati.nome, dati.data_nascita]);
  let pid = gia?.id ?? '';
  if (!pid) {
    const [p] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, $2, $3, $4::date) returning id`, [studioId, dati.cognome, dati.nome, dati.data_nascita]);
    pid = p.id;
  }
  const r = await assegna(studioId, userId, id, pid);
  if ('errore' in r) return r;
  if (!gia) { try { await riabbinaPazienti(studioId); } catch { /* best-effort */ } }
  return { ok: true, id, patient_id: pid, nuova: !gia };
}

export async function scarta(studioId: string, userId: string, id: string): Promise<Esito<{ ok: true }>> {
  const [r] = await query<{ id: string }>(`update sat_registrazioni set stato = 'scartata', deciso_da = $3, deciso_il = now() where id = $1 and studio_id = $2 and stato = 'in_attesa' returning id`, [id, studioId, userId]);
  if (!r) return err('Invio non trovato, o già assegnato.', 404);
  return { ok: true };
}
