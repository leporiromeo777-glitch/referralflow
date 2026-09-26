import 'server-only';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { query } from './db';
import { MODELLO_ANONIMIZZA, anonimizzaConPiano, applicaPiano, type Piano, type Sostituzione } from './anonimizza';

// Cartella «Trascrizioni grezze» (26.9.2026, richiesta dello studio): per ogni
// dettato entrato dalla cartella condivisa, una sottocartella con due Word da
// confrontare, entrambi PSEUDONIMIZZATI (27.9.2026): la trascrizione GREZZA
// (prima di ogni correzione della catena) e il referto CORRETTO dalla catena
// (dopo il correttore locale, prima di ogni ritocco umano:
// `payload.testo_corretto`; chi rivede scrive in `testo_finale`). Niente audio.
//
// Pseudonimizzati, non «anonimi»: nomi, date di nascita, indirizzi, telefoni,
// e-mail e codici diventano segnaposto («Persona 1», [paziente], [medico],
// [data di nascita]…) con la libreria della pagina Anonimizza (modello
// LOCALE, sostituzione fatta dal codice, rete di regole) più i dati che la
// piattaforma conosce già: nome e data di nascita estratti dalla catena,
// medici della rubrica e dello studio. Un nome detto in modo irriconoscibile
// può restare: il Word lo dice in testa.
//
// Quando: SOLO a catena ferma (niente in ~/referti/ingresso né in
// lavorazione), decisione dello studio del 27.9.2026 — il modello
// dell'anonimizzatore sulla GPU mentre lavorano whisper o il correttore è la
// contesa di memoria che fa cadere la catena. Lo chiama `mac/automazioni.sh`
// ogni quarto d'ora (/api/cron/grezze) e la consegna dell'audio
// (/api/referti/audio-catena); il testo in chiaro non tocca mai la Scrivania.
//
// Sono dati sanitari sul Mac: la sottocartella si cancella dopo 7 giorni
// (REFERTI_CARTELLA_GREZZE_GIORNI, 0 = mai), mai in cartelle sincronizzate su
// cloud. Il nome della sottocartella non contiene il paziente: data e ora del
// dettato, medico, sei caratteri dell'id. Nei log solo id abbreviati e numeri.

export function cartellaGrezze(): string {
  return process.env.REFERTI_CARTELLA_GREZZE || path.join(os.homedir(), 'Desktop', 'Trascrizioni grezze');
}

const GIORNI = Number(process.env.REFERTI_CARTELLA_GREZZE_GIORNI ?? '7');
const RX_SOTTOCARTELLA = /^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} · /;

// I file delle versioni di prima (audio, Word in chiaro): si tolgono dalle
// sottocartelle esistenti.
const RX_VECCHI = /^(?:audio (?:originale|da ascoltare)\.|trascrizione grezza\.docx$|referto corretto dalla catena\.docx$)/;
const FILE_GREZZA = 'trascrizione grezza (pseudonimizzata).docx';
const FILE_CORRETTA = 'referto corretto dalla catena (pseudonimizzato).docx';
// Solo i dettati da quando la cartella esiste (i più vecchi li ha tolti lo
// studio il 26.9.2026).
const DAL = process.env.REFERTI_CARTELLA_GREZZE_DAL || '2026-09-26T18:00:00+02:00';

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

// La catena lavora? Stessa regola con cui la catena stessa decide se
// prendere un altro dettato (preleva_da_cartella in pipeline.py).
export async function catenaOccupata(): Promise<boolean> {
  const base = process.env.REFERTI_BASE || path.join(os.homedir(), 'referti');
  for (const [cartella, intermedi] of [['ingresso', false], ['lavorazione', true]] as const) {
    let voci: string[] = [];
    try { voci = await fs.readdir(path.join(base, cartella)); } catch { continue; }
    if (voci.some((v) => !v.startsWith('.') && !(intermedi && /^[0-9a-f]{16}(\.|$)/.test(v)))) return true;
  }
  return false;
}

const TITOLI_NOME = /^(?:prof|dr|dott|dottor|dottore|dottoressa|med|pd|ssa|sig|sigra|signor|signora|fmh)\.?$/i;
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function parole(nome: string): string[] {
  return String(nome || '').replace(/[.,]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !TITOLI_NOME.test(w));
}

