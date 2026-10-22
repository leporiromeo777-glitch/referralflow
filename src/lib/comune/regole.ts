// Le lettere della cartella comune dello studio (22.10.2026, [[Piattaforma/Cartella comune]]): le regole pure.
//
// Sulla cartella comune (`/Volumes/comune`) ogni medico ha la sua cartella di rapporti, e dentro una cartella per
// paziente col nome del paziente. Qui: chi è il paziente di una cartella, quali file sono lettere, la data di una
// lettera dal nome del file, quando un PDF è la stessa lettera di un Word. Niente I/O.
import { slugNome } from '../imaging-ordina';

type Paz = { id: string; cognome: string; nome: string; data_nascita: string | null; numero?: string | null };

const RX_DATA = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/;
const iso = (g: number, m: number, a: number): string | null => {
  if (!(a >= 1900 && a <= 2100 && m >= 1 && m <= 12 && g >= 1 && g <= 31)) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCDate() === g ? `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}` : null;
};

// Dal nome della cartella: il nome della persona (senza date, numeri, parentesi, trattini bassi) e la data di
// nascita se c'è («Rossi Mario (12.03.1950)»).
export function nomeDaCartella(nome: string): { nome: string; nascita: string | null } {
  const m = String(nome ?? '').match(RX_DATA);
  const nascita = m ? iso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  const pulito = String(nome ?? '').replace(RX_DATA, ' ').replace(/[_()\[\]]+/g, ' ').replace(/\d+/g, ' ')
    .replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();
  return { nome: pulito, nascita };
}

// È la cartella di un paziente? Le cartelle dei pazienti stanno a livelli diversi (sotto il medico, sotto «Esami
// 2015», sotto un anno): lo è se il nome è quello di un paziente conosciuto, o porta una data («Rossi Mario
// (12.03.1950)», «Rossi 12.03.1950»), o se è una cartella senza sottocartelle con almeno cognome e nome. Le altre sono
// contenitori, e si guarda dentro. `nomi`: i nomi dei pazienti (slugNome di «cognome nome»).
export function cartellaDiPaziente(nome: string, haSottocartelle: boolean, nomi: Set<string>): boolean {
  const n = nomeDaCartella(nome);
  const parole = slugNome(n.nome).split(' ').filter((p) => p.length >= 2);
  const conData = !!n.nascita || dateNelTesto(nome).length > 0;
  if (parole.length >= 2) return nomi.has(slugNome(n.nome)) || conData || !haSottocartelle;
  return parole.length === 1 && conData;
}
// Una cartella con centinaia di lettere non è di un paziente: è un archivio (lettere nominate con un codice).
export const MAX_LETTERE_PAZIENTE = 250;

// Tutte le date scritte nel testo, in ISO (12.03.1950, 12/03/1950, 12-03-1950, 2.3.1950; con l'anno a due cifre
// valgono tutte e due le letture, 1950 e 2050, perché decide il confronto con la data di nascita della scheda).
// Si conservano per cartella: quando arriva un paziente nuovo, la cartella si riabbina senza rileggere i file.
export function dateNelTesto(testo: string): string[] {
  const out = new Set<string>();
  const rx = /(?<![\d.\/-])(\d{1,2})\s*([.\/-])\s*(\d{1,2})\s*\2\s*(\d{4}|\d{2})(?![\d]|[.\/-]\d)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(String(testo ?? '')))) {
    const g = Number(m[1]), me = Number(m[3]), y = m[4];
    const anni = y.length === 4 ? [Number(y)] : [1900 + Number(y), 2000 + Number(y)];
    for (const a of anni) { const d = iso(g, me, a); if (d) out.add(d); }
  }
  return [...out];
}

export type Abbinamento = { id: string | null; motivo: 'abbinato' | 'senza_nome' | 'nessuno' | 'omonimi' | 'nascita_non_trovata' | 'nascita_diversa' };

