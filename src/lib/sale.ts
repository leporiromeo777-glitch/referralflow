// Di chi è quale stanza (15.9.2026).
//
// Le regole stanno nella pagina wiki «Medici/Sale»: si cambia la pagina, non
// il codice — come per i percorsi e i moduli. Qui solo il parser e la logica,
// entrambi puri e testati.
//
// Perché NON lo fa un modello: «se c'è Tiziano dalle 13 la Sala 3 è sua» è una
// regola, e una regola il codice la esegue sempre uguale e sa spiegare perché.
// Un modello la eseguirebbe quasi sempre, e ogni mattina toccherebbe
// verificarlo. Cleo la racconta, non la decide.
//
// E una cosa che il piano NON fa: non pretende una stanza per ogni
// appuntamento. Misurato sull'agenda vera, al picco servono 20 posti e le
// stanze sono 11 — perché una fetta in agenda vuol dire «pratica aperta», non
// «persona dentro una stanza». Il piano dice di chi è ogni stanza e segnala le
// ore in cui la capienza non basta; chi entra lo decide chi è lì.

export type FasciaSala = { dalle: string; chi: string };
export type Sala = {
  nome: string;
  di: string;            // titolare, o 'condivisa'
  fasce: FasciaSala[];   // «Dalle 13:00: Tiziano Moccetti»
  chi: string[];         // i nomi che se la dividono, quando è condivisa
  giorni: string[];      // 'lun'…'ven'; vuoto = tutti
  funzione: string;      // a che serve la stanza: «ecografia», «laboratorio»…
  ultima: boolean;       // si riempie solo se le altre non bastano
  nota: string;
  stato: string;         // 'proposta' | 'validato'
};

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

// Chi non entra nel piano delle sale (15.9.2026). Nella pagina, PRIMA della
// prima stanza, una riga «- Fuori dal piano: Nome, Nome». Sono persone che
// lavorano in studio ma le cui sedute non occupano una sala dei medici — la
// riabilitazione, per dire — e contarle fra le «visite senza sala» farebbe
// sembrare un problema una cosa che non lo è.
export function fuoriDalPiano(markdown: string): string[] {
  return elencoInTesta(markdown, 'fuori dal piano');
}

// Le prestazioni che non occupano una sala: quelle che si fanno altrove (una
// risonanza, un intervento in ospedale) o al telefono. Riga «- Prestazioni
// fuori dal piano: …», sempre prima della prima stanza.
//
// Con un'eccezione per persona, perché la realtà non è pulita: la risonanza
// in sé non occupa una stanza dello studio, ma quelle di Vera Paiocchi sì —
// le segue lei, nella sua sala. Si scrive «Risonanza magnetica (tranne Vera
// Lucia Paiocchi)».
export type PrestazioneFuori = { nome: string; tranne: string[] };

// Chi non si sposta. Due righe in testa alla pagina, con due forze diverse:
//
//   «- Sempre e solo: Vera Lucia Paiocchi in Sala 1»
//     la sua è quella e nient'altro — detto dallo studio il 15.9.2026.
//   «- Solo in: Marco Moccetti in Sala 2 o Sala 3»
//     può stare in una di quelle, mai altrove — detto dallo studio il
//     16.9.2026: niente sale dello sport, niente Sala 4 e 5.
//
// La differenza fra le due è quante stanze ammettono, non come funzionano.
//
// La riga dice DUE cose, e la seconda è arrivata con Vanja Paveri il
// 16.9.2026: quelle stanze sono le sue fra cui scegliere — anche quando il
// titolare è un altro — e fuori da lì non va. Senza la prima metà la regola
// non servirebbe a niente per chi nella pagina non ha nessuna stanza: Paveri
// resterebbe «senza sala» come prima, e dire dove NON può stare non la mette
// da nessuna parte. Non è un cambio di titolare: la usa quando è libera, e se
// il titolare ce l'ha occupata la visita si vede accavallata come tutte le
// altre.
//
// Le stanze si separano con «o» (o con «e»), non con la virgola: la virgola
// in questa pagina separa le VOCI dell'elenco, e «in Sala 2, Sala 3» si
// leggerebbe come due persone.
export type SoloIn = { chi: string; stanze: string[] };

export function soloIn(markdown: string): SoloIn[] {
  const leggi = (voce: string): SoloIn | null => {
    const m = /^(.+?)\s+in\s+(.+)$/i.exec(voce.trim());
    if (!m) return null;
    const stanze = m[2].split(/\s*,\s*|\s+o\s+|\s+e\s+/i).map((x) => x.trim()).filter(Boolean);
    return stanze.length ? { chi: m[1].trim(), stanze } : null;
  };
  return [...elencoInTesta(markdown, 'sempre e solo'), ...elencoInTesta(markdown, 'solo in')]
    .map(leggi).filter((x): x is SoloIn => !!x);
}

// «Sala 2 o Sala 3», come si scrive in una frase.
export function elencoStanze(stanze: string[]): string {
  const s = stanze ?? [];
  if (s.length <= 1) return s[0] ?? '';
  return `${s.slice(0, -1).join(', ')} o ${s[s.length - 1]}`;
}

export function stanzaAmmessa(stanza: string, vincolo: SoloIn | undefined): boolean {
  if (!vincolo) return true;
  return vincolo.stanze.some((x) => x.toLowerCase() === String(stanza ?? '').toLowerCase());
}

