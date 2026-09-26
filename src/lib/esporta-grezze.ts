import 'server-only';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { query } from './db';

// Cartella «Trascrizioni grezze» (26.9.2026, richiesta dello studio): per ogni
// dettato entrato dalla cartella condivisa, una sottocartella con due Word da
// confrontare: la trascrizione GREZZA (prima di ogni correzione della catena)
// e il referto CORRETTO dalla catena (il correttore locale, prima di ogni
// ritocco umano: `payload.testo_corretto`; chi rivede scrive in
// `testo_finale`). Niente audio (tolto su richiesta dello studio lo stesso
// giorno). La scrive la piattaforma quando la catena le consegna l'audio
// (/api/referti/audio-catena): i testi sono già lì, la catena non si tocca.
//
// Sono dati sanitari sul Mac: stessa regola di «Audio trascritti» — la
// sottocartella si cancella dopo 7 giorni (REFERTI_CARTELLA_GREZZE_GIORNI,
// 0 = mai), mai in cartelle sincronizzate su cloud. Il nome della
// sottocartella non contiene il paziente: data e ora del dettato, medico,
// sei caratteri dell'id. Nei log solo id abbreviati.

export function cartellaGrezze(): string {
  return process.env.REFERTI_CARTELLA_GREZZE || path.join(os.homedir(), 'Desktop', 'Trascrizioni grezze');
}

const GIORNI = Number(process.env.REFERTI_CARTELLA_GREZZE_GIORNI ?? '7');
const RX_SOTTOCARTELLA = /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} · /;

// I file audio delle prime versioni: si tolgono dalle sottocartelle esistenti.
const RX_AUDIO_VECCHIO = /^audio (?:originale|da ascoltare)\./;

const TITOLI = /^(?:prof\.?|dr\.?(?:ssa)?|dott\.?(?:ssa)?|med\.?)$/i;

export function nomeSottocartella(dettato: Date, medico: string, id: string): string {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(dettato);
  const [giorno, ora] = p.split(' ');
  const parole = String(medico || '').split(/\s+/).filter((w) => w && !TITOLI.test(w));
  const cognome = (parole[parole.length - 1] || 'senza medico').replace(/[^\p{L}' -]/gu, '').slice(0, 30) || 'senza medico';
  return `${giorno} ${ora.replace(':', '.')} · ${cognome} · ${id.replace(/-/g, '').slice(0, 6)}`;
}

export function xmlSicuro(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Un Word minimo e valido: un titolo in grassetto, qualche riga di dati, poi
// il testo un paragrafo per riga.
export async function docxSemplice(titolo: string, dati: string[], testo: string): Promise<Buffer> {
  const par = (t: string, grassetto = false) =>
    `<w:p><w:r>${grassetto ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlSicuro(t)}</w:t></w:r></w:p>`;
  const corpo = [par(titolo, true), ...dati.map((d) => par(d)), par(''), ...String(testo || '').split(/\r?\n/).map((r) => par(r))].join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function esiste(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export type EsitoGrezza = 'fatto' | 'gia_fatto' | 'non_da_cartella' | 'non_trovata';

export async function esportaGrezza(bozzaId: string): Promise<EsitoGrezza> {
  const [b] = await query<{ grezzo: string | null; corretto: string | null; medico: string | null; dettato_il: string | null; created_at: Date; tipo: string }>(
    `select payload->>'testo_grezzo' as grezzo, payload->>'testo_corretto' as corretto, payload->'medico'->>'nome' as medico,
            payload->>'dettato_il' as dettato_il, created_at, tipo
       from referti_bozze where id = $1`, [bozzaId]);
  if (!b) return 'non_trovata';
  // Solo i dettati con l'audio consegnato dalla catena: quelli della cartella
  // condivisa (salvati come «dettato.<ext>», mai col nome originale).
  const [a] = await query<{ id: string }>(
    `select id from referti_audio where bozza_id = $1 and filename like 'dettato.%' limit 1`, [bozzaId]);
  if (!a) return 'non_da_cartella';
  const dettato = b.dettato_il && !Number.isNaN(Date.parse(b.dettato_il)) ? new Date(b.dettato_il) : new Date(b.created_at);
  const dir = path.join(cartellaGrezze(), nomeSottocartella(dettato, b.medico ?? '', bozzaId));
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  let scritti = 0;
  const quando = new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dettato);
  const dati = [`Dettato il ${quando}`, `Medico: ${b.medico || 'non indicato'}`, `Tipo: ${b.tipo === 'visita' ? 'visita registrata' : 'referto'}`];

  const grezza = path.join(dir, 'trascrizione grezza.docx');
  if (!(await esiste(grezza))) {
    const testo = (b.grezzo ?? '').trim() || '(La catena non ha consegnato una trascrizione grezza per questo dettato.)';
    await fs.writeFile(grezza, await docxSemplice('Trascrizione grezza — prima di ogni correzione', [
      ...dati, 'È il testo del motore di trascrizione così com\'è uscito: non è il referto e non va usato come tale.',
    ], testo), { mode: 0o600 });
    scritti++;
  }

  const corretta = path.join(dir, 'referto corretto dalla catena.docx');
  if (!(await esiste(corretta))) {
    const testo = (b.corretto ?? '').trim() || '(La catena non ha consegnato un testo corretto per questo dettato.)';
    await fs.writeFile(corretta, await docxSemplice('Referto corretto dalla catena — prima della revisione', [
      ...dati, 'È il testo come l\'ha consegnato la catena, prima di ogni modifica di chi rivede: il referto valido è quello confermato in ReferralFlow.',
    ], testo), { mode: 0o600 });
    scritti++;
  }

  for (const v of await fs.readdir(dir)) {
    if (RX_AUDIO_VECCHIO.test(v)) await fs.rm(path.join(dir, v), { force: true });
  }
  if (scritti) console.log(`[grezze] bozza ${bozzaId.slice(0, 8)}: ${scritti} file`);
  return scritti ? 'fatto' : 'gia_fatto';
}

// Le sottocartelle più vecchie di GIORNI (data di creazione della
// sottocartella) si cancellano. Solo quelle col nome fatto da qui.
export async function pulisciGrezze(ora = Date.now()): Promise<number> {
  if (!(GIORNI > 0)) return 0;
  let voci: string[];
  try { voci = await fs.readdir(cartellaGrezze()); } catch { return 0; }
  let tolte = 0;
  for (const v of voci) {
    if (!RX_SOTTOCARTELLA.test(v)) continue;
    const p = path.join(cartellaGrezze(), v);
    try {
      const st = await fs.stat(p);
      if (st.isDirectory() && ora - st.birthtimeMs > GIORNI * 86_400_000) { await fs.rm(p, { recursive: true, force: true }); tolte++; }
    } catch { /* sparita nel frattempo */ }
  }
  if (tolte) console.log(`[grezze] tolte ${tolte} sottocartelle più vecchie di ${GIORNI} giorni`);
  return tolte;
}
