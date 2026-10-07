// Pressione (7.10.2026, [[Piattaforma/Pressione]]) — i conti. PURO: niente DB,
// niente orologio, niente rete. Tutto ciò che la pagina mostra come numero
// nasce qui, ed è ripetibile: stesso profilo, stessi numeri, sempre.
//
// Gli orari sono quelli DELL'OROLOGIO DEL PAZIENTE («2026-03-01T07:30», senza
// fuso): un profilo pressorio è una storia di ore del giorno, e convertirlo fra
// fusi serve solo a sbagliare la notte.
import { oreDi, type Farmaco } from './farmaci';

export type Misura = { quando: string; sis: number; dia: number; fc: number | null; valida: boolean };
export type Soglie = { giorno_sis: number; giorno_dia: number; notte_sis: number; notte_dia: number; basso_giorno: number; basso_notte: number };
export type Impostazioni = { sveglia: string; sonno: string; soglie: Soglie };

// Soglie di partenza: quelle correnti delle linee guida europee per il
// monitoraggio delle 24 ore (giorno 135/85, notte 120/70). Il medico le cambia
// per paziente; «basso» è il valore sotto cui una fascia si segnala come troppo bassa.
export const SOGLIE_BASE: Soglie = { giorno_sis: 135, giorno_dia: 85, notte_sis: 120, notte_dia: 70, basso_giorno: 100, basso_notte: 90 };
export const IMPOSTAZIONI_BASE: Impostazioni = { sveglia: '07:00', sonno: '22:00', soglie: SOGLIE_BASE };

// ── Leggere il file dell'apparecchio ────────────────────────────────────────
// Ogni programma di monitoraggio esporta a modo suo. Qui si accetta un testo a
// righe (CSV, punto e virgola, tabulazioni) con data, ora, sistolica,
// diastolica e, se c'è, frequenza. Con la riga d'intestazione le colonne si
// riconoscono dal nome; senza, devono essere in quest'ordine. Non si indovina:
// se una riga non si capisce si scarta e si conta.
const RE_DATA = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/;
const RE_ORA = /\b(\d{1,2})[:.h](\d{2})(?::\d{2})?\b/;
const due = (n: number) => String(n).padStart(2, '0');

function colonna(nome: string): 'data' | 'ora' | 'sis' | 'dia' | 'fc' | 'altro' {
  const n = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/^(data|date|datum|giorno|tag)/.test(n)) return 'data';
  if (/^(ora|orario|time|zeit|uhrzeit|heure)/.test(n)) return 'ora';
  if (/sis|sys|pas\b|sbp/.test(n)) return 'sis';
  if (/dia|pad\b|dbp/.test(n)) return 'dia';
  if (/^(fc|hr|bpm)\b|freq|puls|pulse|heart|herz/.test(n)) return 'fc';
  return 'altro';
}

export type Letto = { misure: Misura[]; scartate: number; errore?: string };

