// Domanda medica in generale (14.9.2026).
//
// Il medico scrive la domanda come gli viene, col paziente dentro. Quel testo
// NON esce: resta nel processo, non va nel database, non finisce nei log. Il
// modello LOCALE la riscrive come domanda di medicina generale — non
// pseudonimizzata, proprio SENZA nessun paziente — e la persona la approva
// prima che parta. Una domanda senza dato personale non è una comunicazione di
// dati sanitari: il problema non si attenua, sparisce.
//
// Qui dentro solo logica pura e testata: il controllo di ciò che la
// riformulazione ha ancora addosso. Le chiamate al modello stanno
// nell'endpoint. Regola: il modello PROPONE, questo codice DECIDE — se resta
// anche un solo segnale personale, non parte niente.

export const RIFORMULA_PROMPT = `Sei un assistente di uno studio medico svizzero. Ricevi la domanda che un medico ha scritto pensando a un suo paziente. Devi riscriverla come DOMANDA DI MEDICINA GENERALE, valida per chiunque, da poter porre a un collega che non conosce nessun paziente.

Regole, tutte obbligatorie:
- TOGLI ogni riferimento a una persona: nomi, cognomi, iniziali, date di nascita, date di visite, indirizzi, telefoni, e-mail, numeri AVS o di assicurato, luoghi di cura.
- NON scrivere «il paziente», «questo paziente», «il mio caso»: la domanda deve riguardare la condizione, non una persona.
- Trasforma i dati particolari in categorie cliniche: «62 anni» diventa «nell'anziano» solo se l'età conta; «clearance 38» diventa «nell'insufficienza renale moderata»; un valore preciso diventa la classe a cui appartiene.
- MANTIENI la sostanza clinica: la domanda riscritta deve avere la stessa risposta della domanda originale.
- Se la domanda non è di medicina (è organizzativa, amministrativa o sui dati dello studio), rispondi esattamente: NON_MEDICA
- Rispondi con la sola domanda riscritta, su una riga, senza virgolette, senza spiegazioni.

Domanda del medico:
{testo}`;

// Il prompt della risposta: qui perché lo usano sia l'endpoint sia il banco,
// e due copie divergono sempre.
export const RISPOSTA_PROMPT = `Sei un collega medico. Ti viene posta una domanda di medicina generale, che non riguarda nessun paziente in particolare. Rispondi in italiano, in modo breve e concreto, dicendo chiaramente quando una cosa dipende dal caso singolo o quando le fonti non concordano. Non chiedere dati del paziente: non ne hai e non devono essere forniti.

Domanda: {testo}`;

export type Segnale = { tipo: string; spiega: string };
export type EsitoValidazione = { ok: boolean; blocchi: Segnale[]; avvisi: Segnale[] };

// Parole con l'iniziale maiuscola: nomi di persona, di luogo, di prodotto.
// Le sigle tutte maiuscole (FA, ECG, BPCO) non sono nomi e restano fuori.
//
// Si guardano ANCHE quelle a inizio frase: «Bernasconi ha…» è un nome, e
// saltarlo sarebbe il buco peggiore. Il prezzo è qualche falso allarme su
// parole comuni — ed è il verso giusto in cui sbagliare: un falso allarme
// vuol dire riscrivere la domanda, un nome che passa vuol dire un dato uscito.
// La lista qui sotto toglie le parole che più spesso aprono una frase.
const PAROLE_COMUNI = new Set(
  ('il lo la i gli le un uno una del dello della dei degli delle al allo alla ai agli alle ' +
   'da dal dallo dalla dai dagli dalle in nel nello nella nei negli nelle con col su sul sullo sulla ' +
   'per tra fra e o ma se che chi cosa come quando quanto quanti quale quali ' +
   'questo questa questi queste quello quella quel quei quegli qual ' +
   'mio mia miei mie suo sua suoi sue tuo tua nostro nostra ' +
   'è sono ha hanno era erano esiste esistono serve servono bisogna posso puoi può devo deve dobbiamo ' +
   'vorrei volevo avrei potrei meglio peggio ' +
   'non più meno anche ancora già mai sempre solo soltanto ' +
   'dopo prima poi allora quindi però perché perche dove ecco secondo circa oltre durante senza ' +
   'ogni tutti tutte tutto tutta nessun nessuna niente molto poco abbastanza ' +
   'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre ' +
   'lunedì martedì mercoledì giovedì venerdì sabato domenica ' +
   'dottor dottore dottoressa signor signora signorina paziente pazienti caso ieri oggi domani ' +
   'buongiorno grazie salve ciao').split(' ')
);

export function nomiPropri(testo: string): string[] {
  const fuori = new Set<string>();
  const re = /[A-ZÀ-Ý][a-zà-ÿ]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo)) !== null) {
    const parola = m[0];
    if (PAROLE_COMUNI.has(parola.toLowerCase())) continue;
    fuori.add(parola);
  }
  return [...fuori];
}

