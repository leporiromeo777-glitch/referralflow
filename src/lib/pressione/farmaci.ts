// Pressione (7.10.2026, [[Piattaforma/Pressione]]) — la tabella dei farmaci. PURO.
//
// Per ogni principio attivo antipertensivo quattro numeri, in ore dalla presa:
// quando comincia l'effetto, quando è al massimo, quanto dura, l'emivita.
// Servono a disegnare la «finestra d'azione» sopra il profilo delle 24 ore.
//
// QUESTA È UNA BOZZA. I valori qui sotto vengono dalla farmacologia generale e
// NON sono stati letti uno per uno sull'informazione professionale: ogni riga
// nasce «da confermare», e finché un medico dello studio non l'ha controllata
// sul testo ufficiale (swissmedicinfo.ch) e confermata, la pagina NON disegna
// la sua finestra e non la usa in nessun calcolo. È lo stesso patto del
// dizionario della trascrizione: vale solo ciò che una persona ha confermato.

export type Classe = 'ace_inibitore' | 'sartano' | 'calcioantagonista' | 'diuretico' | 'betabloccante' | 'alfabloccante' | 'centrale' | 'antialdosteronico' | 'altro';

export type Farmaco = {
  principio: string;          // nome italiano, minuscolo: è la chiave
  classe: Classe;
  inizio_h: number; picco_h: number; durata_h: number; emivita_h: number;
  // false: l'effetto si costruisce in giorni e non segue l'ora della presa
  // (spironolattone): si mostra in terapia, senza finestra oraria.
  orario_rilevante: boolean;
  radici: string[];           // come compare scritto: radici del nome nelle varie lingue
  marchi: string[];           // nomi commerciali noti (minuscolo)
  nota?: string;
};

export const FONTE_BOZZA = 'Bozza da farmacologia generale: da verificare sull’informazione professionale (swissmedicinfo.ch) prima di confermare.';

const f = (principio: string, classe: Classe, inizio_h: number, picco_h: number, durata_h: number, emivita_h: number, radici: string[], marchi: string[], extra: Partial<Farmaco> = {}): Farmaco =>
  ({ principio, classe, inizio_h, picco_h, durata_h, emivita_h, orario_rilevante: true, radici, marchi, ...extra });