// Una data di nascita scritta in tutti i modi in cui la può scrivere la
// catena: 5.3.1950, 05.03.1950, 1950-03-05, 5 marzo 1950.
export function variantiData(s: string): string[] {
  const t = String(s || '').trim();
  if (!t) return [];
  let g = 0, m = 0, a = 0;
  let r = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (r) { g = +r[1]; m = +r[2]; a = +r[3]; }
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) { a = +r[1]; m = +r[2]; g = +r[3]; }
  else if ((r = new RegExp(`^(\\d{1,2})\\s+(${MESI.join('|')})\\s+(\\d{4})$`, 'i').exec(t))) { g = +r[1]; m = MESI.indexOf(r[2].toLowerCase()) + 1; a = +r[3]; }
  if (!(g >= 1 && g <= 31 && m >= 1 && m <= 12 && a > 1900)) return t.length >= 6 ? [t] : [];
  const p = (n: number) => String(n).padStart(2, '0');
  return [...new Set([t, `${g}.${m}.${a}`, `${p(g)}.${p(m)}.${a}`, `${a}-${p(m)}-${p(g)}`, `${g} ${MESI[m - 1]} ${a}`, `${p(g)}/${p(m)}/${a}`, `${g}/${m}/${a}`])];
}

// Le voci che la piattaforma conosce già, prima del modello: il paziente e
// la data di nascita estratti dalla catena, gli invianti nominati, e i medici
// della rubrica e dello studio — questi ultimi solo quando il cognome compare
// nel testo con la maiuscola (un cognome che è anche una parola comune non
// deve mangiare il testo clinico).
export function vociNote(testi: string[], dati: { paziente?: string; nascita?: string; medici?: string[]; rubrica?: string[] }): Sostituzione[] {
  const voci: Sostituzione[] = [];
  const aggiungi = (nome: string | undefined, seg: string, minimo: number) => {
    const n = String(nome || '').trim();
    if (!n) return;
    if (n.split(/\s+/).length > 1) voci.push({ originale: n, segnaposto: seg });
    for (const w of parole(n)) if (w.length >= minimo) voci.push({ originale: w, segnaposto: seg });
  };
  aggiungi(dati.paziente, '[paziente]', 3);
  for (const d of variantiData(dati.nascita ?? '')) voci.push({ originale: d, segnaposto: '[data di nascita]' });
  for (const m of dati.medici ?? []) aggiungi(m, '[medico]', 4);
  const tutto = testi.join('\n');
  for (const nome of dati.rubrica ?? []) {
    const ps = parole(nome).filter((w) => w.length >= 4 && /^\p{Lu}/u.test(w));
    const cognomi = ps.slice(1).length ? ps.slice(1) : ps;
    const presenti = cognomi.filter((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(tutto));
    if (!presenti.length) continue;
    voci.push({ originale: ps.join(' '), segnaposto: '[medico]' });
    for (const w of presenti) voci.push({ originale: w, segnaposto: '[medico]' });
  }
  // Le voci più lunghe prima: «Mario Rossi» prima di «Rossi».
  const viste = new Set<string>();
  return voci.filter((v) => { const k = v.originale.toLowerCase(); if (viste.has(k)) return false; viste.add(k); return true; })
    .sort((a, b) => b.originale.length - a.originale.length);
}

const SEPARATORE = '\n\n=====\n\n';

// Le due versioni con UN piano solo: la stessa persona ha lo stesso
// segnaposto nella grezza e nella corretta, così si confrontano.
export async function pseudonimizzaCoppia(grezzo: string, corretto: string, noti: Sostituzione[]): Promise<{ grezzo: string; corretto: string; sostituzioni: number }> {
  const conNoti = (t: string) => applicaPiano(t, { voci: noti })[0];
  const [g0, c0] = [conNoti(grezzo), conNoti(corretto)];
  const { piano } = await anonimizzaConPiano(`${g0}${SEPARATORE}${c0}`);
  const finale: Piano = { voci: [...noti, ...piano.voci] };
  const [g, sg] = applicaPiano(g0, finale);
  const [c, sc] = applicaPiano(c0, finale);
  return { grezzo: g, corretto: c, sostituzioni: sg.length + sc.length + noti.length };
}

export type EsitoGrezza = 'fatto' | 'gia_fatto' | 'non_da_cartella' | 'non_trovata';

export async function esportaGrezza(bozzaId: string): Promise<EsitoGrezza> {
  const [b] = await query<{ studio_id: string; grezzo: string | null; corretto: string | null; medico: string | null; dettato_il: string | null; created_at: Date; tipo: string;
    paziente: string | null; nascita: string | null; inviante: string | null; destinatario: string | null }>(
    `select studio_id, payload->>'testo_grezzo' as grezzo, payload->>'testo_corretto' as corretto, payload->'medico'->>'nome' as medico,
            payload->>'dettato_il' as dettato_il, created_at, tipo,
            payload->'campi_estratti'->>'nome_paziente' as paziente, payload->'campi_estratti'->>'data_nascita' as nascita,
            payload->'campi_estratti'->>'medico_inviante' as inviante, payload->'campi_estratti'->>'medico_destinatario' as destinatario
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
  for (const v of await fs.readdir(dir)) {
    if (RX_VECCHI.test(v)) await fs.rm(path.join(dir, v), { force: true });
  }
  const grezza = path.join(dir, FILE_GREZZA);
  const corretta = path.join(dir, FILE_CORRETTA);
  if ((await esiste(grezza)) && (await esiste(corretta))) return 'gia_fatto';

  const rubrica = await query<{ nome: string }>(
    `select nome from referring_doctors where studio_id = $1 union select nome from providers where studio_id = $1`, [b.studio_id]);
  const tg = (b.grezzo ?? '').trim(), tc = (b.corretto ?? '').trim();
  const noti = vociNote([tg, tc], { paziente: b.paziente ?? '', nascita: b.nascita ?? '', medici: [b.medico ?? '', b.inviante ?? '', b.destinatario ?? ''], rubrica: rubrica.map((r) => r.nome) });
  const p = await pseudonimizzaCoppia(tg, tc, noti);

  const quando = new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dettato);
  const dati = [`Dettato il ${quando}`, `Tipo: ${b.tipo === 'visita' ? 'visita registrata' : 'referto'}`,
    `Pseudonimizzato sul Mac dello studio (${MODELLO_ANONIMIZZA} locale + regole): nomi, date di nascita, indirizzi, telefoni, e-mail e codici sono segnaposto. Non è anonimo: un nome detto in modo irriconoscibile può essere rimasto. Stessa persona, stesso segnaposto nei due Word.`];
  await fs.writeFile(grezza, await docxSemplice('Trascrizione grezza — prima di ogni correzione', [
    ...dati, 'È il testo del motore di trascrizione così com\'è uscito: non è il referto e non va usato come tale.',
  ], p.grezzo || '(La catena non ha consegnato una trascrizione grezza per questo dettato.)'), { mode: 0o600 });
  await fs.writeFile(corretta, await docxSemplice('Referto corretto dalla catena — prima della revisione', [
    ...dati, 'È il testo come l\'ha consegnato la catena, prima di ogni modifica di chi rivede: il referto valido è quello confermato in ReferralFlow.',
  ], p.corretto || '(La catena non ha consegnato un testo corretto per questo dettato.)'), { mode: 0o600 });
  console.log(`[grezze] bozza ${bozzaId.slice(0, 8)}: pseudonimizzata, ${p.sostituzioni} voci`);
  return 'fatto';
}

// Un giro: se la catena è ferma, i dettati della cartella degli ultimi giorni
// che non hanno ancora i due Word pseudonimizzati. Uno alla volta; alla fine
// il modello si scarica dalla GPU. Mai due giri insieme.
let inCorso = false;
export async function giroGrezze(massimo = 50): Promise<{ esito: 'occupata' | 'in_corso' | 'fatto'; fatti: number; restano: number }> {
  if (inCorso) return { esito: 'in_corso', fatti: 0, restano: 0 };
  if (await catenaOccupata()) return { esito: 'occupata', fatti: 0, restano: 0 };
  inCorso = true;
  let fatti = 0, restano = 0;
  try {
    await pulisciGrezze();
    const giorni = GIORNI > 0 ? GIORNI : 3650;
    const bozze = await query<{ id: string }>(
      `select distinct b.id, b.created_at from referti_bozze b join referti_audio a on a.bozza_id = b.id and a.filename like 'dettato.%'
        where b.created_at > greatest($1::timestamptz, now() - make_interval(days => $2)) order by b.created_at`, [DAL, giorni]);
    for (const [i, x] of bozze.entries()) {
      if (fatti >= massimo || (await catenaOccupata())) { restano = bozze.length - i; break; }
      try { if ((await esportaGrezza(x.id)) === 'fatto') fatti++; }
      catch (e: any) { console.error(`[grezze] bozza ${x.id.slice(0, 8)}: ${e?.code ?? e?.name ?? 'errore'}`); }
    }
  } finally {
    inCorso = false;
    if (fatti) await scaricaModello();
  }
  if (fatti || restano) console.log(`[grezze] giro: ${fatti} pseudonimizzate, ${restano} rimandate`);
  return { esito: 'fatto', fatti, restano };
}

async function scaricaModello(): Promise<void> {
  try {
    await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELLO_ANONIMIZZA, keep_alive: 0 }), signal: AbortSignal.timeout(30_000),
    });
  } catch { /* best effort */ }
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