// Le AGENDE che non contano per le sale (16.9.2026). In MediOnline una
// colonna è un'agenda, non un luogo, e alcune non sono di medici: «Labor» è
// il prelievo. Il paziente del laboratorio passa in studio, ma non occupa una
// stanza dei medici — e siccome quell'appuntamento arriva senza titolare, il
// medico gli veniva prestato da chi vede quel paziente quel giorno, facendogli
// prendere una stanza che non serve. Riga «- Agende fuori dal piano: Labor».
export function agendeFuoriPiano(markdown: string): string[] {
  return elencoInTesta(markdown, 'agende fuori dal piano');
}

// Il confronto è sul nome della colonna, senza maiuscole né spazi: nella
// pagina si scrive «Labor» come si vede in agenda.
export function agendaEsclusa(agenda: string, lista: string[]): boolean {
  const a = String(agenda ?? '').trim().toLowerCase();
  if (!a) return false;
  return (lista ?? []).some((x) => x.trim().toLowerCase() === a);
}

export function prestazioniFuoriPiano(markdown: string): PrestazioneFuori[] {
  return elencoInTesta(markdown, 'prestazioni fuori dal piano').map((voce) => {
    const m = /^(.*?)\s*\(\s*tranne\s+(.+?)\s*\)\s*$/i.exec(voce);
    if (!m) return { nome: voce, tranne: [] };
    return { nome: m[1].trim(), tranne: m[2].split(/\s*[,;]\s*|\s+e\s+/).map((x) => x.trim()).filter(Boolean) };
  });
}

// Questa prestazione, fatta da questa persona, sta fuori dal piano?
export function prestazioneEsclusa(prestazione: string, chi: string, lista: PrestazioneFuori[]): boolean {
  if (!prestazione) return false;
  return (lista ?? []).some((p) => escluso(prestazione, [p.nome]) && !escluso(chi, p.tranne));
}

function elencoInTesta(markdown: string, chiave: string): string[] {
  // La stessa chiave può tornare su più righe e i valori si sommano: sei
  // persone con «Solo in» su una riga sola non si leggono più.
  const tutte: string[] = [];
  for (const grezza of (markdown ?? '').split('\n')) {
    const riga = grezza.trim();
    if (riga.startsWith('## ')) break;                 // da qui in poi sono stanze
    const m = /^[-*]\s*`?([^:`]+)`?\s*:\s*(.+)$/.exec(riga);
    if (m && m[1].trim().toLowerCase() === chiave) {
      // Le virgole DENTRO una parentesi non separano una voce: «Risonanza
      // magnetica (tranne Paiocchi, Rego)» è una voce sola.
      const fuori: string[] = [];
      let pezzo = '', dentro = 0;
      for (const c of m[2]) {
        if (c === '(') dentro++;
        else if (c === ')') dentro = Math.max(0, dentro - 1);
        if (c === ',' && dentro === 0) { fuori.push(pezzo); pezzo = ''; continue; }
        pezzo += c;
      }
      fuori.push(pezzo);
      tutte.push(...fuori.map((x) => x.replace(/[`*]/g, '').trim()).filter(Boolean));
    }
  }
  return tutte;
}

// Questa persona è fuori dal piano? Il confronto è quello dei nomi: «Andrea
// Bronz» riconosce anche «Bronz Andrea» e «Dr. Andrea Bronz».
export function escluso(nome: string, fuori: string[]): boolean {
  return (fuori ?? []).some((f) => uguali(f, nome));
}

export function leggiSale(markdown: string): Sala[] {
  const fuori: Sala[] = [];
  let corrente: Sala | null = null;
  for (const grezza of (markdown ?? '').split('\n')) {
    const riga = grezza.trim();
    const titolo = /^##\s+(.+)$/.exec(riga);
    if (titolo) {
      corrente = { nome: titolo[1].trim(), di: '', fasce: [], chi: [], giorni: [], funzione: '', nota: '', stato: 'proposta', ultima: false };
      fuori.push(corrente);
      continue;
    }
    if (!corrente) continue;
    // «Dalle 13:00: Tiziano Moccetti» va riconosciuta PRIMA della regola
    // generica «chiave: valore», altrimenti i due punti dell'ora la spezzano
    // e la chiave diventa «dalle 13».
    const fascia = /^[-*]\s+dalle\s+(\d{1,2})[:.](\d{2})\s*:\s*(.+)$/i.exec(riga);
    if (fascia) {
      corrente.fasce.push({ dalle: `${fascia[1].padStart(2, '0')}:${fascia[2]}`, chi: fascia[3].trim() });
      continue;
    }
    const voce = /^[-*]\s+([^:]+):\s*(.*)$/.exec(riga);
    if (!voce) continue;
    const chiave = voce[1].trim().toLowerCase();
    const valore = voce[2].trim();
    if (chiave === 'di') corrente.di = valore;
    else if (chiave === 'chi') corrente.chi = valore.split(',').map((x) => x.trim()).filter(Boolean);
    else if (chiave === 'giorni') corrente.giorni = valore.toLowerCase().split(/[\s,]+/).filter((g) => GIORNI.includes(g));
    else if (chiave === 'funzione') corrente.funzione = valore;
    else if (chiave === 'ultima') corrente.ultima = /^(s|y|1|v)/i.test(valore);
    else if (chiave === 'nota') corrente.nota = valore;
    else if (chiave === 'stato') corrente.stato = valore.toLowerCase();
  }
  // Le fasce si ordinano per ora: la regola più tarda vince su quella prima.
  for (const s of fuori) s.fasce.sort((a, b) => a.dalle.localeCompare(b.dalle));
  return fuori.filter((s) => s.di || s.chi.length);
}

