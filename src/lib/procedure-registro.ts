// Registro delle procedure dell'assistente COME DATI (13.9.2026): il grafo
// operativo dello studio. Per ogni procedura: chi può lanciarla, che cosa le
// serve, quali dati legge, che cosa produce, se usa il modello, le frasi che
// la attivano e i chip nelle pagine. Lo leggono il server (permessi, scelta
// della procedura) e il prototipo (instradamento, chip, «per questo uso la
// procedura X»). Puro, testato in `prove-registro.test.ts`. Le espressioni
// sono stringhe compatibili con JavaScript e TypeScript: vanno bene da
// entrambe le parti. Il modello non sceglie qui: sceglie il codice.
export type RuoloProto = 'secretary' | 'doctor' | 'org_admin';
export type InputProcedura = 'nessuno' | 'paziente' | 'bozza';

export type ProceduraDef = {
  nome: string;
  titolo: string;
  descrizione: string;
  // Chi può lanciarla (ruoli del prototipo; l'«inviante» è escluso ovunque).
  ruoli: RuoloProto[];
  input: InputProcedura;
  // Parametri facoltativi che la domanda può portare («giorno», «mese»).
  parametri: string[];
  // Dati che legge: nomi delle tabelle o delle fonti, per la traccia e per la wiki.
  dati: string[];
  produce: string;
  modello: boolean;
  // Frasi che la attivano (sorgenti di espressioni regolari, senza flag: si usa 'i').
  frasi: string[];
  // Chip nelle pagine del prototipo: contesto → etichetta (la domanda è l'etichetta).
  chip: { contesto: string; etichetta: string }[];
  attesa: string;
};

export const PROCEDURE: ProceduraDef[] = [
  {
    nome: 'briefing_previsita', titolo: 'Briefing pre-visita',
    descrizione: 'Che cosa sapere prima di ricevere un paziente: referral, questionario, ultimo referto e terapia, esami recenti (ECG entro 12 mesi, eco entro 24), agenda, sospesi. Il modello locale scrive solo la sintesi.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'paziente', parametri: [],
    dati: ['referrals', 'questionario', 'referti_bozze', 'patient_documents', 'appointments'], produce: 'sezioni con fonte, mancanze, fatti nel grafo, traccia', modello: true,
    frasi: ['briefing', 'prepar(a|ami|are|azione)( la| alla| della| per la)? visita', 'prima della visita', 'cosa (devo|dobbiamo) sapere (su|di|prima)', '(riassunto|sintesi) (del |della )?(paziente|cartella)', 'prossimo paziente.*(prepar|brief)'],
    chip: [{ contesto: 'patient', etichetta: 'Briefing pre-visita' }, { contesto: 'home', etichetta: 'Briefing del prossimo paziente' }],
    attesa: 'Preparo il briefing: leggo cartella, referti e agenda…',
  },
  {
    nome: 'preparazione_giornata', titolo: 'Preparazione della giornata',
    descrizione: 'Il briefing di ogni paziente in agenda nel giorno, con tutte le mancanze in cima e i pazienti non in cartella segnalati.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'nessuno', parametri: ['giorno'],
    dati: ['appointments', 'patients', 'briefing di ciascuno'], produce: 'da segnalare + un blocco per appuntamento, traccia', modello: false,
    frasi: ['prepar(a|ami|are|azione)( la| della| mia)? giornata', 'briefing (di|per) (tutti|oggi|la giornata)', 'tutti i pazienti di oggi', 'giornata di oggi', 'prepara oggi'],
    chip: [{ contesto: 'home', etichetta: 'Preparazione della giornata' }, { contesto: 'agenda', etichetta: 'Preparazione della giornata' }],
    attesa: 'Preparo la giornata: un briefing per ogni paziente in agenda…',
  },
  {
    nome: 'cambiamenti_ultima_visita', titolo: 'Cosa è cambiato dall’ultima visita',
    descrizione: 'Misure riconosciute e terapia a confronto tra gli ultimi due referti confermati del paziente.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'paziente', parametri: [],
    dati: ['referti_bozze (confermati)'], produce: 'misure cambiate/invariate, terapia nuova/modificata/tolta, traccia', modello: false,
    frasi: ['cosa (è|e\') cambiat', 'cos\'è cambiat', 'differenz', 'confront.*(ultim|preced)', 'rispetto all.ultima', 'dall.ultima visita'],
    chip: [{ contesto: 'patient', etichetta: 'Cosa è cambiato dall’ultima visita?' }, { contesto: 'review', etichetta: 'Cosa è cambiato dall’ultima visita?' }],
    attesa: 'Confronto gli ultimi due referti confermati…',
  },
  {
    nome: 'richiami_mese', titolo: 'Richiami del mese',
    descrizione: 'Richiami aperti entro 30 giorni: scaduti, questa settimana, nel resto del mese; quanti fatti nell’ultimo mese.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'nessuno', parametri: [],
    dati: ['referrals (follow_up)', 'appointments (follow_up)'], produce: 'tre liste con fonte, traccia', modello: false,
    frasi: ['richiami (del|di questo|in scadenza|prossim|del prossimo)', 'chi (devo|dobbiamo|va) (ri)?chiam', 'da richiamare'],
    chip: [{ contesto: 'home', etichetta: 'Richiami del mese' }],
    attesa: 'Raccolgo i richiami del mese…',
  },
  {
    nome: 'controllo_prefirma', titolo: 'Controllo prima della firma',
    descrizione: 'Dieci controlli sulla bozza: stato, verifica della catena, fiducia, critiche chiuse, numeri, terapia, campi, testo, lettera precedente. Verdetto in una riga. Non sostituisce la conferma nella piattaforma.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'bozza', parametri: [],
    dati: ['referti_bozze', 'revisione_stato', 'referti_eventi'], produce: 'lista dei controlli con esito, verdetto, traccia', modello: false,
    frasi: ['prima della firma', 'pronto per la firma', 'posso firmar', 'si può firmar', 'controllo (pre|prima)', 'controlla (il|questo) referto', 'manca (qualcosa|niente) (per|prima)'],
    chip: [{ contesto: 'review', etichetta: 'Controllo prima della firma' }, { contesto: 'reports', etichetta: 'Controllo prima della firma' }],
    attesa: 'Controllo la bozza prima della firma…',
  },
  {
    nome: 'lettere_ritardo', titolo: 'Lettere in ritardo',
    descrizione: 'Referti confermati senza Word prodotto da 3 giorni, bozze ferme da 7, referral viste da 10 giorni senza referto inviato.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'nessuno', parametri: [],
    dati: ['referti_bozze', 'referti_eventi (word_scaricato)', 'referrals (vista)'], produce: 'tre liste con fonte, traccia', modello: false,
    frasi: ['letter[ae] in ritardo', 'referti (confermati )?senza word', 'word non (scaricat|prodott)', 'bozze ferme', 'in ritardo con (le lettere|i referti)', 'lettere da (mandare|spedire|inviare)'],
    chip: [{ contesto: 'home', etichetta: 'Lettere in ritardo' }, { contesto: 'reports', etichetta: 'Lettere in ritardo' }],
    attesa: 'Cerco le lettere in ritardo…',
  },
  {
    nome: 'chiusura_mensile', titolo: 'Chiusura mensile',
    descrizione: 'I numeri del mese (referti, referral, richiami, cartella, assistente) e i punti ancora aperti. Solo conteggi e id.',
    ruoli: ['secretary', 'doctor', 'org_admin'], input: 'nessuno', parametri: ['mese'],
    dati: ['referti_bozze', 'referrals', 'appointments', 'patient_documents', 'assistente_tracce', 'referti_dizionario'], produce: 'cinque sezioni di numeri, punti aperti, traccia', modello: false,
    frasi: ['chiusura (mensile|del mese|di [a-z]+)', 'chiud(i|ere) il mese', 'bilancio del mese', 'numeri del mese', 'com.è andato il mese', 'resoconto (mensile|del mese)'],
    chip: [{ contesto: 'home', etichetta: 'Chiusura mensile' }, { contesto: 'reports', etichetta: 'Chiusura mensile' }],
    attesa: 'Raccolgo i numeri del mese…',
  },
];