// Il paziente di una cartella, con la regola severa di sempre: il nome della cartella E la data di nascita, una
// persona sola. La data viene dal nome della cartella, se c'è; se no deve comparire nel testo di una delle sue
// lettere (le lettere dello studio la scrivono accanto al nome). Se no la cartella aspetta: non si indovina.
export function abbinaCartella(nomeCartella: string, date: Iterable<string>, pazienti: Paz[]): Abbinamento {
  const { nome } = nomeDaCartella(nomeCartella);
  const parole = slugNome(nome).split(' ').filter(Boolean);
  if (!parole.length) return { id: null, motivo: 'senza_nome' };
  // Le date del nome della cartella valgono come quelle delle lettere (può essere la nascita o il giorno dell'esame).
  const daNome = dateNelTesto(nomeCartella);
  const nasc = (p: Paz) => (p.data_nascita ?? '').slice(0, 10);
  let stessoNome: Paz[], viste: Set<string>;
  if (parole.length >= 2) {
    stessoNome = pazienti.filter((p) => slugNome(`${p.cognome} ${p.nome}`) === parole.join(' '));
    viste = new Set([...date, ...daNome]);
  } else {
    // Solo il cognome («Rossi 12.03.1950»): vale solo con la data intera nel nome della cartella.
    if (!daNome.length) return { id: null, motivo: 'senza_nome' };
    stessoNome = pazienti.filter((p) => slugNome(p.cognome) === parole[0]);
    viste = new Set(daNome);
  }
  if (!stessoNome.length) return { id: null, motivo: 'nessuno' };
  const conNascita = stessoNome.filter((p) => nasc(p) && viste.has(nasc(p)));
  if (conNascita.length === 1) return { id: conNascita[0].id, motivo: 'abbinato' };
  if (conNascita.length > 1 || stessoNome.length > 1) return { id: null, motivo: 'omonimi' };
  return { id: null, motivo: daNome.length ? 'nascita_diversa' : 'nascita_non_trovata' };
}