// Di chi è la stanza a una certa ora di un certo giorno.
// `presenti` sono i nomi di chi è in studio quel giorno: una fascia vale solo
// se la persona c'è davvero (Tiziano il venerdì non c'è, e la 3 resta di Marco).
export function titolare(
  sala: Sala,
  ora: string,
  giorno: string,
  presenti: string[] = []
): { chi: string; perche: string } {
  const presente = (nome: string) => !presenti.length || presenti.some((p) => uguali(p, nome));
  if (sala.giorni.length && !sala.giorni.includes(giorno)) {
    return { chi: sala.di === 'condivisa' ? '' : sala.di, perche: 'la regola oraria non vale in questo giorno' };
  }
  for (let i = sala.fasce.length - 1; i >= 0; i--) {
    const f = sala.fasce[i];
    if (ora >= f.dalle && presente(f.chi)) return { chi: f.chi, perche: `dalle ${f.dalle}` };
  }
  if (sala.di && sala.di !== 'condivisa') return { chi: sala.di, perche: 'titolare' };
  const disponibili = sala.chi.filter(presente);
  if (disponibili.length === 1) return { chi: disponibili[0], perche: 'è l’unico presente fra chi la divide' };
  if (disponibili.length > 1) return { chi: '', perche: `condivisa fra ${disponibili.join(', ')}` };
  return { chi: '', perche: 'libera' };
}

function uguali(a: string, b: string): boolean {
  const n = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(dr|dr\.ssa|prof|med|ssa)\b\.?/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).sort().join(' ');
  const x = n(a), y = n(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// Quante stanze servirebbero, momento per momento, e quando non bastano.
// `appuntamenti` sono {inizio, fine} in minuti dalla mezzanotte.
export function capienza(
  appuntamenti: { inizio: number; fine: number }[],
  stanze: number
): { picco: number; oreOltre: string[]; minutiOltre: number } {
  if (!appuntamenti.length) return { picco: 0, oreOltre: [], minutiOltre: 0 };
  const momenti = [...new Set(appuntamenti.map((a) => a.inizio))].sort((a, b) => a - b);
  let picco = 0;
  const oltre: number[] = [];
  for (const m of momenti) {
    const insieme = appuntamenti.filter((a) => a.inizio <= m && m < a.fine).length;
    if (insieme > picco) picco = insieme;
    if (insieme > stanze) oltre.push(m);
  }
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { picco, oreOltre: oltre.map(hm), minutiOltre: oltre.length ? oltre[oltre.length - 1] - oltre[0] : 0 };
}

// Le regole delle sale in forma leggibile per il modello. Cleo NON decide di
// chi è una stanza — quello lo fa `titolare()` — ma quando la capienza non
// basta, o manca qualcuno, o arriva un'urgenza, serve un giudizio con dei
// compromessi: lì il modello propone e la persona decide. Perciò riceve le
// regole com'è scritte, non le conclusioni.
export function salePerPrompt(sale: Sala[]): string {
  return sale
    .map((s) => {
      // «condivisa» senza l'elenco di chi la divide è una regola incompleta:
      // si dice così invece di scrivere «condivisa fra » e basta.
      const pezzi = [
        s.di === 'condivisa'
          ? (s.chi.length ? `condivisa fra ${s.chi.join(', ')}` : 'condivisa, ma nella pagina non è scritto fra chi')
          : `di ${s.di}`,
      ];
      for (const f of s.fasce) pezzi.push(`dalle ${f.dalle} di ${f.chi}`);
      if (s.giorni.length) pezzi.push(`solo ${s.giorni.join(' ')}`);
      if (s.stato && s.stato !== 'validato') pezzi.push(`regola ancora «${s.stato}»`);
      return `- ${s.nome}: ${pezzi.join('; ')}${s.nota ? ` — ${s.nota}` : ''}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Il piano della giornata: chi sta dove, fascia per fascia.
//
// Lo prepara il CODICE dalle regole. Quel che resta scoperto — una stanza
// condivisa con più persone presenti, o nessuna — esce in `daDecidere`: è lì,
// e solo lì, che ha senso chiedere una proposta a un modello.

export type Segmento = { dalle: string; alle: string; chi: string; perche: string; manuale?: boolean; fonte?: 'mano' | 'ai' };
export type RigaPiano = { stanza: string; segmenti: Segmento[]; funzione: string; nota: string; stato: string; ultima: boolean };
export type Piano = { giorno: string; righe: RigaPiano[]; daDecidere: { stanza: string; dalle: string; alle: string; perche: string }[] };

const APERTURA = '07:00';
const CHIUSURA = '19:30';

export function pianoDelGiorno(sale: Sala[], presenti: string[], giorno: string): Piano {
  const righe: RigaPiano[] = [];
  const daDecidere: Piano['daDecidere'] = [];
  for (const s of sale) {
    // I confini delle fasce sono l'apertura più le ore scritte nella regola.
    const confini = [APERTURA, ...s.fasce.map((f) => f.dalle), CHIUSURA]
      .filter((x, i, v) => v.indexOf(x) === i)
      .sort();
    const segmenti: Segmento[] = [];
    for (let i = 0; i < confini.length - 1; i++) {
      const t = titolare(s, confini[i], giorno, presenti);
      const ultimo = segmenti[segmenti.length - 1];
      // Fasce contigue con lo stesso titolare si fondono: «di Marco dalle 7
      // alle 13» invece di tre righe uguali.
      if (ultimo && ultimo.chi === t.chi && ultimo.perche === t.perche) ultimo.alle = confini[i + 1];
      else segmenti.push({ dalle: confini[i], alle: confini[i + 1], chi: t.chi, perche: t.perche });
    }
    righe.push({ stanza: s.nome, segmenti, funzione: s.funzione, nota: s.nota, stato: s.stato, ultima: s.ultima });
    for (const seg of segmenti) {
      if (!seg.chi && seg.perche.startsWith('condivisa fra')) {
        daDecidere.push({ stanza: s.nome, dalle: seg.dalle, alle: seg.alle, perche: seg.perche });
      }
    }
  }
  return { giorno, righe, daDecidere };
}

// Quel che si manda al modello quando c'è qualcosa da decidere: il piano già
// risolto, le caselle aperte e chi è in studio. Nessun nome di paziente.
export function daDeciderePerPrompt(piano: Piano, presenti: string[]): string {
  const fatto = piano.righe
    .flatMap((r) => r.segmenti.filter((s) => s.chi).map((s) => `${r.stanza} ${s.dalle}-${s.alle}: ${s.chi}`))
    .join('\n');
  const aperte = piano.daDecidere.map((d) => `${d.stanza} ${d.dalle}-${d.alle}: ${d.perche}`).join('\n');
  return `IN STUDIO OGGI: ${presenti.join(', ') || 'nessuno'}\n\nGIÀ DECISO DALLE REGOLE:\n${fatto}\n\nDA DECIDERE:\n${aperte}`;
}

// ---------------------------------------------------------------------------
// Le correzioni a mano (15.9.2026).
//
// Le regole fanno il piano, ma la giornata vera cambia: uno non viene, una
// stanza serve a un altro. Chi è in studio corregge la singola fascia e la
// correzione vale per quel giorno soltanto — la pagina wiki resta la regola.
// Una fascia corretta si vede: `manuale` è vero e il perché lo dice.

export type ModificaSala = { stanza: string; dalle: string; chi: string; da?: string; fonte?: 'mano' | 'ai' };

// I vincoli valgono ANCHE contro una correzione a mano (16.9.2026). Prima no,
// e si vedeva: il 16.9 il piano di oggi portava ancora «Sport 1 → Marco
// Moccetti», scritto a mano quando la regola «solo in Sala 2 o Sala 3» non
// esisteva. Una correzione vale per il giorno, una regola vale sempre: se si
// contraddicono vince la regola, e la correzione scaduta smette da sola di
// avere effetto invece di restare lì a dire una cosa falsa.
export function applicaModifiche(righe: RigaPiano[], modifiche: ModificaSala[], vincoli: SoloIn[] = []): RigaPiano[] {
  if (!modifiche?.length) return righe;
  const chiave = (stanza: string, dalle: string) => `${stanza.toLowerCase()}|${dalle}`;
  // L'ultima correzione su una fascia è quella che vale.
  const per = new Map<string, ModificaSala>();
  for (const m of modifiche) {
    if (!modificaAmmessa(m, vincoli)) continue;
    per.set(chiave(m.stanza ?? '', m.dalle ?? ''), m);
  }
  return righe.map((r) => ({
    ...r,
    segmenti: r.segmenti.map((s) => {
      const m = per.get(chiave(r.stanza, s.dalle));
      if (!m) return s;
      const da = m.da ? ` da ${m.da}` : '';
      // Una proposta confermata NON è una correzione a mano: veniva scritta
      // nello stesso posto e l'etichetta diceva «a mano» anche quando la
      // stanza l'aveva scelta il modello.
      const ai = m.fonte === 'ai';
      const come = ai ? `proposta dall'AI, confermata${da}` : `assegnata a mano${da}`;
      return { ...s, chi: m.chi ?? '', manuale: true, fonte: ai ? 'ai' : 'mano',
        perche: m.chi ? come : `liberata a mano${da}` };
    }),
  }));
}

