import 'server-only';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query } from '../db';
import { abbinaPaziente } from '../imaging-ordina';
import { leggiFile } from './calcolo';
import { caricaProfilo } from './archivio';
import { daIgnorare, decodifica, estensione, identitaDaFile, perNonLeggerlo, rapportoDaTesto, type Identita } from './cartella';

// Pressione: la cartella condivisa (8.10.2026, [[Piattaforma/Pressione]]).
// Chi ha il file delle misure lo mette nella cartella «Pressione da leggere»
// (sul Mac, condivisa in rete con gli altri computer dello studio) e la
// piattaforma lo legge da sola entro pochi secondi:
// - se dal nome del file o dalle sue prime righe si ricavano nome E data di
//   nascita, e in cartella c'è UNA persona sola che combacia, nasce il profilo;
// - se no il file entra fra gli «arrivi da assegnare» della pagina Pressione;
// - se non si legge finisce in «Non letti» con accanto il perché.
// Il file letto passa in «Letti» e dopo sette giorni si cancella: è un dato
// sanitario, e ormai sta nel database. Nei log entrano solo conteggi.
//
// La cartella NON sta sulla Scrivania: macOS non lascia leggere Scrivania e
// Documenti ai servizi in sottofondo senza un permesso dato a mano.
export const cartellaPressione = (): string => process.env.PRESSIONE_CARTELLA || path.join(os.homedir(), 'Pressione da leggere');
const LETTI = 'Letti', NON_LETTI = 'Non letti';
const FERMO_DA_MS = 8_000;          // un file si legge quando nessuno lo tocca da un po': la copia in rete è finita
const GIORNI_LETTI = 7;

export type EsitoGiro = { visti: number; profili: number; in_attesa: number; non_letti: number; gia_caricati: number; cartella?: 'assente' };

async function sposta(da: string, cartella: string, nome: string): Promise<void> {
  await fs.mkdir(cartella, { recursive: true });
  let dest = path.join(cartella, nome);
  try { await fs.access(dest); const e = path.extname(nome); dest = path.join(cartella, `${path.basename(nome, e)} (${Date.now() % 100000})${e}`); } catch { /* libero */ }
  try { await fs.rename(da, dest); } catch { await fs.copyFile(da, dest); await fs.rm(da, { force: true }); }
}

// Il testo di un PDF (lo stesso estrattore dei documenti della cartella). '' se non si legge.
export async function testoDelPdf(b: Buffer | Uint8Array): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: b });
    const r = await parser.getText();
    try { await parser.destroy(); } catch { /* ignora */ }
    return typeof r === 'string' ? r : String((r as { text?: string })?.text ?? '');
  } catch { return ''; }
}
// Da un file (CSV, testo o rapporto in PDF) al testo che `leggiFile` sa leggere, con chi è il paziente.
export async function daFile(nome: string, b: Buffer): Promise<{ testo: string; chi: Identita } | { errore: string }> {
  if (estensione(nome) === 'pdf') {
    const r = rapportoDaTesto(await testoDelPdf(b));
    if (!r) return { errore: 'In questo PDF non trovo l’elenco delle misure (una riga per misura, con data, ora, sistolica e diastolica): è un referto stampato, o una scansione.' };
    const daNome = identitaDaFile(nome, '');
    return { testo: r.csv, chi: { nome: r.nome || daNome.nome, nascita: r.nascita ?? daNome.nascita, da: r.nome || r.nascita ? 'file' : daNome.da } };
  }
  const testo = decodifica(b);
  return { testo, chi: identitaDaFile(nome, testo) };
}