export function leggiFile(testo: string, dataInizio?: string): Letto {
  const righe = String(testo ?? '').replace(/\r/g, '').split('\n').map((r) => r.trim()).filter(Boolean).slice(0, 2000);
  if (!righe.length) return { misure: [], scartate: 0, errore: 'Il file è vuoto.' };
  const taglia = (r: string) => r.split(r.includes('\t') ? '\t' : r.includes(';') ? ';' : ',').map((c) => c.trim().replace(/^"|"$/g, ''));
  // L'intestazione: la prima riga che nomina sia la sistolica sia la diastolica.
  let mappa: ReturnType<typeof colonna>[] | null = null, inizio = 0;
  for (let i = 0; i < Math.min(righe.length, 15); i++) {
    const tipi = taglia(righe[i]).map(colonna);
    if (tipi.includes('sis') && tipi.includes('dia')) { mappa = tipi; inizio = i + 1; break; }
  }
  const misure: Misura[] = []; let scartate = 0;
  let giorno = /^\d{4}-\d{2}-\d{2}$/.test(dataInizio ?? '') ? new Date(`${dataInizio}T00:00:00Z`) : null;
  let oraPrima = -1;
  for (const riga of righe.slice(inizio)) {
    const celle = taglia(riga);
    let data: string | null = null, ora: string | null = null, sis = NaN, dia = NaN, fc: number | null = null;
    const leggiData = (s: string) => { const m = RE_DATA.exec(s); if (!m) return null; return m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3].length === 2 ? '20' + m[3] : m[3]}-${due(+m[2])}-${due(+m[1])}`; };
    const leggiOra = (s: string) => { const m = RE_ORA.exec(s); if (!m || +m[1] > 23 || +m[2] > 59) return null; return `${due(+m[1])}:${m[2]}`; };
    if (mappa) {
      mappa.forEach((tipo, i) => {
        const c = celle[i] ?? '';
        if (tipo === 'data') { data = leggiData(c) ?? data; ora = ora ?? leggiOra(c.replace(RE_DATA, '')); }
        else if (tipo === 'ora') ora = leggiOra(c) ?? ora;
        else if (tipo === 'sis') sis = parseInt(c, 10);
        else if (tipo === 'dia') dia = parseInt(c, 10);
        else if (tipo === 'fc') { const n = parseInt(c, 10); fc = Number.isFinite(n) ? n : null; }
      });
    } else {
      data = leggiData(riga);
      const senzaData = riga.replace(RE_DATA, ' ');
      ora = leggiOra(senzaData);
      const numeri = (senzaData.replace(RE_ORA, ' ').match(/\b\d{2,3}\b/g) ?? []).map(Number);
      // Senza intestazione le colonne non si possono indovinare oltre le tre attese.
      if (numeri.length > 3) return { misure: [], scartate: 0, errore: 'Non riconosco le colonne: serve la riga d’intestazione (data, ora, sistolica, diastolica, frequenza).' };
      [sis, dia] = numeri; fc = numeri[2] ?? null;
    }
    if (!ora || !Number.isFinite(sis) || !Number.isFinite(dia)) { scartate++; continue; }
    // Senza data nel file i giorni si contano dall'ora che torna indietro.
    if (!data) {
      if (!giorno) return { misure: [], scartate: 0, errore: 'Nel file non c’è la data: indica il giorno d’inizio della registrazione.' };
      const h = oreDi(ora);
      if (oraPrima >= 0 && h < oraPrima - 0.001) giorno = new Date(giorno.getTime() + 86_400_000);
      oraPrima = h;
      data = giorno.toISOString().slice(0, 10);
    }
    if (Number.isNaN(Date.parse(`${data}T${ora}:00Z`))) { scartate++; continue; }
    const valida = sis >= 60 && sis <= 280 && dia >= 30 && dia <= 180 && sis >= dia + 10 && (fc === null || (fc >= 25 && fc <= 250));
    misure.push({ quando: `${data}T${ora}`, sis, dia, fc: fc !== null && fc >= 25 && fc <= 250 ? fc : null, valida });
  }
  if (!misure.length) return { misure: [], scartate, errore: 'Nel file non ho trovato misure di pressione.' };
  // In ordine di tempo e senza due misure allo stesso minuto.
  misure.sort((a, b) => a.quando.localeCompare(b.quando));
  const uniche = misure.filter((m, i) => i === 0 || m.quando !== misure[i - 1].quando);
  return { misure: uniche, scartate: scartate + (misure.length - uniche.length) };
}

// ── Giorno e notte ──────────────────────────────────────────────────────────
const oraDi = (quando: string): number => oreDi(quando.slice(11, 16));
export function diNotte(ora: number, imp: Pick<Impostazioni, 'sveglia' | 'sonno'>): boolean {
  const sv = oreDi(imp.sveglia), so = oreDi(imp.sonno);
  return so > sv ? (ora >= so || ora < sv) : (ora >= so && ora < sv);
}
const media = (v: number[]): number | null => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const ds = (v: number[]): number | null => { const m = media(v); if (m === null || v.length < 2) return null; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const r1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10);

export type Ora = { ora: number; n: number; sis: number | null; dia: number | null; fc: number | null; notte: boolean };
export type Riassunto = { n: number; sis: number | null; dia: number | null; fc: number | null; ds_sis: number | null; ds_dia: number | null };
export type Statistiche = {
  misure: number; valide: number; percento_valide: number;
  tutte: Riassunto; giorno: Riassunto; notte: Riassunto;
  calo_notturno: number | null;                      // % sulla sistolica
  calo_tipo: 'assente' | 'ridotto' | 'normale' | 'eccessivo' | 'inverso' | null;
  picco_mattino: number | null;                      // mmHg di sistolica
  carico_giorno: number | null; carico_notte: number | null;   // % di misure sopra soglia
  qualita: { affidabile: boolean; motivi: string[] };
  orarie: Ora[];
};

function riassunto(m: Misura[]): Riassunto {
  const fc = m.map((x) => x.fc).filter((x): x is number => x !== null);
  return { n: m.length, sis: r1(media(m.map((x) => x.sis))), dia: r1(media(m.map((x) => x.dia))), fc: r1(media(fc)), ds_sis: r1(ds(m.map((x) => x.sis))), ds_dia: r1(ds(m.map((x) => x.dia))) };
}

// Le 24 ore dell'orologio: la media di ciò che è stato misurato in ciascuna.
export function orarie(misure: Misura[], imp: Pick<Impostazioni, 'sveglia' | 'sonno'>): Ora[] {
  const buone = misure.filter((m) => m.valida);
  return Array.from({ length: 24 }, (_, h) => {
    const qui = buone.filter((m) => Math.floor(oraDi(m.quando)) === h);
    const fc = qui.map((x) => x.fc).filter((x): x is number => x !== null);
    return { ora: h, n: qui.length, sis: r1(media(qui.map((x) => x.sis))), dia: r1(media(qui.map((x) => x.dia))), fc: r1(media(fc)), notte: diNotte(h + 0.5, imp) };
  });
}

export function caloTipo(calo: number | null): Statistiche['calo_tipo'] {
  if (calo === null) return null;
  return calo < 0 ? 'inverso' : calo < 10 ? (calo < 1 ? 'assente' : 'ridotto') : calo <= 20 ? 'normale' : 'eccessivo';
}

// Il picco del mattino sulla sistolica: la media delle due ore dopo la sveglia
// meno la media delle tre ore attorno al punto più basso della notte.
export function piccoMattino(ore: Ora[], imp: Pick<Impostazioni, 'sveglia' | 'sonno'>): number | null {
  const sv = Math.floor(oreDi(imp.sveglia));
  const dopo = [ore[sv % 24], ore[(sv + 1) % 24]].map((o) => o.sis).filter((x): x is number => x !== null);
  const notte = ore.filter((o) => o.notte && o.sis !== null);
  if (!dopo.length || notte.length < 2) return null;
  const minimo = notte.reduce((a, b) => (b.sis! < a.sis! ? b : a));
  const attorno = [-1, 0, 1].map((d) => ore[(minimo.ora + d + 24) % 24]).filter((o) => o.notte && o.sis !== null).map((o) => o.sis!);
  return r1(media(dopo)! - media(attorno)!);
}

export function statistiche(misure: Misura[], imp: Impostazioni): Statistiche {
  const buone = misure.filter((m) => m.valida);
  const g = buone.filter((m) => !diNotte(oraDi(m.quando), imp)), n = buone.filter((m) => diNotte(oraDi(m.quando), imp));
  const giorno = riassunto(g), notte = riassunto(n);
  const calo = giorno.sis && notte.sis ? r1(((giorno.sis - notte.sis) / giorno.sis) * 100) : null;
  const ore = orarie(misure, imp);
  const s = imp.soglie;
  const percento = misure.length ? Math.round((buone.length / misure.length) * 100) : 0;
  // I criteri correnti per dire che una registrazione regge una conclusione:
  // almeno il 70% di misure valide, 20 di giorno, 7 di notte.
  const motivi: string[] = [];
  if (percento < 70) motivi.push(`solo il ${percento}% delle misure è valido (ne servono almeno il 70%)`);
  if (g.length < 20) motivi.push(`${g.length} misure valide di giorno (ne servono almeno 20)`);
  if (n.length < 7) motivi.push(`${n.length} misure valide di notte (ne servono almeno 7)`);
  return {
    misure: misure.length, valide: buone.length, percento_valide: percento,
    tutte: riassunto(buone), giorno, notte,
    calo_notturno: calo, calo_tipo: caloTipo(calo),
    picco_mattino: piccoMattino(ore, imp),
    carico_giorno: g.length ? Math.round((g.filter((m) => m.sis >= s.giorno_sis || m.dia >= s.giorno_dia).length / g.length) * 100) : null,
    carico_notte: n.length ? Math.round((n.filter((m) => m.sis >= s.notte_sis || m.dia >= s.notte_dia).length / n.length) * 100) : null,
    qualita: { affidabile: motivi.length === 0, motivi },
    orarie: ore,
  };
}

// ── Le fasce: dove la pressione è sopra soglia, o troppo bassa ───────────────
export type StatoOra = 'alta' | 'bassa' | 'ok' | 'vuota';
export function statoOra(o: Ora, s: Soglie): StatoOra {
  if (o.sis === null || o.dia === null) return 'vuota';
  if (o.sis >= (o.notte ? s.notte_sis : s.giorno_sis) || o.dia >= (o.notte ? s.notte_dia : s.giorno_dia)) return 'alta';
  if (o.sis < (o.notte ? s.basso_notte : s.basso_giorno)) return 'bassa';
  return 'ok';
}
export type Fascia = { da: number; a: number; ore: number; stato: 'alta' | 'bassa'; sis: number; dia: number; notte: boolean; scoperta?: boolean; al_minimo?: string[] };

// Ore contigue nello stesso stato diventano una fascia («02:00–06:00»). Le 24
// ore sono un cerchio: una fascia può passare la mezzanotte.
export function fasce(ore: Ora[], s: Soglie): Fascia[] {
  const stati = ore.map((o) => statoOra(o, s));
  const fuori: Fascia[] = [];
  const visto = new Array(24).fill(false);
  // Si parte da un'ora in cui lo stato cambia, così nessuna fascia viene spezzata dalla mezzanotte.
  let partenza = 0;
  for (let h = 0; h < 24; h++) if (stati[h] !== stati[(h + 23) % 24]) { partenza = h; break; }
  for (let k = 0; k < 24; k++) {
    const h = (partenza + k) % 24;
    if (visto[h] || (stati[h] !== 'alta' && stati[h] !== 'bassa')) continue;
    const dentro: Ora[] = [];
    let j = h;
    while (!visto[j] && stati[j] === stati[h] && dentro.length < 24) { visto[j] = true; dentro.push(ore[j]); j = (j + 1) % 24; }
    fuori.push({ da: h, a: j, ore: dentro.length, stato: stati[h] as 'alta' | 'bassa', sis: Math.round(media(dentro.map((o) => o.sis!))!), dia: Math.round(media(dentro.map((o) => o.dia!))!), notte: dentro.filter((o) => o.notte).length * 2 >= dentro.length });
  }
  return fuori.sort((a, b) => a.da - b.da);
}

// ── La finestra d'azione di un farmaco ──────────────────────────────────────
// Quanto «sta lavorando» un farmaco a `dt` ore dalla presa, da 0 a 1: niente
// prima dell'inizio, sale fino al picco, scende fino a un residuo alla fine
// della durata dichiarata, poi si spegne nell'arco di un'emivita. È un DISEGNO
// dei quattro numeri della tabella, non una misura sul paziente.
const RESIDUO = 0.35;
export function effetto(dt: number, f: Pick<Farmaco, 'inizio_h' | 'picco_h' | 'durata_h' | 'emivita_h'>): number {
  if (dt < f.inizio_h) return 0;
  if (dt <= f.picco_h) return f.picco_h === f.inizio_h ? 1 : (dt - f.inizio_h) / (f.picco_h - f.inizio_h);
  if (dt <= f.durata_h) return f.durata_h === f.picco_h ? 1 : 1 - (1 - RESIDUO) * ((dt - f.picco_h) / (f.durata_h - f.picco_h));
  const coda = dt - f.durata_h;
  return coda >= f.emivita_h ? 0 : RESIDUO * (1 - coda / f.emivita_h);
}

export type Presa = { id: string; nome: string; principio: string; orari: string[] };
export type Copertura = { id: string; nome: string; principio: string; orari: string[]; livelli: number[] };

// Il livello di un farmaco preso tutti i giorni agli stessi orari, ora per ora
// (a metà di ogni ora): conta la presa di oggi e quelle dei tre giorni prima.
export function livelli(orari: string[], f: Pick<Farmaco, 'inizio_h' | 'picco_h' | 'durata_h' | 'emivita_h'>): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    let m = 0;
    for (const o of orari) for (let g = 0; g <= 3; g++) m = Math.max(m, effetto(h + 0.5 - oreDi(o) + 24 * g, f));
    return Math.round(m * 100) / 100;
  });
}
export function copertura(prese: Presa[], tabella: Map<string, Farmaco>): Copertura[] {
  return prese.flatMap((p) => {
    const f = tabella.get(p.principio);
    if (!f || !f.orario_rilevante || !p.orari.length) return [];
    return [{ ...p, livelli: livelli(p.orari, f) }];
  });
}

// Una fascia alta è «scoperta» quando, per più della metà delle sue ore, nessun
// farmaco con una finestra è almeno a metà del suo effetto.
export const META = 0.5;
export function segnaScoperte(f: Fascia[], cop: Copertura[]): Fascia[] {
  return f.map((x) => {
    if (x.stato !== 'alta' || !cop.length) return x;
    const oreFascia = Array.from({ length: x.ore }, (_, k) => (x.da + k) % 24);
    const scoperte = oreFascia.filter((h) => cop.every((c) => c.livelli[h] < META)).length;
    const alMinimo = cop.filter((c) => oreFascia.filter((h) => c.livelli[h] < META).length * 2 > x.ore).map((c) => c.principio);
    return { ...x, scoperta: scoperte * 2 > x.ore, al_minimo: alMinimo };
  });
}

// ── Il punteggio: quanto il profilo è «in ordine» ───────────────────────────
// Quattro parti, calcolate sulle 24 ore dell'orologio: le ore dentro i valori
// bersaglio pesano più di tutto il resto insieme (55), poi il calo notturno, il
// picco del mattino e l'assenza di ore troppo basse (15 ciascuno). «Regolare»
// NON vuol dire piatto: di notte la pressione deve scendere.
export const PESI = { in_bersaglio: 55, calo: 15, mattino: 15, basse: 15 };
export type Punteggio = { totale: number; in_bersaglio: number; calo: number; mattino: number; basse: number; ore_misurate: number; ore_in_bersaglio: number; calo_notturno: number | null; picco_mattino: number | null; ore_basse: number };

export function punteggio(ore: Ora[], imp: Impostazioni): Punteggio | null {
  const misurate = ore.filter((o) => o.sis !== null && o.dia !== null);
  if (misurate.length < 12) return null;
  const stati = misurate.map((o) => statoOra(o, imp.soglie));
  const bene = stati.filter((s) => s === 'ok').length, basse = stati.filter((s) => s === 'bassa').length;
  const g = media(misurate.filter((o) => !o.notte).map((o) => o.sis!)), n = media(misurate.filter((o) => o.notte).map((o) => o.sis!));
  const calo = g && n ? ((g - n) / g) * 100 : null;
  const picco = piccoMattino(ore, imp);
  const tra = (x: number, a: number, b: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  // Calo: pieno fra 10 e 20%; a zero a 0% e a 30%.
  const pCalo = calo === null ? 0 : calo < 10 ? tra(calo, 0, 10) : calo <= 20 ? 1 : 1 - tra(calo, 20, 30);
  // Picco del mattino: pieno fino a 35 mmHg, a zero a 55.
  const pMattino = picco === null ? 0.5 : 1 - tra(picco, 35, 55);
  // Ore troppo basse: ognuna toglie un quarto dei punti.
  const pBasse = Math.max(0, 1 - basse / 4);
  const parti = { in_bersaglio: PESI.in_bersaglio * (bene / misurate.length), calo: PESI.calo * pCalo, mattino: PESI.mattino * pMattino, basse: PESI.basse * pBasse };
  const arr = (x: number) => Math.round(x * 10) / 10;
  return {
    totale: Math.round(parti.in_bersaglio + parti.calo + parti.mattino + parti.basse),
    in_bersaglio: arr(parti.in_bersaglio), calo: arr(parti.calo), mattino: arr(parti.mattino), basse: arr(parti.basse),
    ore_misurate: misurate.length, ore_in_bersaglio: bene, calo_notturno: r1(calo), picco_mattino: picco, ore_basse: basse,
  };
}

// ── Le proposte di orario (SPENTE finché non validate) ──────────────────────
// Dispositivo medico fabbricato e usato dentro lo studio: fascicolo in
// docs/legale/dispositivo-in-house-pressione/. Il codice propone SOLO l'orario
// di farmaci che il medico ha già prescritto: non propone farmaci, dosi,
// aggiunte o sospensioni. Se nessuno spostamento basta, lo dice e si ferma.
//
// Come stima: sposta UNA presa di UN farmaco su uno degli orari candidati e
// prevede il profilo togliendo l'effetto del vecchio orario e mettendo quello
// del nuovo. Quanto vale l'effetto pieno di un farmaco in mmHg è un'IPOTESI
// DI LAVORO, uguale per tutti e dichiarata: la conferma è il monitoraggio dopo.
export const VERSIONE_REGOLE = 'pa-orari-1';
export const EFFETTO_PIENO = { sis: 10, dia: 6 };
export const ORARI_CANDIDATI = ['06:00', '07:00', '08:00', '12:00', '18:00', '20:00', '22:00'];
const GUADAGNO_MINIMO = 5;      // punti: sotto, non vale la pena proporre
const DIURETICO_ENTRO = 14;     // un diuretico non si propone dopo le 14

export type Proposta = {
  presa_id: string; nome: string; principio: string; da: string; a: string;
  punteggio_ora: number; punteggio_previsto: number;
  perche: string[];                          // i numeri da cui nasce, in parole
  previsto: { ora: number; sis: number | null; dia: number | null }[];
};
export type EsitoProposte = {
  versione: string; ipotesi: string;
  proposte: Proposta[];
  avviso: string | null;                     // quando nessuno spostamento basta
  motivo_nessuna: string | null;
};

const hhmm = (h: number) => `${due(h % 24)}:00`;
export const fasciaTesto = (f: Pick<Fascia, 'da' | 'a'>) => `${hhmm(f.da)}–${hhmm(f.a)}`;

export function proponi(
  ore: Ora[], prese: Presa[], tabella: Map<string, Farmaco>, imp: Impostazioni, qualita: { affidabile: boolean },
): EsitoProposte {
  const ipotesi = `Stima: l'effetto pieno di ogni farmaco vale ${EFFETTO_PIENO.sis}/${EFFETTO_PIENO.dia} mmHg, uguale per tutti. È un'ipotesi di lavoro: la conferma è un nuovo monitoraggio.`;
  const vuoto = (motivo: string): EsitoProposte => ({ versione: VERSIONE_REGOLE, ipotesi, proposte: [], avviso: null, motivo_nessuna: motivo });
  if (!qualita.affidabile) return vuoto('La registrazione non è abbastanza affidabile per proporre uno spostamento.');
  const ora0 = punteggio(ore, imp);
  if (!ora0) return vuoto('Troppe ore senza misure per valutare il profilo.');
  const alte0 = fasce(ore, imp.soglie).filter((f) => f.stato === 'alta');
  if (!alte0.length) return vuoto('Nessuna fascia sopra soglia: non c’è niente da spostare.');
  const spostabili = prese.filter((p) => { const f = tabella.get(p.principio); return f && f.orario_rilevante && p.orari.length === 1; });
  if (!spostabili.length) {
    return { versione: VERSIONE_REGOLE, ipotesi, proposte: [], motivo_nessuna: 'Nessun farmaco con una sola presa al giorno e una finestra d’azione confermata.',
      avviso: avvisoFasce(alte0) };
  }
  const candidati: Proposta[] = [];
  let migliorPrevisto = ore, migliorPunti = ora0.totale;
  for (const p of spostabili) {
    const f = tabella.get(p.principio)!;
    const prima = livelli(p.orari, f);
    for (const nuovo of ORARI_CANDIDATI) {
      if (nuovo === p.orari[0]) continue;
      if (f.classe === 'diuretico' && oreDi(nuovo) > DIURETICO_ENTRO) continue;
      const dopo = livelli([nuovo], f);
      const previsto: Ora[] = ore.map((o, h) => o.sis === null || o.dia === null ? o : {
        ...o, sis: Math.round((o.sis - EFFETTO_PIENO.sis * (dopo[h] - prima[h])) * 10) / 10, dia: Math.round((o.dia - EFFETTO_PIENO.dia * (dopo[h] - prima[h])) * 10) / 10 });
      const pt = punteggio(previsto, imp);
      if (!pt) continue;
      // Mai una proposta che, nella stima, porta un'ora sotto il valore basso o il calo notturno oltre il 20%.
      if (pt.ore_basse > ora0.ore_basse) continue;
      if (pt.calo_notturno !== null && pt.calo_notturno > 20 && (ora0.calo_notturno ?? 0) <= 20) continue;
      if (pt.totale > migliorPunti) { migliorPunti = pt.totale; migliorPrevisto = previsto; }
      if (pt.totale - ora0.totale < GUADAGNO_MINIMO) continue;
      const scoperte = alte0.filter((x) => Array.from({ length: x.ore }, (_, k) => (x.da + k) % 24).filter((h) => prima[h] < META).length * 2 > x.ore);
      candidati.push({
        presa_id: p.id, nome: p.nome, principio: p.principio, da: p.orari[0], a: nuovo,
        punteggio_ora: ora0.totale, punteggio_previsto: pt.totale,
        perche: [
          ...alte0.map((x) => `Sopra soglia ${fasciaTesto(x)}: media ${x.sis}/${x.dia} mmHg.`),
          scoperte.length ? `Preso alle ${p.orari[0]}, ${p.principio} è sotto metà del suo effetto in ${scoperte.map(fasciaTesto).join(', ')}.` : `Preso alle ${p.orari[0]}, ${p.principio} ha il massimo effetto lontano dalle fasce sopra soglia.`,
          `Stima con la presa alle ${nuovo}: ore in bersaglio ${ora0.ore_in_bersaglio} → ${pt.ore_in_bersaglio} su ${pt.ore_misurate}; calo notturno ${ora0.calo_notturno ?? '—'}% → ${pt.calo_notturno ?? '—'}%.`,
        ],
        previsto: previsto.map((o) => ({ ora: o.ora, sis: o.sis, dia: o.dia })),
      });
    }
  }
  // Una proposta per farmaco: la migliore. Poi dalla migliore in giù, al massimo tre.
  const perFarmaco = new Map<string, Proposta>();
  for (const c of candidati) { const g = perFarmaco.get(c.presa_id); if (!g || c.punteggio_previsto > g.punteggio_previsto) perFarmaco.set(c.presa_id, c); }
  const proposte = [...perFarmaco.values()].sort((a, b) => b.punteggio_previsto - a.punteggio_previsto || a.nome.localeCompare(b.nome)).slice(0, 3);
  // Anche col migliore spostamento restano fasce sopra soglia? Lo si dice, e ci si ferma lì.
  const restano = fasce(migliorPrevisto, imp.soglie).filter((f) => f.stato === 'alta');
  return {
    versione: VERSIONE_REGOLE, ipotesi, proposte,
    avviso: restano.length ? avvisoFasce(restano) : null,
    motivo_nessuna: proposte.length ? null : 'Nessuno spostamento migliora il profilo in modo apprezzabile.',
  };
}

// L'avviso descrive ciò che i dati mostrano, e non conclude niente sulla terapia.
export function avvisoFasce(alte: Fascia[]): string {
  return `Con qualunque orario dei farmaci attuali la pressione resta sopra la soglia in ${alte.length === 1 ? 'questa fascia' : 'queste fasce'}: ${alte.map((x) => `${fasciaTesto(x)}, media ${x.sis}/${x.dia}`).join('; ')}. Valutazione del medico.`;
}

// ── Prima e dopo ────────────────────────────────────────────────────────────
export type Confronto = { punteggio: number | null; sis_24: number | null; dia_24: number | null; calo: number | null; ore_in_bersaglio: number | null };
export function confronta(prima: { stat: Statistiche; punti: Punteggio | null }, dopo: { stat: Statistiche; punti: Punteggio | null }): Confronto {
  const d = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : Math.round((b - a) * 10) / 10);
  return {
    punteggio: d(prima.punti?.totale, dopo.punti?.totale), sis_24: d(prima.stat.tutte.sis, dopo.stat.tutte.sis), dia_24: d(prima.stat.tutte.dia, dopo.stat.tutte.dia),
    calo: d(prima.stat.calo_notturno, dopo.stat.calo_notturno), ore_in_bersaglio: d(prima.punti?.ore_in_bersaglio, dopo.punti?.ore_in_bersaglio),
  };
}