// Il vincolo di questa persona, riconoscendola come ovunque nel file: senza
// titoli, senza accenti, nome e cognome in qualsiasi ordine.
export function vincoloDi(chi: string, vincoli: SoloIn[] = []): SoloIn | undefined {
  const n = String(chi ?? '').trim();
  if (!n) return undefined;
  return (vincoli ?? []).find((x) => uguali(x.chi, n));
}

// Una correzione può liberare una fascia (chi vuoto): quella passa sempre.
export function modificaAmmessa(m: ModificaSala, vincoli: SoloIn[] = []): boolean {
  const chi = String(m?.chi ?? '').trim();
  if (!chi) return true;
  return stanzaAmmessa(String(m?.stanza ?? ''), vincoloDi(chi, vincoli));
}

// ---------------------------------------------------------------------------
// Quando una sala ha le visite (15.9.2026).
//
// MediOnline non scrive MAI in quale stanza avviene una visita: scrive di chi
// è l'agenda. Quindi la stanza si deduce, e la deduzione è una sola riga:
// una visita sta in una delle stanze che il suo medico ha in quel momento.
// Quando il medico ne ha più d'una — Marco ha la 1, la 2 e la 3 — le visite si
// distribuiscono nell'ordine in cui cominciano, ognuna nella prima stanza
// libera: è esattamente ciò che vuol dire «tiene tre pazienti in parallelo».
// Se le stanze non bastano la visita resta segnata `sovra`: non la si nasconde
// e non si inventa una stanza in più.