let inCorso = false;
export async function giroCartella(opzioni: { fermoDaMs?: number } = {}): Promise<EsitoGiro> {
  const r: EsitoGiro = { visti: 0, profili: 0, in_attesa: 0, non_letti: 0, gia_caricati: 0 };
  if (inCorso) return r;
  inCorso = true;
  try {
    const base = cartellaPressione();
    try { await fs.mkdir(path.join(base, LETTI), { recursive: true }); await fs.mkdir(path.join(base, NON_LETTI), { recursive: true }); } catch { return { ...r, cartella: 'assente' }; }
    let nomi: string[];
    try { nomi = (await fs.readdir(base, { withFileTypes: true })).filter((d) => d.isFile() && !daIgnorare(d.name)).map((d) => d.name).sort(); } catch { return { ...r, cartella: 'assente' }; }
    if (!nomi.length) { await pulisciLetti(base); return r; }
    const [studio] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
    if (!studio) return r;
    const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studio.id]);
    for (const nome of nomi.slice(0, 20)) {
      const p = path.join(base, nome);
      let st; try { st = await fs.stat(p); } catch { continue; }
      // Lo stanno ancora copiando? Con attesa zero (le prove) non si guarda l'orologio: l'ora di modifica
      // di un file ha i decimi di millisecondo e può risultare un soffio DOPO «adesso».
      const attesa = opzioni.fermoDaMs ?? FERMO_DA_MS;
      if (attesa > 0 && Date.now() - st.mtimeMs < attesa) continue;
      r.visti++;
      const rifiuta = async (perche: string) => {
        await sposta(p, path.join(base, NON_LETTI), nome);
        await fs.writeFile(path.join(base, NON_LETTI, `${nome}.perche.txt`), `${perche}\r\n`, 'utf-8').catch(() => null);
        r.non_letti++;
      };
      const no = perNonLeggerlo(nome, st.size);
      if (no) { await rifiuta(no); continue; }
      let contenuto: Buffer;
      try { contenuto = await fs.readFile(p); } catch { await rifiuta('Non riesco ad aprire il file.'); continue; }
      const dal = await daFile(nome, contenuto);
      if ('errore' in dal) { await rifiuta(dal.errore); continue; }
      const testo = dal.testo;
      const letto = leggiFile(testo);
      if (letto.errore) { await rifiuta(letto.errore); continue; }
      if (letto.misure.length < 10) { await rifiuta(`Nel file ci sono solo ${letto.misure.length} misure: troppo poche per un profilo.`); continue; }
      const chi = dal.chi;
      const abbinato = chi.nome && chi.nascita ? abbinaPaziente(chi.nome, chi.nascita, pazienti) : { id: null, motivo: 'senza_dati' as const };
      const inizio = letto.misure[0].quando, fine = letto.misure[letto.misure.length - 1].quando;
      let stato: 'in_attesa' | 'assegnato' = 'in_attesa', profiloId: string | null = null, motivo: string = abbinato.id ? '' : abbinato.motivo;
      if (abbinato.id) {
        const c = await caricaProfilo(studio.id, null, abbinato.id, { testo, apparecchio: 'dalla cartella' });
        if ('errore' in c) {
          if (c.stato === 409) { await sposta(p, path.join(base, LETTI), nome); r.gia_caricati++; continue; }   // lo stesso profilo, già dentro
          motivo = 'non_caricato';
        } else { stato = 'assegnato'; profiloId = c.id; r.profili++; }
      }
      await query(
        `insert into pa_arrivi (studio_id, nome_file, testo, misure, inizio, fine, nome_letto, nascita_letta, stato, motivo, profilo_id, deciso_il)
         values ($1,$2,$3,$4,$5::timestamp,$6::timestamp,nullif($7,''),$8::date,$9,nullif($10,''),$11, case when $9 = 'assegnato' then now() else null end)`,
        [studio.id, nome.slice(0, 200), stato === 'assegnato' ? '' : testo, letto.misure.length, inizio, fine, chi.nome, chi.nascita, stato, motivo, profiloId]);
      if (stato === 'in_attesa') r.in_attesa++;
      await sposta(p, path.join(base, LETTI), nome);
    }
    if (r.visti) console.log(`[pressione] cartella: file ${r.visti} · profili ${r.profili} · da assegnare ${r.in_attesa} · non letti ${r.non_letti} · già caricati ${r.gia_caricati}`);
    await pulisciLetti(base);
    return r;
  } finally { inCorso = false; }
}

// I file già letti restano sette giorni (per chi ha sbagliato file e lo rivuole), poi via.
async function pulisciLetti(base: string): Promise<void> {
  const limite = Date.now() - GIORNI_LETTI * 86_400_000;
  for (const sotto of [LETTI, NON_LETTI]) {
    let nomi: string[] = [];
    try { nomi = await fs.readdir(path.join(base, sotto)); } catch { continue; }
    for (const n of nomi) {
      const p = path.join(base, sotto, n);
      try { if ((await fs.stat(p)).mtimeMs < limite) await fs.rm(p, { force: true }); } catch { /* al prossimo giro */ }
    }
  }
}

// Il giro parte col server e ripassa ogni dieci secondi; si spegne con PRESSIONE_CARTELLA_GIRO=spento.
let avviato = false;
export function avviaCartella(): void {
  if (avviato) return; avviato = true;
  setInterval(() => { giroCartella().catch((e) => console.error(`[pressione] cartella: ${e?.code ?? e?.name ?? 'errore'}`)); }, 10_000).unref?.();
}