export function proceduraPerNome(nome: string): ProceduraDef | undefined {
  return PROCEDURE.find((p) => p.nome === nome);
}

export function procedurePerRuolo(ruolo: string): ProceduraDef[] {
  return PROCEDURE.filter((p) => (p.ruoli as string[]).includes(ruolo));
}

// La procedura che una domanda attiva, in ORDINE di registro ma con le più
// specifiche prima: «briefing di tutti» è la giornata, non il singolo.
export const PRIORITA = ['chiusura_mensile', 'lettere_ritardo', 'preparazione_giornata', 'controllo_prefirma', 'richiami_mese', 'cambiamenti_ultima_visita', 'briefing_previsita'];

export function trovaProcedura(domanda: string, ruolo?: string): ProceduraDef | null {
  const q = domanda.toLowerCase();
  for (const nome of PRIORITA) {
    const p = proceduraPerNome(nome);
    if (!p) continue;
    if (ruolo && !(p.ruoli as string[]).includes(ruolo)) continue;
    if (p.frasi.some((f) => new RegExp(f, 'i').test(q))) return p;
  }
  return null;
}

// Il mese nominato in una domanda («chiusura di agosto 2026») → «2026-08».
export function meseDaDomanda(domanda: string, oggi = new Date()): string | null {
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const m = domanda.toLowerCase().match(new RegExp(`(${mesi.join('|')})(?:\\s+(\\d{4}))?`));
  if (!m) return null;
  const anno = m[2] ? Number(m[2]) : oggi.getFullYear();
  return `${anno}-${String(mesi.indexOf(m[1]) + 1).padStart(2, '0')}`;
}

// Riga per il prompt del modello: così, quando una domanda libera assomiglia
// a una procedura, il modello suggerisce di usarla per nome invece di
// improvvisare.
export function elencoPerPrompt(ruolo: string): string {
  return procedurePerRuolo(ruolo).map((p) => `- «${p.titolo}»: ${p.descrizione.split('.')[0]}.`).join('\n');
}