// `corsia`/`corsie`: quante visite corrono INSIEME in quella stanza e quale
// posto occupa questa. Non è un dettaglio di disegno — è la capienza vera: se
// una stanza ha due corsie, lì dentro ci sono due pazienti nello stesso
// momento. Chi disegna ci fa due colonne affiancate invece di due riquadri
// uno sopra l'altro.
export type VisitaSala = { id: string; inizio: string; fine: string; etichetta: string; sovra: boolean; corsia: number; corsie: number };
export type VisitaGrezza = { id: string; chi: string; start: string; dur: number; etichetta?: string };

export function assegnaVisite(righe: RigaPiano[], visite: VisitaGrezza[], vincoli: SoloIn[] = []): Record<string, VisitaSala[]> {
  const min = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const fuori: Record<string, VisitaSala[]> = {};
  // Chi c'è dentro a ogni stanza, momento per momento. Prima si teneva solo
  // «da quando è libera», che basta finché si guarda una persona sola: non
  // sapendo CHI c'era dentro, una visita che non trovava posto finiva nella
  // stanza meno carica, anche se lì stava lavorando un altro medico. Due
  // cardiologi nella stessa stanza alla stessa ora non esistono (16.9.2026).
  const dentro: Record<string, { da: number; a: number; chi: string }[]> = {};
  for (const r of righe) { fuori[r.stanza] = []; dentro[r.stanza] = []; }
  const ordinate = [...visite].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

  // Le stanze che questa persona ha PER REGOLA in quel momento, sempre dentro
  // il suo vincolo. Prima le normali, le «ultime» solo se le altre non
  // bastano: le sale dello sport si aprono quando servono, non per prime.
  const sueDiRegola = (v: VisitaGrezza, vincolo?: SoloIn) => righe
    .filter((r) => (r.segmenti ?? []).some((sg) => sg.chi && uguali(sg.chi, v.chi) && v.start >= sg.dalle && v.start < sg.alle))
    .filter((r) => stanzaAmmessa(r.stanza, vincolo))
    .sort((a, b) => Number(a.ultima) - Number(b.ultima));

  const collocate = new Set<string>();
  const vincoloDiVisita = (v: VisitaGrezza) => (vincoli ?? []).find((x) => uguali(x.chi, v.chi));
  // Le altre stanze che il vincolo ammette ma che non sono sue per regola.
  const altreAmmesse = (v: VisitaGrezza, vincolo?: SoloIn) => {
    if (!vincolo) return [] as RigaPiano[];
    const sua = new Set(sueDiRegola(v, vincolo).map((r) => r.stanza));
    return righe
      .filter((r) => stanzaAmmessa(r.stanza, vincolo) && !sua.has(r.stanza))
      .sort((a, b) => Number(a.ultima) - Number(b.ultima));
  };

  const prova = (v: VisitaGrezza, candidate: RigaPiano[], accavalla: boolean) => {
    if (!candidate.length) return false;
    const i = min(v.start), f = i + Math.max(5, v.dur || 30);
    const occupanti = (stanza: string) => dentro[stanza].filter((x) => x.da < f && x.a > i);
    let scelta = candidate.find((r) => !occupanti(r.stanza).length);
    // Accavallare si fa solo all'ultimo giro, e solo dove c'è già LUI: sta
    // tenendo due pazienti in parallelo, ed è la cosa che succede davvero in
    // ambulatorio. Dove lavora un ALTRO medico non si entra mai: due
    // cardiologi nella stessa stanza alla stessa ora non esistono, e la visita
    // finisce fra le «visite senza sala» — che è un problema da risolvere, non
    // una stanza inventata con due medici dentro (16.9.2026).
    if (!scelta && accavalla) scelta = candidate.find((r) => occupanti(r.stanza).every((x) => uguali(x.chi, v.chi)));
    if (!scelta) return false;
    const sovra = !!occupanti(scelta.stanza).length;
    fuori[scelta.stanza].push({ id: v.id, inizio: v.start, fine: hm(f), etichetta: v.etichetta ?? '', sovra, corsia: 0, corsie: 1 });
    dentro[scelta.stanza].push({ da: i, a: f, chi: v.chi });
    collocate.add(v.id);
    return true;
  };

  // Tre giri, in quest'ordine.
  //
  // 1. Ognuno nelle stanze vuote che ha PER REGOLA. Il titolare viene prima di
  //    chi la stanza la usa soltanto perché un vincolo glielo permette:
  //    altrimenti vince chi comincia prima, e il 16.9.2026 Tiziano Moccetti si
  //    prendeva la Sala 4 lasciando fuori Rego, che ne è il titolare.
  for (const v of ordinate) {
    if (!v.chi) continue;
    prova(v, sueDiRegola(v, vincoloDiVisita(v)), false);
  }
  // 2. Chi è rimasto fuori prova le altre stanze VUOTE che il suo vincolo
  //    ammette. È il caso di chi nella pagina una stanza non ce l'ha: senza
  //    questo giro «solo in Sport 1 o Sport 2 o Sport 3» non lo metterebbe da
  //    nessuna parte.
  for (const v of ordinate) {
    if (!v.chi || collocate.has(v.id)) continue;
    prova(v, altreAmmesse(v, vincoloDiVisita(v)), false);
  }
  // 3. Solo adesso si accavalla, e solo su sé stessi.
  for (const v of ordinate) {
    if (!v.chi || collocate.has(v.id)) continue;
    const vincolo = vincoloDiVisita(v);
    prova(v, [...sueDiRegola(v, vincolo), ...altreAmmesse(v, vincolo)], true);
  }

  for (const stanza of Object.keys(fuori)) corsie(fuori[stanza], min);
  return fuori;
}

