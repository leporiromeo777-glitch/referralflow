// Il pacchetto di contesto clinico (16.9.2026).
//
// Prima fetta della «ricerca clinica esterna protetta»: il modello LOCALE legge
// la cartella intera e ne ricava il minimo che serve per porre la domanda a chi
// non conosce il paziente. Qui dentro solo logica pura e il prompt; la cartella
// la assembla il codice (`briefingGrezzo`) e la chiamata sta nella rotta.
//
// In questa fetta NON esce niente: si mostra al medico che cosa uscirebbe.
//
// Il controllo non è euristico: cerca gli identificatori VERI di quel paziente
// — il suo cognome, la sua data di nascita, il suo AVS — dentro il testo che
// sarebbe destinato all'esterno. Se ce n'è uno, è una fuga, non un sospetto.

export const CONTESTO_PROMPT = `Sei un assistente medico che lavora DENTRO lo studio, sul computer dello studio. Ricevi la cartella clinica completa di un paziente e la domanda che il suo medico vuole porre a una fonte esterna (una ricerca in letteratura).

Il tuo compito: scrivere il CONTESTO MINIMO che serve per rispondere a quella domanda, da mandare fuori al posto della cartella.

Regole, in ordine di importanza:
1. NON deve uscire nulla che identifichi la persona: niente nome, cognome, indirizzo, telefono, e-mail, numero di paziente, AVS, date di nascita o di visita, nomi di medici, di ospedali o di studi.
2. NON eliminare i dati che DETERMINANO la risposta: la funzione renale, i farmaci in corso, le allergie, le diagnosi che contano per la domanda. Un contesto senza questi è inutile e pericoloso.
3. Quello che non serve alla domanda non si scrive, anche se non identifica nessuno.
4. Dove un valore esatto non cambia la risposta, usa una fascia: «uomo sui settant'anni», «funzione renale ridotta (eGFR intorno a 30)». L'età esatta non si scrive mai.
5. Niente ipotesi tue, niente diagnosi nuove, niente terapia: solo quello che c'è scritto.

Rispondi in italiano, con due parti e nient'altro:

CONTESTO: due o tre frasi.
DOMANDA: la domanda del medico riscritta in forma generale, valida per chiunque si trovi in quella situazione clinica. Non deve contenere «questo paziente» o simili: vale per chiunque.

CARTELLA CLINICA (non deve uscire da qui):
{cartella}

DOMANDA DEL MEDICO:
{domanda}`;

export type Pacchetto = { contesto: string; domanda: string };

// Le due parti. Se il modello non rispetta la forma, si tiene tutto come
// contesto e la domanda resta vuota: meglio vuota che inventata.
export function separaContesto(grezzo: string): Pacchetto {
  const testo = String(grezzo ?? '').replace(/\*\*/g, '').trim();
  const m = /CONTESTO\s*:?\s*([\s\S]*?)\s*DOMANDA\s*:?\s*([\s\S]*)$/i.exec(testo);
  if (!m) return { contesto: testo, domanda: '' };
  return { contesto: m[1].trim(), domanda: m[2].trim() };
}

export type Identificatori = { parole: string[]; numeri: string[] };

// Gli identificatori di QUESTO paziente, come si cercano in un testo.
export function spieDiPaziente(p: {
  cognome?: string | null; nome?: string | null; data_nascita?: string | null;
  telefono?: string | null; email?: string | null; via?: string | null;
  npa?: string | null; localita?: string | null; avs?: string | null; n_assicurato?: string | null;
}): Identificatori {
  const parole = [p.cognome, p.nome, p.via, p.localita]
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 3);
  const numeri: string[] = [];
  for (const x of [p.telefono, p.email, p.avs, p.n_assicurato, p.npa]) {
    const s = String(x ?? '').trim();
    if (s.length > 3) numeri.push(s);
  }
  const n = String(p.data_nascita ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(n)) {
    numeri.push(n, `${n.slice(8, 10)}.${n.slice(5, 7)}.${n.slice(0, 4)}`);
  }
  return { parole, numeri };
}

export type Controllo = {
  ok: boolean;
  fughe: string[];        // identificatori del paziente ricomparsi
  deittici: string[];     // «questo paziente»: la domanda non è generale
  etaEsatta: string;      // «78 anni»: restringe di molto chi può essere
  vuoto: boolean;         // il modello non ha prodotto un contesto utile
};

const DEITTICI = ['questo paziente', 'questa paziente', 'nel nostro paziente', 'il paziente in questione', 'la paziente in questione', 'in lui', 'in lei', 'del paziente in esame'];

export function controllaContesto(p: Pacchetto, spie: Identificatori): Controllo {
  const tutto = `${p.contesto}\n${p.domanda}`;
  const basso = tutto.toLowerCase();
  const fughe: string[] = [];
  for (const parola of spie.parole ?? []) {
    // Parola intera e con la MAIUSCOLA come l'ha il nome: «Neri» è un cognome,
    // «capelli neri» no, e nessuna lista di parole comuni saprebbe dire quale
    // sia quale. Un modello che nomina una persona la scrive maiuscola; il
    // prezzo è che una fuga scritta tutta minuscola sfugge — nei banchi non è
    // mai successo, ma è scritto qui perché si sappia.
    if (new RegExp(`(^|[^\\p{L}])${parola.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(tutto)) fughe.push(parola);
  }
  for (const numero of spie.numeri ?? []) if (basso.includes(numero.toLowerCase())) fughe.push(numero);
  const deittici = DEITTICI.filter((d) => p.domanda.toLowerCase().includes(d));
  const eta = /\b(\d{1,3})\s*anni\b/.exec(tutto);
  const vuoto = p.contesto.trim().length < 40 || !p.domanda.trim();
  return {
    ok: !fughe.length && !deittici.length && !eta && !vuoto,
    fughe: [...new Set(fughe)],
    deittici,
    etaEsatta: eta ? eta[0] : '',
    vuoto,
  };
}
