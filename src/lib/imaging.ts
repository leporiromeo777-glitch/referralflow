import 'server-only';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getFile } from './storage';

// Il lato piattaforma delle immagini diagnostiche (18.9.2026).
//
// I file DICOM non li apre Node: li apre `imaging/leggi-dicom.py`, in un
// processo separato che muore subito dopo. Un file malformato — e ne arrivano,
// da apparecchi di vent'anni fa — rovina al massimo la sua richiesta, non il
// server. È la stessa scelta della catena dei referti: il lavoro sporco in un
// processo suo.

const PY = process.env.IMAGING_PYTHON ?? path.join(os.homedir(), '.referralflow-imaging', 'bin', 'python');
const STRUMENTO = path.join(process.cwd(), 'imaging', 'leggi-dicom.py');
const CACHE = path.join(process.cwd(), 'uploads', 'imaging-cache');
const LOCALE = path.join(process.cwd(), 'uploads');
const TIMEOUT_MS = 30_000;

export type MetaDicom = {
  study_uid: string; series_uid: string; sop_uid: string; sop_class: string;
  modalita: string; data_esame: string; ora_esame: string;
  descrizione_esame: string; descrizione_serie: string;
  numero_serie: number; numero_immagine: number; parte_corpo: string;
  accession: string; istituto: string; inviante: string;
  paziente_nome: string; paziente_nascita: string; paziente_id: string; paziente_sesso: string;
  righe: number; colonne: number; frame: number; immagine: boolean;
  ww: number | null; wl: number | null; trasferimento: string;
};

function esegui(args: string[]): Promise<{ uscita: string; codice: number }> {
  return new Promise((risolvi) => {
    execFile(PY, [STRUMENTO, ...args], { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (errore, stdout) => {
        const codice = errore && typeof (errore as any).code === 'number' ? (errore as any).code : errore ? 1 : 0;
        risolvi({ uscita: String(stdout ?? ''), codice });
      });
  });
}

// Il lettore gira su un FILE, e con S3 il file non è qui: in quel caso lo si
// tira giù in una copia temporanea che sparisce subito. Su disco locale — che
// è come gira in studio — si legge dov'è, senza copiare niente.
async function conFile<T>(key: string, fn: (percorso: string) => Promise<T>): Promise<T> {
  const locale = path.join(LOCALE, key);
  try {
    await fs.access(locale);
    return await fn(locale);
  } catch { /* non è qui: si scarica */ }
  const tmp = path.join(os.tmpdir(), `rf-dicom-${randomUUID()}.dcm`);
  const { body } = await getFile(key);
  await fs.writeFile(tmp, body);
  try { return await fn(tmp); } finally { await fs.rm(tmp, { force: true }); }
}

export async function leggiMeta(buffer: Buffer): Promise<MetaDicom | { errore: string }> {
  const tmp = path.join(os.tmpdir(), `rf-dicom-${randomUUID()}.dcm`);
  await fs.writeFile(tmp, buffer);
  try {
    const { uscita } = await esegui(['meta', tmp]);
    const j = JSON.parse(uscita || '{}');
    return j?.errore ? { errore: String(j.errore) } : (j as MetaDicom);
  } catch {
    return { errore: 'lettore_non_disponibile' };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

// Un fotogramma in PNG. Il disegno costa qualche decimo di secondo, e la
// stessa immagine si riguarda di continuo (si scorre avanti e indietro): il
// risultato resta in cache su disco, con la chiave che comprende la finestra.
export async function fotogrammaPng(
  key: string, opzioni: { frame?: number; ww?: number | null; wl?: number | null; lato?: number; anteprima?: boolean }
): Promise<Buffer | { errore: string }> {
  const frame = Math.max(0, Math.min(4096, Math.round(opzioni.frame ?? 0)));
  const lato = Math.max(64, Math.min(2048, Math.round(opzioni.lato ?? 1024)));
  const ww = Number.isFinite(opzioni.ww as number) ? Number(opzioni.ww) : null;
  const wl = Number.isFinite(opzioni.wl as number) ? Number(opzioni.wl) : null;
  const nome = `${key.replace(/[^a-z0-9]+/gi, '_')}-f${frame}-l${opzioni.anteprima ? 'a' : lato}-${ww ?? 'x'}-${wl ?? 'x'}.png`;
  const inCache = path.join(CACHE, nome);
  try { return await fs.readFile(inCache); } catch { /* si disegna */ }

  return conFile(key, async (percorso) => {
    await fs.mkdir(CACHE, { recursive: true });
    const args = ['png', percorso, '--frame', String(frame), '--out', inCache, '--lato', String(lato)];
    if (opzioni.anteprima) args.push('--anteprima');
    if (ww !== null && wl !== null) args.push('--ww', String(ww), '--wl', String(wl));
    const { uscita } = await esegui(args);
    let j: any = {};
    try { j = JSON.parse(uscita || '{}'); } catch { /* uscita illeggibile */ }
    if (!j?.ok) return { errore: String(j?.errore ?? 'disegno_fallito') };
    return fs.readFile(inCache);
  });
}

export function lettoreDisponibile(): Promise<boolean> {
  return fs.access(PY).then(() => true).catch(() => false);
}

// Lo stato della ricezione dagli apparecchi, per la pagina.
//
// La configurazione la scrive lo studio in ~/referti-imaging/ricezione.conf e
// la legge il servizio Python: qui si rilegge per DIRLA a chi installa
// l'ecografo — AE Title, porta, indirizzo del Mac, apparecchi ammessi. Il
// token non esce mai da qui.
export type StatoRicezione = {
  attiva: boolean; ae_title: string; porta: number; apparecchi: string[];
  in_coda: number; indirizzi: string[];
};

export async function statoRicezione(): Promise<StatoRicezione> {
  const base = process.env.REFERTI_IMAGING_BASE ?? path.join(os.homedir(), 'referti-imaging');
  const valori: Record<string, string> = {};
  try {
    const testo = await fs.readFile(path.join(base, 'ricezione.conf'), 'utf-8');
    for (const riga of testo.split('\n')) {
      const pulita = riga.trim();
      if (!pulita || pulita.startsWith('#') || !pulita.includes('=')) continue;
      const [k, ...resto] = pulita.split('=');
      valori[k.trim().toUpperCase()] = resto.join('=').trim();
    }
  } catch { /* non ancora installata */ }

  let inCoda = 0;
  try {
    inCoda = (await fs.readdir(path.join(base, 'ingresso'))).filter((n) => n.endsWith('.dcm')).length;
  } catch { /* nessuno spool */ }

  const reti = os.networkInterfaces();
  const indirizzi: string[] = [];
  for (const schede of Object.values(reti)) {
    for (const s of schede ?? []) {
      if (s.family === 'IPv4' && !s.internal) indirizzi.push(s.address);
    }
  }

  return {
    attiva: Object.keys(valori).length > 0,
    ae_title: valori.AE_TITLE || 'REFERRALFLOW',
    porta: Number(valori.PORTA || 11112),
    apparecchi: (valori.CONSENTITI || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean),
    in_coda: inCoda,
    indirizzi,
  };
}