// Le corsie dentro una stanza: si scorrono le visite in ordine d'inizio, si
// tiene aperto il gruppo finché una comincia prima che l'ultima sia finita, e
// dentro il gruppo ognuna prende la prima corsia libera. Due visite che si
// sovrappongono non finiscono mai nella stessa corsia.
function corsie(visite: VisitaSala[], min: (t: string) => number): void {
  visite.sort((a, b) => a.inizio.localeCompare(b.inizio) || a.id.localeCompare(b.id));
  let gruppo: VisitaSala[] = [];
  let fine = -1;
  const chiudi = () => {
    if (!gruppo.length) return;
    const fini: number[] = [];
    for (const v of gruppo) {
      let i = 0;
      while (fini[i] !== undefined && fini[i] > min(v.inizio)) i++;
      fini[i] = min(v.fine);
      v.corsia = i;
    }
    for (const v of gruppo) v.corsie = fini.length;
    gruppo = []; fine = -1;
  };
  for (const v of visite) {
    if (gruppo.length && min(v.inizio) >= fine) chiudi();
    gruppo.push(v);
    fine = Math.max(fine, min(v.fine));
  }
  chiudi();
}

// Che cosa si manda al modello quando c'è qualcosa da sistemare (15.9.2026).
//
// Non solo le caselle aperte: da quando le visite entrano nel piano si sa
// anche quali stanze restano vuote tutto il giorno e chi lavora senza averne
// una. È lì che una proposta serve davvero — e resta una proposta: chi entra
// in quale stanza lo decide chi è in studio. Nessun nome di paziente.
export function daSistemarePerPrompt(
  piano: Piano,
  presenti: string[],
  libere: FasciaLibera[],
  senzaSala: { chi: string; n: number }[],
  vincoli: SoloIn[] = []
): string {
  const pezzi = [daDeciderePerPrompt(piano, presenti)];
  // I vincoli fissi vanno DETTI al modello, non solo applicati dopo: una
  // proposta che li viola viene scartata, e scartarla in silenzio vuol dire
  // una casella che resta aperta senza che nessuno sappia perché.
  if (vincoli.length) {
    pezzi.push(`\nVINCOLI FISSI — una proposta che li viola viene scartata:\n${
      vincoli.map((v) => `- ${v.chi}: solo in ${elencoStanze(v.stanze)}, mai altrove`).join('\n')}`);
  }
  pezzi.push(`\nQUANDO LE STANZE SONO LIBERE OGGI (una stanza si prende solo per il tempo delle visite, non per tutto il giorno):\n${libere.length
    ? libere.map((l) => `- ${l.stanza} ${l.dalle}-${l.alle}${l.di ? ` (intestata a ${l.di})` : ''}${l.ultima ? ' — da usare solo se le altre non bastano' : ''}`).join('\n')
    : '- nessuna: ogni fascia di ogni stanza ha visite'}`);
  pezzi.push(`\nCHI LAVORA OGGI SENZA UNA SALA:\n${senzaSala.length
    ? senzaSala.map((s) => `- ${s.chi}: ${s.n} ${s.n === 1 ? 'visita' : 'visite'}`).join('\n')
    : '- nessuno: tutti hanno una stanza'}`);
  return pezzi.join('\n');
}

// ---------------------------------------------------------------------------
// Leggere la proposta del modello per applicarla (15.9.2026).
//
// «Confermo» deve cambiare la giornata sotto, non solo mettere un timbro. Ma
// la proposta è testo libero, e un testo libero non si esegue a fiducia.
//
// Perciò al modello si chiede di scrivere ogni assegnazione su una riga sua,
// in una forma fissa — «ASSEGNA <stanza> -> <persona>» — e qui si leggono solo
// quelle. Un modello piccolo che scrive «2. Sport 1 (intestata a Capelli):
// assegnare a Marco Moccetti» non viene indovinato: viene scartato e detto.
// Si accetta ancora anche la forma vecchia «<stanza> … → <persona>» a inizio
// riga, con o senza numero davanti, perché una proposta già scritta così
// continui a funzionare.
//
// La persona si cerca sempre DOPO la freccia: «Sala 2 (intestata a Moccetti)
// → Cassani» assegna a Cassani, non a Moccetti.

export type RigaProposta = { stanza: string; chi: string; riga: string };
export type LetturaProposta = { applicabili: RigaProposta[]; saltate: { riga: string; perche: string }[] };

const FRECCE = ['→', '->', '=>', '⟶'];

