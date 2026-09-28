// Ricerca nella cartella scansionata di ciò che il dettato cita (28.9.2026,
// richiesta dello studio). Una cartella cartacea caricata in un PDF solo
// contiene lettere, ECG, esami: quando il medico dice «allego l'ECG del 12
// marzo» o «come da lettera del 2023», qui si cerca, pagina per pagina nel
// testo OCR, dove sta quel documento, e la revisione propone di estrarre
// quelle pagine e allegarle. Regole pure, niente AI: date e parole chiave,
// con i motivi scritti («data 12.3.2024, parola ECG a pagina 12»). Non si
// allega mai nulla da solo: conferma una persona. Si prova in
// prove-cerca-cartella.test.ts con cartelle inventate.

export type Tipo = 'ecg' | 'holter' | 'eco' | 'ergometria' | 'laboratorio' | 'imaging' | 'lettera';
export type DataCercata = { g?: number; m?: number; a: number };
export type Richiesta = { tipo: Tipo; data: DataCercata | null; esplicita: boolean };
export type Proposta = { pagina_da: number; pagina_a: number; punteggio: number; motivi: string[] };

const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_DE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const MESI_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// Come lo dice il medico (dettato) e come sta scritto sulla pagina (OCR,
// anche in tedesco e francese: lettere da oltre Gottardo e dalla Romandia).
const TIPI: { tipo: Tipo; dettato: RegExp; pagina: RegExp; nome: string }[] = [
  { tipo: 'holter', nome: 'Holter', dettato: /\bholter\b/i, pagina: /\bholter\b|\blangzeit[- ]?ekg\b/gi },
  { tipo: 'ergometria', nome: 'ergometria', dettato: /\b(?:ergometri\w*|test da sforzo|prova da sforzo)\b/i, pagina: /\b(?:ergometri\w*|test da sforzo|prova da sforzo|belastungs[- ]?ekg|épreuve d'effort)\b/gi },
  { tipo: 'ecg', nome: 'ECG', dettato: /\b(?:ecg|e\.c\.g\.|ekg|elettrocardiogramm[ai]|tracciato)\b/i, pagina: /\b(?:ecg|ekg|elettrocardiogramm[ai]|elektrokardiogramm|électrocardiogramme|ritmo sinusale|sinusrhythmus|rythme sinusal|qrs|qtc|derivazioni)\b/gi },
  { tipo: 'eco', nome: 'ecocardiogramma', dettato: /\b(?:ecocardio\w*|ecocolordoppler|eco cardiaca|ecografia cardiaca)\b/i, pagina: /\b(?:ecocardio\w*|echokardiogra\w*|échocardiogra\w*|frazione di eiezione|fevs|lvef|tapse)\b/gi },
  { tipo: 'laboratorio', nome: 'esami di laboratorio', dettato: /\b(?:laboratorio|esami del sangue|esami ematici|emocromo|analisi del sangue)\b/i, pagina: /\b(?:laboratorio|labor|emocromo|creatinin\w*|colesterolo|cholesterin|ldl|hdl|hba1c|emoglobina|hämoglobin|potassio|kalium|tsh|nt-?probnp)\b/gi },
  { tipo: 'imaging', nome: 'imaging', dettato: /\b(?:tac|risonanza|angio-?tc|coronarografia|scintigrafia|rmn)\b/i, pagina: /\b(?:tac|computertomographie|risonanza|mrt|irm|coronarografia|koronarangiographie|scintigrafia|szintigraphie)\b/gi },
  { tipo: 'lettera', nome: 'lettera', dettato: /\b(?:lettera|rapporto|dimissione)\b/i, pagina: /\b(?:egregio|gentile|caro collega|cara collega|cari colleghi|lieber kollege|liebe kollegin|sehr geehrte|cher confrère|chère consœur|rapporto|dimissione|austrittsbericht|lettre de sortie)\b/gi },
];

export const CATEGORIA_DI: Record<Tipo, string> = { ecg: 'ecg', holter: 'holter', eco: 'referto', ergometria: 'referto', laboratorio: 'laboratorio', imaging: 'imaging', lettera: 'lettera' };
export const NOME_DI: Record<Tipo, string> = Object.fromEntries(TIPI.map((t) => [t.tipo, t.nome])) as Record<Tipo, string>;

const INVITO_ALLEGATO = /\b(?:alleg\w*|come da|vedi|secondo (?:la|il|l')|riportat\w*|in copia)\b/i;

function anno4(a: number): number { return a < 100 ? 2000 + a : a; }

// Le date di una frase del dettato. Senza anno: l'ultimo passato rispetto
// al giorno del dettato.
export function dateInFrase(frase: string, dettatoIl: Date): DataCercata[] {
  const f = frase.toLowerCase();
  const oggi = { a: dettatoIl.getFullYear(), m: dettatoIl.getMonth() + 1, g: dettatoIl.getDate() };
  const annoPer = (m: number, g = 1) => (m > oggi.m || (m === oggi.m && g > oggi.g) ? oggi.a - 1 : oggi.a);
  const out: DataCercata[] = [];
  const mesi = MESI_IT.join('|');
  let r: RegExpExecArray | null;
  const rxNum = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?\b/g;
  while ((r = rxNum.exec(f))) {
    const g = +r[1], m = +r[2];
    if (g < 1 || g > 31 || m < 1 || m > 12) continue;
    out.push({ g, m, a: r[3] ? anno4(+r[3]) : annoPer(m, g) });
  }
  const rxGiornoMese = new RegExp(`\\b(\\d{1,2})°?\\s+(${mesi})(?:\\s+(\\d{4}))?\\b`, 'g');
  while ((r = rxGiornoMese.exec(f))) {
    const m = MESI_IT.indexOf(r[2]) + 1;
    out.push({ g: +r[1], m, a: r[3] ? +r[3] : annoPer(m, +r[1]) });
  }
  const rxMese = new RegExp(`\\b(?:di|del|a|in|nel|mese di)\\s+(${mesi})(?:\\s+(?:del\\s+)?(\\d{4}))?\\b`, 'g');
  while ((r = rxMese.exec(f))) {
    const m = MESI_IT.indexOf(r[1]) + 1;
    if (!out.some((d) => d.m === m && d.g)) out.push({ m, a: r[2] ? +r[2] : annoPer(m) });
  }
  const rxAnno = /\b(?:del|nel|dal)\s+((?:19|20)\d{2})\b/g;
  while ((r = rxAnno.exec(f))) if (!out.some((d) => d.a === +r![1])) out.push({ a: +r[1] });
  return out;
}

// Che cosa il dettato chiede di ritrovare. Una frase che nomina un tipo di
// documento vale se ha una data o un invito ad allegare («allego», «come
// da…»). L'ECG citato senza data è quello di oggi (±3 giorni): nella
// cartella vecchia di solito non c'è, ed è giusto non proporre nulla.
export function richiesteDalDettato(testo: string, note: string[], dettatoIl: Date): Richiesta[] {
  const frasi = [String(testo || ''), ...note.map((n) => String(n || ''))]
    .join('\n').replace(/\b(dr|dott|prof|med)\./gi, '$1 ').split(/(?<=[.;!?])\s+|\n+/);
  const out: Richiesta[] = [];
  // «Allego l'ECG del 12.3 e gli esami di agosto»: due documenti nella stessa
  // frase. Si divide sulle «e» e sulle virgole; l'invito ad allegare vale per
  // tutta la frase.
  const pezzi = frasi.flatMap((f) => {
    const invitoFrase = INVITO_ALLEGATO.test(f);
    return f.split(/\s+e\s+|,\s*/).map((x) => ({ frase: x, invitoFrase }));
  });
  for (const { frase, invitoFrase } of pezzi) {
    const tipi = TIPI.filter((t) => t.dettato.test(frase));
    if (!tipi.length) continue;
    // «Holter» e «ECG» nella stessa frase: vince il più specifico (il primo in TIPI).
    const t = tipi[0];
    const date = dateInFrase(frase, dettatoIl);
    const invito = invitoFrase || INVITO_ALLEGATO.test(frase);
    if (!date.length && !invito && t.tipo !== 'ecg') continue;
    const data = date[0] ?? (t.tipo === 'ecg' && !invito ? { g: dettatoIl.getDate(), m: dettatoIl.getMonth() + 1, a: dettatoIl.getFullYear() } : null);
    const chiave = `${t.tipo}|${data ? `${data.g ?? ''}.${data.m ?? ''}.${data.a}` : ''}`;
    if (out.some((x) => `${x.tipo}|${x.data ? `${x.data.g ?? ''}.${x.data.m ?? ''}.${x.data.a}` : ''}` === chiave)) continue;
    out.push({ tipo: t.tipo, data, esplicita: !!date.length || invito });
  }
  return out;
}

export function etichettaData(d: DataCercata): string {
  return d.g && d.m ? `${d.g}.${d.m}.${d.a}` : d.m ? `${MESI_IT[d.m - 1]} ${d.a}` : `${d.a}`;
}

export function etichettaRichiesta(r: Richiesta): string {
  const d = r.data;
  const quando = !d ? '' : d.g && d.m ? ` del ${etichettaData(d)}` : d.m ? ` di ${etichettaData(d)}` : ` del ${d.a}`;
  return `${NOME_DI[r.tipo][0].toUpperCase()}${NOME_DI[r.tipo].slice(1)}${quando}`;
}

// Le forme in cui una data può stare scritta su una pagina.
export function rxDataPagina(d: DataCercata): RegExp {
  const aa = String(d.a).slice(2);
  const sep = '\\s?[./-]\\s?';
  if (d.g && d.m) {
    const g = `0?${d.g}`, m = `0?${d.m}`;
    const mesi = [MESI_IT, MESI_DE, MESI_FR].map((l) => l[d.m! - 1]).concat(MESI_BREVI[d.m - 1]).join('|');
    return new RegExp(`(?<!\\d)(?:${g}${sep}${m}${sep}(?:${d.a}|${aa})(?!\\d)|${g}\\.?\\s*(?:${mesi})\\.?\\s*(?:${d.a}|${aa})(?!\\d))`, 'i');
  }
  if (d.m) {
    const mesi = [MESI_IT, MESI_DE, MESI_FR].map((l) => l[d.m! - 1]).join('|');
    return new RegExp(`(?<!\\d)(?:0?${d.m}${sep}(?:${d.a}|${aa})(?!\\d)|(?:${mesi})\\s*${d.a})`, 'i');
  }
  return new RegExp(`(?<!\\d)${d.a}(?!\\d)`);
}

const RX_DATA_PIENA = /(?<!\d)(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})(?!\d)/g;
const RX_APERTURA = /\b(?:egregio|gentile|caro collega|cara collega|cari colleghi|lieber|liebe|sehr geehrte|cher confrère|chère consœur)\b/i;

function contaTipo(tipo: Tipo, testo: string): number {
  const t = TIPI.find((x) => x.tipo === tipo)!;
  return (testo.match(t.pagina) ?? []).length;
}

// Le pagine (testo OCR, una stringa per pagina) dove sta il documento chiesto.
// Punteggio: la data (4, +1 se in testa alla pagina; 2 mese e anno; 1 solo
// anno) più le parole del tipo (fino a 3). Serve la data se il dettato la
// dice, e almeno una parola del tipo. Poi il documento prosegue sulle pagine
// dopo finché hanno la stessa data o parole del tipo senza aprire un
// documento nuovo (un'altra data in testa, un «Egregio collega»), al massimo
// 6 pagine. Le due proposte migliori.
export function cercaPagine(pagine: string[], r: Richiesta): Proposta[] {
  const rxData = r.data ? rxDataPagina(r.data) : null;
  const pesoData = r.data ? (r.data.g ? 4 : r.data.m ? 2 : 1) : 0;
  const valuta = (i: number) => {
    const testo = pagine[i] ?? '';
    const tipo = Math.min(3, contaTipo(r.tipo, testo));
    let data = 0;
    if (rxData && rxData.test(testo)) data = pesoData + (rxData.test(testo.slice(0, 500)) ? 1 : 0);
    return { tipo, data };
  };
  const candidati: Proposta[] = [];
  for (let i = 0; i < pagine.length; i++) {
    const v = valuta(i);
    if (!v.tipo || (rxData && !v.data)) continue;
    const motivi = [`${NOME_DI[r.tipo]} a pagina ${i + 1}`];
    if (v.data && r.data) motivi.unshift(`data ${etichettaData(r.data)}`);
    let fine = i;
    while (fine + 1 < pagine.length && fine - i < 5) {
      const dopo = pagine[fine + 1] ?? '';
      const w = valuta(fine + 1);
      const testa = dopo.slice(0, 400);
      const altraData = [...testa.matchAll(RX_DATA_PIENA)].some((m) => !(rxData && rxData.test(m[0])));
      // Le pagine dopo la prima di una lettera spesso non hanno parole «da
      // lettera»: proseguono se non aprono un documento nuovo. Una pagina
      // vuota (scritta a mano, senza OCR) chiude.
      const prosegue = (w.tipo || (r.tipo === 'lettera' && dopo.replace(/\s+/g, '').length > 20)) && !altraData && !RX_APERTURA.test(testa);
      if (w.data || prosegue) fine++;
      else break;
    }
    candidati.push({ pagina_da: i + 1, pagina_a: fine + 1, punteggio: v.data + v.tipo, motivi });
    i = fine;
  }
  return candidati.sort((a, b) => b.punteggio - a.punteggio || a.pagina_da - b.pagina_da).slice(0, 2);
}