// Le cartelle cartacee scansionate (DocuWare, 22.10.2026): «123456_Cognome_Nome.pdf», il numero è quello della cartella.
export function nomeDaScansione(file: string): string {
  return String(file ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/^\s*\d+\s*[_ -]+/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Di chi è una scansione: come le cartelle (nome E data di nascita, che qui viene dal testo delle prime pagine); col
// solo cognome nel nome del file, il cognome E la data di nascita intera nel testo, una persona sola.
// Prima di tutto il numero di MediOnline del nome del file: se è di UN paziente e le parole del nome del file stanno nel
// suo nome, è lui (numero E nome), anche senza la data di nascita.
export function abbinaScansione(file: string, date: Iterable<string>, pazienti: Paz[]): Abbinamento {
  const nome = nomeDaScansione(file);
  const parole = slugNome(nome).split(' ').filter(Boolean);
  const numero = String(file ?? '').match(/^\s*0*(\d{3,10})\s*[_ -]/)?.[1];
  if (numero && parole.length) {
    const c = pazienti.filter((p) => p.numero && p.numero.replace(/^0+/, '') === numero);
    if (c.length === 1 && parole.every((w) => slugNome(`${c[0].cognome} ${c[0].nome}`).split(' ').includes(w))) return { id: c[0].id, motivo: 'abbinato' };
  }
  if (parole.length >= 2) return abbinaCartella(nome, date, pazienti);
  if (!parole.length) return { id: null, motivo: 'senza_nome' };
  const viste = new Set(date);
  const stesso = pazienti.filter((p) => slugNome(p.cognome) === parole[0]);
  if (!stesso.length) return { id: null, motivo: 'nessuno' };
  const c = stesso.filter((p) => p.data_nascita && viste.has(p.data_nascita.slice(0, 10)));
  return c.length === 1 ? { id: c[0].id, motivo: 'abbinato' } : { id: null, motivo: c.length > 1 ? 'omonimi' : 'nascita_non_trovata' };
}

// Il nome quasi uguale (22.10.2026): nessuno ha il nome intero della cartella, ma UN paziente ha un nome contenuto nel
// suo o che lo contiene (un secondo nome in più o in meno, almeno cognome e nome) e la sua data di nascita è scritta
// nelle lettere. È la stessa persona: si usa la scheda che c'è, non se ne crea un'altra.
export function quasiStesso(nomeCartella: string, date: Iterable<string>, pazienti: Paz[]): string | null {
  const fp = slugNome(nomeDaCartella(nomeCartella).nome).split(' ').filter(Boolean);
  if (fp.length < 2) return null;
  const viste = new Set([...date, ...dateNelTesto(nomeCartella)]);
  const c = pazienti.filter((p) => {
    const pp = slugNome(`${p.cognome} ${p.nome}`).split(' ').filter(Boolean);
    const nasc = (p.data_nascita ?? '').slice(0, 10);
    return pp.length >= 2 && !!nasc && viste.has(nasc) && (pp.every((w) => fp.includes(w)) || fp.every((w) => pp.includes(w)));
  });
  return c.length === 1 ? c[0].id : null;
}

// Cognome e nome dal nome della cartella («Cognome Nome», come lo studio le nomina): la prima parola è il cognome,
// con le particelle attaccate («De Luca Mario», «Dal Pozzo Anna», «Van der Berg Jan»); il resto è il nome.
const PARTICELLE = new Set(['de', 'di', 'da', 'del', 'della', 'dello', 'dei', 'degli', 'dal', 'dalla', 'dalle', 'van', 'von', 'der', 'den', 'la', 'le', 'lo', 'mc', 'mac', 'st', 'san', 'santa', 'dos', 'das', 'du', 'des']);
export function dividiNome(nomeCartella: string): { cognome: string; nome: string } | null {
  const parole = nomeDaCartella(nomeCartella).nome.replace(/[.,;]+/g, ' ').split(/\s+/).filter(Boolean);
  if (parole.length < 2) return null;
  let i = 0;
  while (i < parole.length - 2 && PARTICELLE.has(parole[i].toLowerCase().replace(/['’]$/, ''))) i++;
  const cognome = parole.slice(0, i + 1).join(' '), nome = parole.slice(i + 1).join(' ');
  return cognome && nome ? { cognome, nome } : null;
}

// Una data di nascita da proporre quando la cartella aspetta (per «Crea la cartella»): la prima data scritta
// accanto a «nato/nata», «geb.», «data di nascita», o subito dopo il nome. Solo una proposta: decide una persona.
export function nascitaProposta(testo: string, nome: string): string | null {
  const t = String(testo ?? '').slice(0, 4000);
  const parole = slugNome(nome).split(' ').filter((p) => p.length >= 3);
  const candidati: string[] = [];
  const rx = /(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(t))) {
    const d = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (!d) continue;
    const prima = t.slice(Math.max(0, m.index - 80), m.index).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/\b(nat[oa]|geb\.?|geboren|data di nascita|nascita|d\.?\s*n\.?|ddn|dob)\b[^\n]{0,20}$/.test(prima)) return d;
    if (parole.length && parole.every((p) => prima.includes(p))) candidati.push(d);
  }
  return candidati[0] ?? null;
}

// La data di nascita abbastanza sicura per CREARE un paziente (più severa della proposta): accanto a «nato/a il»,
// «geb.», «data di nascita», oppure da sola subito dopo il nome sulla stessa riga («Paziente: Rossi Mario – 12.03.1950»),
// e almeno un anno prima della lettera. Una data qualunque vicino al nome («Rossi Mario, coronarografia del 3.2.2019»)
// non basta.
export function nascitaSicura(testo: string, nome: string, primaLettera: string | null): string | null {
  const t = String(testo ?? '').slice(0, 6000);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const prima = primaLettera ? Number(primaLettera.slice(0, 4)) : new Date().getFullYear();
  const valida = (d: string | null) => (d && Number(d.slice(0, 4)) < prima ? d : null);
  const k = norm(t).match(/\b(?:nat[oa]\s+il|nat[oa]|geb(?:oren)?\.?(?:\s+am)?|data di nascita|d\.\s*di\s*n\.)\s*:?\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{4})/);
  if (k) { const d = valida(iso(Number(k[1]), Number(k[2]), Number(k[3]))); if (d) return d; }
  const parole = slugNome(nome).split(' ').filter((p) => p.length >= 2);
  if (parole.length < 2) return null;
  for (const riga of t.split(/\r?\n/)) {
    const r = norm(riga);
    const m = r.match(/(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{4})/);
    if (!m || !parole.every((p) => new RegExp(`\\b${p}\\b`).test(r))) continue;
    let resto = r.replace(m[0], ' ');
    for (const p of parole) resto = resto.replace(new RegExp(`\\b${p}\\b`), ' ');
    if (/^[\s,–—\-():;./]*(?:(?:paziente|pz|sig(?:\.|ra|nor|nora)?|concerne|oggetto)\s*[:.]?)?[\s,–—\-():;./]*$/.test(resto)) {
      const d = valida(iso(Number(m[1]), Number(m[2]), Number(m[3]))); if (d) return d;
    }
  }
  return null;
}

// Quali file sono lettere: Word (nuovo e vecchio) e PDF. Fuori i modelli, i file di blocco di Word («~$…»), i file
// di sistema, tutto il resto.
export type Formato = 'docx' | 'doc' | 'pdf';
export function formatoLettera(nome: string): Formato | null {
  const n = String(nome ?? '');
  if (!n || n.startsWith('.') || n.startsWith('~$') || n.startsWith('~')) return null;
  const e = (n.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? '').toLowerCase();
  return e === 'docx' || e === 'doc' || e === 'pdf' ? e : null;
}

// La data della lettera dal nome del file, come lo studio li nomina: «24 05 12 Rossi Mario.docx» (anno, mese,
// giorno), anche coi punti, o con l'anno intero. null se il nome non comincia con una data.
export function dataDaNomeFile(nome: string): string | null {
  const m = String(nome ?? '').match(/^\s*(\d{2}|\d{4})[ ._-](\d{1,2})[ ._-](\d{1,2})(?!\d)/);
  if (!m) return null;
  const a = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  return iso(Number(m[3]), Number(m[2]), a);
}

// Il nome senza estensione, per riconoscere «la stessa lettera in Word e in PDF».
export const radice = (nome: string): string => slugNome(String(nome ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, ''));

// Due testi sono la stessa lettera se condividono quasi tutte le parole (un PDF stampato dal Word ha le stesse
// parole, magari spezzate o con l'intestazione in più). Testi troppo corti non si confrontano.
function parole(t: string): Set<string> {
  return new Set(String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
}
export function stessaLettera(a: string, b: string): boolean {
  const A = parole(a), B = parole(b);
  if (A.size < 30 || B.size < 30) return false;
  let comuni = 0;
  for (const w of A) if (B.has(w)) comuni++;
  return comuni / Math.min(A.size, B.size) >= 0.9;
}

// Il controllo di ogni giorno: alle 2 di notte (ora del server), o subito se il giro precedente ha lasciato file
// da leggere (la prima volta sono migliaia: si va a lotti).
export function tocca(adesso: Date, ultimoCompleto: Date | null, restano: boolean, ora = 2): boolean {
  if (restano || !ultimoCompleto) return true;
  const soglia = new Date(adesso); soglia.setHours(ora, 0, 0, 0);
  if (adesso < soglia) soglia.setDate(soglia.getDate() - 1);
  return ultimoCompleto < soglia;
}

// Le cartelle «Rapporti_…» sono lettere; le convocazioni sono «altro» (non lettere cliniche: il dittafono non le
// riprende); le altre («Esami_II livello», «Device (PM + DEFI)») referti d'esame.
export const categoriaDi = (medico: string): 'lettera' | 'referto' | 'altro' => (/^rapp/i.test(medico) ? 'lettera' : /^convoc/i.test(medico) ? 'altro' : 'referto');