export function leggiProposta(testo: string, righe: RigaPiano[], persone: string[], vincoli: SoloIn[] = []): LetturaProposta {
  const applicabili: RigaProposta[] = [];
  const saltate: { riga: string; perche: string }[] = [];
  // Le stanze più lunghe prima: «Sport 1» non dev'essere letta come «Sport».
  const stanze = righe.map((r) => r.stanza).sort((a, b) => b.length - a.length);
  for (const grezza of String(testo ?? '').split('\n')) {
    // Via il numero o il trattino dell'elenco, e la parola chiave ASSEGNA.
    const riga = grezza.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/^assegna\s+/i, '').trim();
    if (!riga) continue;
    const stanza = stanze.find((s) => riga.toLowerCase().startsWith(s.toLowerCase()));
    if (!stanza) continue;                       // riga che non parla di una stanza: non è un errore
    const taglio = FRECCE.map((f) => riga.indexOf(f)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (taglio === undefined) { saltate.push({ riga, perche: 'non dice a chi va la stanza' }); continue; }
    const coda = riga.slice(taglio + 1);
    const trovate = persone
      .map((p) => ({ p, dove: posizioneNome(coda, p) }))
      .filter((x) => x.dove >= 0)
      .sort((a, b) => a.dove - b.dove);
    if (!trovate.length) { saltate.push({ riga, perche: 'non nomina nessuno di chi è in studio oggi' }); continue; }
    if (trovate.length > 1 && trovate[0].dove === trovate[1].dove) {
      saltate.push({ riga, perche: 'il nome può essere di due persone' }); continue;
    }
    const piano = righe.find((r) => r.stanza === stanza)!;
    const turni = piano.segmenti.filter((s) => s.chi);
    if (turni.length > 1) { saltate.push({ riga, perche: `${stanza} ha già due turni nella giornata` }); continue; }
    // Le contraddizioni non si applicano: un modello che scrive «Sala 5 a
    // Pedrotti» e due righe sotto «Sala 5 a Franscella» non ha deciso, e
    // applicare l'ultima riga sarebbe scegliere noi al posto suo. Vale anche
    // al contrario: la stessa persona in due stanze.
    const chi = trovate[0].p;
    const vincolo = (vincoli ?? []).find((x) => uguali(x.chi, chi));
    if (vincolo && !stanzaAmmessa(stanza, vincolo)) {
      saltate.push({ riga, perche: `${chi} sta solo in ${elencoStanze(vincolo.stanze)}` });
      continue;
    }
    const giaStanza = applicabili.find((x) => x.stanza === stanza);
    if (giaStanza) { saltate.push({ riga, perche: `${stanza} era già stata assegnata a ${giaStanza.chi}` }); continue; }
    const giaPersona = applicabili.find((x) => x.chi === chi);
    if (giaPersona) { saltate.push({ riga, perche: `${chi} aveva già ${giaPersona.stanza}` }); continue; }
    applicabili.push({ stanza, chi, riga });
  }

  // Secondo tempo: nessuno finisce con DUE stanze. Il 16.9.2026 il modello ha
  // dato la Sala 3, rimasta vuota, a Daniela Cassani, che ha già la Sala 5: nel
  // calendario risultava in due stanze insieme. Una stanza vuota può restare
  // vuota; se una persona ne ha davvero bisogno di due lo dice la pagina wiki
  // o una correzione a mano, non una proposta che riempie un buco perché c'è.
  //
  // Va guardato DOPO, non riga per riga: uno SCAMBIO è legittimo — «Sala 2 a
  // Cassani, Sport 1 a Moccetti» non lascia a Moccetti due stanze, perché la
  // sua passa a un'altra. Conta come finisce il giro, non l'ordine delle righe.
  const cambiaPadrone = new Set(applicabili.map((a) => a.stanza.toLowerCase()));
  const tenute: typeof applicabili = [];
  for (const a of applicabili) {
    const sueAltre = (righe ?? []).filter((r) => r.stanza.toLowerCase() !== a.stanza.toLowerCase()
      && !cambiaPadrone.has(r.stanza.toLowerCase())
      && (r.segmenti ?? []).some((sg) => sg.chi && uguali(sg.chi, a.chi)));
    if (sueAltre.length) {
      saltate.push({ riga: a.riga, perche: `${a.chi} ha già ${sueAltre[0].stanza} nel piano di oggi` });
      continue;
    }
    tenute.push(a);
  }
  return { applicabili: tenute, saltate };
}

// Dove compare il cognome (o il nome) di questa persona, come parola intera.
function posizioneNome(testo: string, persona: string): number {
  const t = ` ${testo.toLowerCase()} `;
  const parole = persona.toLowerCase()
    .replace(/\b(prof|dr|dott|med|ssa)\b\.?/g, ' ')
    .split(/[^a-zà-ÿ]+/i)
    .filter((w) => w.length > 2);
  let dove = -1;
  for (const w of parole) {
    const i = t.indexOf(` ${w} `);
    const j = t.search(new RegExp(`[^a-zà-ÿ]${w}[^a-zà-ÿ]`, 'i'));
    const k = i >= 0 ? i : j;
    if (k >= 0 && (dove < 0 || k < dove)) dove = k;
  }
  return dove;
}

// ---------------------------------------------------------------------------
// Di chi è un appuntamento che non ha un medico (15.9.2026).
//
// In MediOnline «Appar», «Labor», «DC» non sono agende di medici: sono colonne
// di apparecchi e di servizi. Chi prenota mette lì il paziente e la colonna non
// porta un nome, quindi l'appuntamento arriva senza titolare — e il piano lo
// segnava «senza medico» anche quando in studio sanno benissimo di chi è.
//
// Si ricostruisce da un fatto: quel paziente, quel giorno, vede un medico. Su
// trenta giorni di agenda vera funziona nel 92 % dei casi per Labor, 87 % per
// DC, 71 % per Appar. È una DEDUZIONE, e va detta come tale: dove il paziente
// non vede nessuno, «senza medico» resta la risposta onesta.

// Una fascia senza visite, non una stanza senza visite: la Sala 3 è di Marco
// fino alle 13 e di Tiziano dopo, e se Marco lavora solo il pomeriggio quella
// stanza è VUOTA TUTTA LA MATTINA — ma contata per giornata intera non
// risultava libera mai, e nessuno poteva proporla. Visto il 15.9.2026:
// Moschovitis lavorava 09:00-10:30 in una sala dello sport mentre la Sala 3
// era deserta.
export type FasciaLibera = { stanza: string; di: string; dalle: string; alle: string; ultima?: boolean };

