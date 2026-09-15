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
  nota: string;
  stato: string;         // 'proposta' | 'validato'
};

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

export function leggiSale(markdown: string): Sala[] {
  const fuori: Sala[] = [];
  let corrente: Sala | null = null;
  for (const grezza of (markdown ?? '').split('\n')) {
    const riga = grezza.trim();
    const titolo = /^##\s+(.+)$/.exec(riga);
    if (titolo) {
      corrente = { nome: titolo[1].trim(), di: '', fasce: [], chi: [], giorni: [], funzione: '', nota: '', stato: 'proposta' };
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
  const n = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(dr|dr\.ssa|prof|med|ssa)\b\.?/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).sort().join(' ');
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

export type Segmento = { dalle: string; alle: string; chi: string; perche: string; manuale?: boolean };
export type RigaPiano = { stanza: string; segmenti: Segmento[]; funzione: string; nota: string; stato: string };
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
    righe.push({ stanza: s.nome, segmenti, funzione: s.funzione, nota: s.nota, stato: s.stato });
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

export type ModificaSala = { stanza: string; dalle: string; chi: string; da?: string };

export function applicaModifiche(righe: RigaPiano[], modifiche: ModificaSala[]): RigaPiano[] {
  if (!modifiche?.length) return righe;
  const chiave = (stanza: string, dalle: string) => `${stanza.toLowerCase()}|${dalle}`;
  // L'ultima correzione su una fascia è quella che vale.
  const per = new Map<string, ModificaSala>();
  for (const m of modifiche) per.set(chiave(m.stanza ?? '', m.dalle ?? ''), m);
  return righe.map((r) => ({
    ...r,
    segmenti: r.segmenti.map((s) => {
      const m = per.get(chiave(r.stanza, s.dalle));
      if (!m) return s;
      const da = m.da ? ` da ${m.da}` : '';
      return { ...s, chi: m.chi ?? '', manuale: true, perche: m.chi ? `assegnata a mano${da}` : `liberata a mano${da}` };
    }),
  }));
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

export function assegnaVisite(righe: RigaPiano[], visite: VisitaGrezza[]): Record<string, VisitaSala[]> {
  const min = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const fuori: Record<string, VisitaSala[]> = {};
  const liberaDa: Record<string, number> = {};
  for (const r of righe) { fuori[r.stanza] = []; liberaDa[r.stanza] = -1; }
  const ordinate = [...visite].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  for (const v of ordinate) {
    if (!v.chi) continue;
    const i = min(v.start), f = i + Math.max(5, v.dur || 30);
    const sue = righe.filter((r) => (r.segmenti ?? []).some((s) => s.chi && uguali(s.chi, v.chi) && v.start >= s.dalle && v.start < s.alle));
    if (!sue.length) continue;   // nessuna stanza in quel momento: non si mostra
    let scelta = sue.find((r) => liberaDa[r.stanza] <= i);
    const sovra = !scelta;
    if (!scelta) scelta = sue.reduce((a, b) => (fuori[a.stanza].length <= fuori[b.stanza].length ? a : b));
    fuori[scelta.stanza].push({ id: v.id, inizio: v.start, fine: hm(f), etichetta: v.etichetta ?? '', sovra, corsia: 0, corsie: 1 });
    liberaDa[scelta.stanza] = Math.max(liberaDa[scelta.stanza], f);
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
  libere: { stanza: string; di: string }[],
  senzaSala: { chi: string; n: number }[]
): string {
  const pezzi = [daDeciderePerPrompt(piano, presenti)];
  pezzi.push(`\nSALE SENZA NESSUNA VISITA OGGI:\n${libere.length
    ? libere.map((l) => `- ${l.stanza}${l.di ? ` (intestata a ${l.di})` : ''}`).join('\n')
    : '- nessuna: tutte le stanze hanno almeno una visita'}`);
  pezzi.push(`\nCHI LAVORA OGGI SENZA UNA SALA:\n${senzaSala.length
    ? senzaSala.map((s) => `- ${s.chi}: ${s.n} ${s.n === 1 ? 'visita' : 'visite'}`).join('\n')
    : '- nessuno: tutti hanno una stanza'}`);
  return pezzi.join('\n');
}