export const FARMACI_BOZZA: Farmaco[] = [
  // ACE-inibitori
  f('enalapril', 'ace_inibitore', 1, 5, 24, 11, ['enalapril'], ['reniten', 'epril']),
  f('lisinopril', 'ace_inibitore', 1, 6, 24, 12, ['lisinopril'], ['zestril', 'prinil']),
  f('perindopril', 'ace_inibitore', 1, 5, 24, 17, ['perindopril'], ['coversum']),
  f('ramipril', 'ace_inibitore', 1.5, 5, 24, 15, ['ramipril'], ['triatec', 'vesdil']),
  f('captopril', 'ace_inibitore', 0.25, 1.25, 7, 2, ['captopril'], ['lopirin']),
  f('quinapril', 'ace_inibitore', 1, 3, 24, 3, ['quinapril'], ['accupro']),
  f('cilazapril', 'ace_inibitore', 1, 5, 24, 9, ['cilazapril'], ['inhibace']),
  f('fosinopril', 'ace_inibitore', 1, 4.5, 24, 12, ['fosinopril'], ['fositen']),
  f('trandolapril', 'ace_inibitore', 1.5, 7, 24, 20, ['trandolapril'], ['gopten']),
  // Sartani
  f('losartan', 'sartano', 1, 6, 24, 8, ['losartan'], ['cosaar']),
  f('valsartan', 'sartano', 2, 5, 24, 8, ['valsartan'], ['diovan']),
  f('candesartan', 'sartano', 2, 7, 24, 9, ['candesartan'], ['atacand', 'blopress']),
  f('irbesartan', 'sartano', 1.5, 4.5, 24, 13, ['irbesartan'], ['aprovel']),
  f('olmesartan', 'sartano', 1.5, 6, 24, 13, ['olmesartan'], ['votum', 'olmetec']),
  f('telmisartan', 'sartano', 2, 6, 24, 24, ['telmisartan'], ['micardis', 'kinzal']),
  f('azilsartan', 'sartano', 2, 5, 24, 11, ['azilsartan'], ['edarbi']),
  f('eprosartan', 'sartano', 1.5, 4, 24, 7, ['eprosartan'], ['teveten']),
  // Calcioantagonisti
  f('amlodipina', 'calcioantagonista', 6, 9, 24, 40, ['amlodipin'], ['norvasc', 'amlo']),
  f('lercanidipina', 'calcioantagonista', 1, 3, 24, 9, ['lercanidipin'], ['zanidip']),
  f('nifedipina', 'calcioantagonista', 1, 6, 24, 7, ['nifedipin'], ['adalat'], { nota: 'Vale per le forme a rilascio prolungato (CR/retard): la forma semplice dura poche ore.' }),
  f('felodipina', 'calcioantagonista', 2, 4, 24, 14, ['felodipin'], ['plendil']),
  f('lacidipina', 'calcioantagonista', 1, 5, 24, 16, ['lacidipin'], ['motens']),
  f('verapamil', 'calcioantagonista', 1.5, 6, 24, 8, ['verapamil'], ['isoptin'], { nota: 'Vale per le forme retard.' }),
  f('diltiazem', 'calcioantagonista', 1, 8, 18, 6, ['diltiazem'], ['dilzem'], { nota: 'Vale per le forme retard.' }),
  // Diuretici
  f('idroclorotiazide', 'diuretico', 2, 5, 10, 10, ['idroclorotiazid', 'hydrochlorothiazid', 'hct'], ['esidrex']),
  f('clortalidone', 'diuretico', 2.5, 4, 48, 50, ['clortalidon', 'chlortalidon', 'chlorthalidon'], ['hygroton']),
  f('indapamide', 'diuretico', 1.5, 12, 24, 18, ['indapamid'], ['fludex']),
  f('torasemide', 'diuretico', 1, 1.5, 7, 3.5, ['torasemid', 'torsemid'], ['torem']),
  f('furosemide', 'diuretico', 0.75, 1.5, 7, 1.5, ['furosemid'], ['lasix']),
  f('amiloride', 'diuretico', 2, 8, 24, 8, ['amilorid'], ['midamor']),
  // Antialdosteronici
  f('spironolattone', 'antialdosteronico', 24, 48, 72, 18, ['spironolatton', 'spironolacton'], ['aldactone', 'xenalon'], { orario_rilevante: false, nota: 'L’effetto si costruisce in giorni: l’ora della presa non sposta il profilo.' }),
  f('eplerenone', 'antialdosteronico', 2, 4, 24, 5, ['eplerenon'], ['inspra']),
  // Betabloccanti
  f('bisoprololo', 'betabloccante', 1.5, 3, 24, 11, ['bisoprolol'], ['concor']),
  f('metoprololo', 'betabloccante', 1.5, 6, 24, 5, ['metoprolol'], ['beloc', 'lopresor'], { nota: 'Vale per le forme a rilascio prolungato (ZOK/retard).' }),
  f('nebivololo', 'betabloccante', 1.5, 4, 24, 10, ['nebivolol'], ['nebilet']),
  f('atenololo', 'betabloccante', 1, 3, 24, 6.5, ['atenolol'], ['tenormin']),
  f('carvedilolo', 'betabloccante', 1, 1.5, 18, 8, ['carvedilol'], ['dilatrend']),
  f('propranololo', 'betabloccante', 1, 2.5, 9, 4.5, ['propranolol'], ['inderal']),
  // Alfabloccanti e centrali
  f('doxazosina', 'alfabloccante', 1.5, 4, 24, 22, ['doxazosin'], ['cardura']),
  f('moxonidina', 'centrale', 1, 3, 24, 2.5, ['moxonidin'], ['physiotens']),
  f('clonidina', 'centrale', 0.75, 3, 8, 14, ['clonidin'], ['catapresan']),
  f('metildopa', 'centrale', 2, 5, 18, 1.7, ['metildopa', 'methyldopa'], ['aldomet']),
  // Altri
  f('aliskiren', 'altro', 1, 2, 24, 40, ['aliskiren'], ['rasilez']),
  f('sacubitril', 'altro', 1, 2, 12, 11.5, ['sacubitril'], ['entresto']),
  f('minoxidil', 'altro', 0.5, 2.5, 48, 4, ['minoxidil'], ['loniten']),
];