// Per quanto una stanza è davvero presa (16.9.2026, detto dallo studio: «ogni
// medico deve prendere la camera per il tempo necessario delle visite; se ha
// le visite solo al pomeriggio occuperà solo il pomeriggio, non tutto il
// giorno»).
//
// La fascia della pagina dice DI CHI è la stanza; la presa dice QUANDO è
// occupata, e si ricava dalle visite: dalla prima all'ultima. Sono due fatti
// diversi e vanno tenuti separati — la regola non cambia perché un giorno uno
// ha poche visite. Se in una fascia non c'è nessuna visita, non c'è presa: la
// stanza in quelle ore è libera, anche se ha un titolare.
//
// La fine NON si taglia al confine della fascia: una visita che comincia alle
// 12:50 tiene la stanza fino alle 13:20 anche se la fascia finisce alle 13, e
// far finta di no sarebbe comodo e falso.
export type Presa = { stanza: string; chi: string; dalle: string; alle: string; perche: string; manuale?: boolean; fonte?: 'mano' | 'ai' };

const minuti = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

export function prese(righe: RigaPiano[], visite: Record<string, VisitaSala[]>): Record<string, Presa[]> {
  const fuori: Record<string, Presa[]> = {};
  for (const r of righe ?? []) {
    const dentro = visite?.[r.stanza] ?? [];
    fuori[r.stanza] = [];
    for (const s of r.segmenti ?? []) {
      const sue = dentro.filter((v) => v.inizio >= s.dalle && v.inizio < s.alle)
        .sort((a, b) => a.inizio.localeCompare(b.inizio));
      if (!sue.length) continue;
      // Una presa per gruppo di visite vicine, non una sola dalla prima
      // all'ultima: chi ha una visita alle 08:00 e una alle 18:00 teneva la
      // stanza per dieci ore, e quelle dieci ore sparivano dalle fasce libere
      // — nessuno poteva proporle. Due visite si fondono solo se fra l'una e
      // l'altra non ci sta niente (meno di MINIMA minuti).
      for (const v of sue) {
        const ultima = fuori[r.stanza][fuori[r.stanza].length - 1];
        if (ultima && ultima.chi === s.chi && ultima.perche === s.perche && minuti(v.inizio) - minuti(ultima.alle) < MINIMA) {
          if (v.fine > ultima.alle) ultima.alle = v.fine;
        } else {
          fuori[r.stanza].push({ stanza: r.stanza, chi: s.chi, dalle: v.inizio, alle: v.fine, perche: s.perche, manuale: s.manuale, fonte: s.fonte });
        }
      }
    }
  }
  return fuori;
}

// Una finestra più corta di mezz'ora non è una stanza libera: è il buco fra
// due visite. Segnalarla riempirebbe l'elenco di righe che nessuno può usare.
const MINIMA = 30;

export function fasceLibere(righe: RigaPiano[], visite: Record<string, VisitaSala[]>): FasciaLibera[] {
  const fuori: FasciaLibera[] = [];
  const min = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const tutte = prese(righe, visite);
  // Stesso ordine dell'assegnazione: chi legge trova per prime quelle da usare.
  for (const r of [...(righe ?? [])].sort((a, b) => Number(a.ultima) - Number(b.ultima))) {
    for (const s of r.segmenti ?? []) {
      const dentro = (tutte[r.stanza] ?? []).filter((x) => x.dalle >= s.dalle && x.dalle < s.alle);
      if (!dentro.length) {
        fuori.push({ stanza: r.stanza, di: s.chi, dalle: s.dalle, alle: s.alle, ultima: r.ultima });
        continue;
      }
      // Quel che resta della fascia: prima della prima presa, FRA una presa e
      // la successiva, e dopo l'ultima. Prima si guardava solo `dentro[0]` e
      // il vuoto in mezzo alla giornata non compariva da nessuna parte.
      const ordinate = [...dentro].sort((a, b) => a.dalle.localeCompare(b.dalle));
      let cursore = s.dalle;
      for (const presa of ordinate) {
        if (min(presa.dalle) - min(cursore) >= MINIMA) {
          fuori.push({ stanza: r.stanza, di: s.chi, dalle: cursore, alle: presa.dalle, ultima: r.ultima });
        }
        if (presa.alle > cursore) cursore = presa.alle;
      }
      if (min(s.alle) - min(cursore) >= MINIMA) {
        fuori.push({ stanza: r.stanza, di: s.chi, dalle: cursore, alle: s.alle, ultima: r.ultima });
      }
    }
  }
  return fuori;
}

export type VisitaDaDedurre = { id: string; paziente: string; start: string; chi: string };

export function deduciMedici(visite: VisitaDaDedurre[]): Record<string, string> {
  const min = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const conMedico = visite.filter((v) => v.chi && v.paziente);
  const fuori: Record<string, string> = {};
  for (const v of visite) {
    if (v.chi || !v.paziente) continue;
    let scelto = '', distanza = Infinity;
    for (const altro of conMedico) {
      if (altro.paziente !== v.paziente) continue;
      const d = Math.abs(min(altro.start) - min(v.start));
      if (d < distanza) { distanza = d; scelto = altro.chi; }
    }
    if (scelto) fuori[v.id] = scelto;
  }
  return fuori;
}