// Eponimi: nomi propri che in medicina sono il nome di una cosa, non di una
// persona («Holter», «Mobitz», «Fallot»). Senza questa lista la domanda
// riscritta verrebbe bloccata ogni volta che nomina un esame. Si allunga
// quando serve — e se un paziente si chiamasse davvero Holter, resta il
// controllo che conta: la domanda la guarda una persona prima che parta.
export const EPONIMI = new Set(
  ('holter doppler valsalva mobitz wenckebach brugada marfan ehlers danlos parkinson alzheimer ' +
   'graves basedow osler duke killip forrester swan ganz fontan glenn blalock taussig ross bentall ' +
   'cabrol judkins amplatz seldinger allen raynaud buerger takayasu kawasaki behcet wegener churg ' +
   'strauss loeffler chagas barlow ebstein eisenmenger fallot wolff parkinson white levine austin ' +
   'flint corrigan quincke traube duroziez musset cheyne stokes adams morgagni stokes frank starling ' +
   'laplace bernoulli simpson teichholz devereux cornell sokolow lyon bazett fridericia framingham ' +
   'cockcroft gault child pugh glasgow charlson lown vaughan williams torsade tako tsubo dressler ' +
   'prinzmetal bland garland shone turner down noonan williams fabry danon pompe amiloidosi ' +
   'brockenbrough carvallo rivero gallavardin means lutembacher').split(' ')
);

const REGOLE: { tipo: string; re: RegExp; spiega: string }[] = [
  { tipo: 'email', re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, spiega: 'un indirizzo e-mail' },
  { tipo: 'avs', re: /\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/, spiega: 'un numero AVS' },
  { tipo: 'telefono', re: /(\+41|\b0)\s?\d{2}[\s./-]?\d{3}[\s./-]?\d{2}[\s./-]?\d{2}\b/, spiega: 'un numero di telefono' },
  { tipo: 'data', re: /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/, spiega: 'una data precisa' },
  { tipo: 'cartella', re: /\b(cartella|paziente|assicurato|tessera)\s*(n\.?|nr\.?|numero)\s*\d+/i, spiega: 'un numero di cartella o di assicurato' },
];

const AVVISI: { tipo: string; re: RegExp; spiega: string }[] = [
  // «in un paziente con…» è un modo normale di porre una domanda generale: non
  // avvisa. Avvisa il DETERMINATIVO e il possessivo, che indicano una persona
  // precisa: «questo paziente», «il mio paziente», «la paziente».
  { tipo: 'persona', re: /\b(questo|questa|quest'|mio|mia|nostro|nostra)\s+pazient[ei]\b|\bil\s+mio\s+pazient|\b(il|la)\s+pazient[ei]\s+(che|di\s+cui|in\s+questione)\b/i, spiega: 'parla di un paziente preciso invece che della condizione' },
  { tipo: 'eta', re: /\b\d{1,3}\s*(anni|enne)\b/i, spiega: "un'età precisa" },
  { tipo: 'iniziali', re: /\b[A-Z]\.\s?[A-Z]\.\b/, spiega: 'quelle che sembrano iniziali di una persona' },
];

// Il controllo: la riformulazione può partire? `originale` serve per i nomi
// propri — un nome che c'era prima e c'è ancora dopo è il segnale peggiore.
export function validaGenerale(originale: string, generale: string): EsitoValidazione {
  const g = (generale ?? '').trim();
  const blocchi: Segnale[] = [];
  const avvisi: Segnale[] = [];
  if (g.length < 12) {
    blocchi.push({ tipo: 'vuota', spiega: 'la domanda riscritta è troppo corta per essere una domanda' });
    return { ok: false, blocchi, avvisi };
  }
  if (g.length > 600) blocchi.push({ tipo: 'lunga', spiega: 'la domanda riscritta è troppo lunga: sembra il testo originale' });
  for (const r of REGOLE) if (r.re.test(g)) blocchi.push({ tipo: r.tipo, spiega: `contiene ancora ${r.spiega}` });
  const rimasti = nomiPropri(originale)
    .filter((n) => !EPONIMI.has(n.toLowerCase()))
    .filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(g));
  // Si dice QUALE: è la domanda che il medico ha appena scritto, sul suo
  // schermo, e così può correggerla in due secondi invece di indovinare.
  if (rimasti.length) {
    blocchi.push({
      tipo: 'nome',
      spiega: `contiene ancora ${rimasti.length === 1 ? 'il nome' : 'i nomi'} «${rimasti.join('», «')}» dalla domanda originale`,
    });
  }
  for (const a of AVVISI) if (a.re.test(g)) avvisi.push({ tipo: a.tipo, spiega: `contiene ${a.spiega}` });
  return { ok: blocchi.length === 0, blocchi, avvisi };
}

// Il modello può dire che la domanda non è di medicina: in quel caso non si
// riformula niente e si rimanda a Cleo normale.
export function nonMedica(rispostaModello: string): boolean {
  return /^\s*NON_MEDICA\s*$/i.test(rispostaModello ?? '');
}

// Ripulisce la riga che torna dal modello: virgolette, «Domanda:», a capo.
export function ripuliRiformulazione(grezzo: string): string {
  let t = (grezzo ?? '').trim().split('\n').map((r) => r.trim()).filter(Boolean)[0] ?? '';
  t = t.replace(/^(domanda(\s+riscritta)?|riscritta|risposta)\s*[:.-]\s*/i, '');
  t = t.replace(/^[«"'`]+|[»"'`]+$/g, '').trim();
  return t.slice(0, 600);
}