// I marchi che contengono PIÙ principi attivi: una riga di terapia può portare
// più finestre. Anche questo elenco è una bozza da confermare coi principi.
export const COMBINAZIONI: Record<string, string[]> = {
  exforge: ['amlodipina', 'valsartan'], 'exforge hct': ['amlodipina', 'valsartan', 'idroclorotiazide'],
  sevikar: ['olmesartan', 'amlodipina'], 'sevikar hct': ['olmesartan', 'amlodipina', 'idroclorotiazide'],
  coveram: ['perindopril', 'amlodipina'], 'coversum combi': ['perindopril', 'indapamide'], triplixam: ['perindopril', 'indapamide', 'amlodipina'],
  entresto: ['sacubitril', 'valsartan'], twynsta: ['telmisartan', 'amlodipina'],
  'co-diovan': ['valsartan', 'idroclorotiazide'], 'co-aprovel': ['irbesartan', 'idroclorotiazide'], 'co-reniten': ['enalapril', 'idroclorotiazide'],
  'atacand plus': ['candesartan', 'idroclorotiazide'], 'micardis plus': ['telmisartan', 'idroclorotiazide'], 'cosaar plus': ['losartan', 'idroclorotiazide'],
  'triatec comp': ['ramipril', 'idroclorotiazide'], 'zestoretic': ['lisinopril', 'idroclorotiazide'], 'votum plus': ['olmesartan', 'idroclorotiazide'],
  'concor plus': ['bisoprololo', 'idroclorotiazide'], 'zanipress': ['enalapril', 'lercanidipina'],
};

const piatto = (s: string): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+/ -]+/g, ' ').replace(/\s+/g, ' ').trim();

// Quali principi attivi ci sono in una riga di terapia scritta a mano
// («Coveram 5/5», «Amlodipin Mepha 10 mg», «valsartan + HCT»). Non indovina:
// ciò che non riconosce resta senza principio, e la pagina lo dice.
export function riconosci(nome: string, tabella: { principio: string; radici?: string[]; marchi?: string[] }[] = FARMACI_BOZZA): string[] {
  const t = piatto(nome);
  if (!t) return [];
  const trovati = new Set<string>();
  // Prima le combinazioni col nome più lungo («exforge hct» prima di «exforge»).
  for (const marchio of Object.keys(COMBINAZIONI).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`(^| )${marchio.replace(/[-/+]/g, '[-/+ ]?')}( |$)`).test(t)) { COMBINAZIONI[marchio].forEach((p) => trovati.add(p)); break; }
  }
  const parole = t.split(/[ +/-]+/).filter(Boolean);
  for (const r of tabella) {
    const radici = r.radici?.length ? r.radici : [r.principio.replace(/[aeo]$/, '')];
    if (radici.some((x) => parole.some((p) => (x.length <= 3 ? p === x : p.startsWith(x))))) trovati.add(r.principio);
    if ((r.marchi ?? []).some((m) => parole.includes(m))) trovati.add(r.principio);
  }
  const noti = new Set(tabella.map((x) => x.principio));
  return [...trovati].filter((p) => noti.has(p));
}

// Un orario «HH:MM» valido, o null. «8», «8.30», «08:30», «8h30».
export function orario(testo: string): string | null {
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*$/.exec(String(testo ?? ''));
  if (!m) return null;
  const h = +m[1], min = +(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
export const oreDi = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return h + m / 60; };

// I quattro numeri devono stare in piedi prima di poter essere confermati.
export function controllaFarmaco(x: { inizio_h: number; picco_h: number; durata_h: number; emivita_h: number }): string | null {
  const v = [x.inizio_h, x.picco_h, x.durata_h, x.emivita_h];
  if (v.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return 'Servono quattro numeri, in ore.';
  if (x.inizio_h > x.picco_h) return 'L’inizio dell’effetto non può venire dopo il picco.';
  if (x.picco_h > x.durata_h) return 'Il picco non può venire dopo la fine dell’effetto.';
  if (x.durata_h < 1 || x.durata_h > 96) return 'La durata va fra 1 e 96 ore.';
  if (x.emivita_h <= 0 || x.emivita_h > 120) return 'L’emivita va fra 0 e 120 ore.';
  return null;
}
