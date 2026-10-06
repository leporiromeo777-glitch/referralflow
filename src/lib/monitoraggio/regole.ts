// Il motore delle regole del monitoraggio (6.10.2026). PURO e deterministico:
// stesse misure, stessa ora → stesso esito. L'assistente AI non passa di qui
// e non può cambiare soglie, severità o regole.
//
// Una regola dice: parametro, verso e soglia; per quanto tempo; con quante
// misure valide; con che qualità e freschezza del segnale; se l'attività la
// sospende; quando il parametro si considera RIENTRATO (isteresi); ogni
// quanto si ripete la notifica. Ogni avviso conserva chiave e versione della
// regola che l'ha generato e una spiegazione leggibile.
import { parametro } from './catalogo';

export type Problema = 'disconnesso' | 'assenza_dati' | 'ritardo' | 'batteria' | 'segnale' | 'sensore' | 'integrazione';

export type Regola = {
  chiave: string;
  nome: string;
  categoria: 'parametro' | 'tecnico';
  // 1 = attenzione (anomalia da verificare), 2 = alta priorità (da sottoporre
  // rapidamente a chi è responsabile). Solo per gli avvisi sui parametri.
  livello?: 1 | 2;
  parametro?: string;
  verso?: 'sopra' | 'sotto';
  soglia?: number;
  rientro?: number;            // isteresi: dove il parametro si considera rientrato
  durata_s?: number;           // per quanto deve durare l'anomalia (0 = misure di fila)
  minimo_misure?: number;      // quante misure valide servono
  qualita_minima?: number;     // sotto, la misura non conta
  freschezza_s?: number;       // l'ultima misura valida non può essere più vecchia
  sospendi_con_attivita?: number; // indice di attività medio oltre il quale non si valuta
  problema?: Problema;
  attesa_s?: number;           // tecnici: da quanto dura il problema
  limite?: number;             // tecnici: batteria %, qualità media, ritardo in secondi
  ripeti_notifica_s: number;   // intervallo minimo fra due notifiche dello stesso avviso
  silenzio_dopo_chiusura_s: number; // dopo la chiusura, per quanto la stessa regola non riapre
  illustrativa?: boolean;
};

export type MisuraVista = { parametro: string; valore: number | null; quando: number; ricevuta: number; qualita: number | null };

export type Esito =
  | { stato: 'vera'; spiegazione: string; valori: Record<string, number | string>; da: number; a: number; misurato: number; ricevuto: number }
  | { stato: 'falsa' }
  | { stato: 'non_valutabile'; motivo: string };

const num = (v: number, codice: string) => v.toFixed(parametro(codice).decimali).replace('.', ',');
const durata = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10} h` : s >= 60 ? `${Math.round(s / 6) / 10} min`.replace('.', ',') : `${s} s`);

// Le soglie del singolo paziente (profilo) vincono su quelle della regola; una
// regola può essere spenta per quel paziente. Niente altro si può cambiare da lì.
export function conProfilo(r: Regola, profilo: any): Regola | null {
  const p = profilo?.regole?.[r.chiave];
  if (!p) return r;
  if (p.spenta === true) return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return { ...r, soglia: n(p.soglia) ?? r.soglia, rientro: n(p.rientro) ?? r.rientro };
}

const oltre = (r: Regola, v: number, limite: number) => (r.verso === 'sopra' ? v > limite : v < limite);

// La regola di un PARAMETRO, sulle misure recenti del paziente.
export function valutaParametro(r: Regola, tutte: MisuraVista[], ora: number): Esito {
  if (r.categoria !== 'parametro' || !r.parametro || r.soglia == null || !r.verso) return { stato: 'non_valutabile', motivo: 'regola incompleta' };
  const qmin = r.qualita_minima ?? 0, dur = (r.durata_s ?? 0) * 1000, minimo = Math.max(1, r.minimo_misure ?? 1);
  const mie = tutte.filter((m) => m.parametro === r.parametro && m.valore != null && m.quando <= ora).sort((a, b) => a.quando - b.quando);
  const valide = mie.filter((m) => m.qualita == null || m.qualita >= qmin);
  const ultima = valide[valide.length - 1];
  if (!ultima) return { stato: 'non_valutabile', motivo: mie.length ? 'segnale di qualità insufficiente' : 'nessuna misura' };
  if (r.freschezza_s != null && ora - ultima.quando > r.freschezza_s * 1000) return { stato: 'non_valutabile', motivo: 'dati non aggiornati' };
  // Il contesto: durante l'attività una frequenza alta non è l'anomalia che la regola cerca.
  if (r.sospendi_con_attivita != null) {
    const att = tutte.filter((m) => m.parametro === 'attivita' && m.valore != null && m.quando > ora - Math.max(dur, 60_000) && m.quando <= ora);
    if (att.length && att.reduce((s, m) => s + (m.valore as number), 0) / att.length > r.sospendi_con_attivita) return { stato: 'non_valutabile', motivo: 'attività in corso' };
  }
  let finestra: MisuraVista[];
  if (dur > 0) {
    finestra = valide.filter((m) => m.quando > ora - dur);
    // L'anomalia deve DURARE: servono misure che coprano l'intervallo, non solo le ultime.
    const prima = valide.filter((m) => m.quando <= ora - dur).pop();
    const copre = (prima && oltre(r, prima.valore as number, r.soglia)) || (finestra[0] && finestra[0].quando <= ora - dur * 0.8);
    if (finestra.length < minimo || !copre) {
      return finestra.length && finestra.every((m) => oltre(r, m.valore as number, r.soglia!)) ? { stato: 'non_valutabile', motivo: 'anomalia presente da troppo poco' } : { stato: 'falsa' };
    }
  } else {
    finestra = valide.slice(-minimo);
    if (finestra.length < minimo) return { stato: 'non_valutabile', motivo: 'misure valide insufficienti' };
  }
  if (!finestra.every((m) => oltre(r, m.valore as number, r.soglia!))) return { stato: 'falsa' };
  const v = finestra.map((m) => m.valore as number);
  const p = parametro(r.parametro);
  const min = Math.min(...v), max = Math.max(...v), media = v.reduce((s, x) => s + x, 0) / v.length;
  const spiegazione = `${p.nome} ${r.verso} ${num(r.soglia, r.parametro)} ${p.unita}${dur ? ` per almeno ${durata(r.durata_s!)}` : ` in ${minimo} misure di fila`}: ${finestra.length} misure valide`
    + ` (da ${num(min, r.parametro)} a ${num(max, r.parametro)} ${p.unita}${qmin ? `, qualità del segnale almeno ${qmin}` : ''}).`;
  return { stato: 'vera', spiegazione, valori: { misure: finestra.length, minimo: min, massimo: max, media: Math.round(media * 10) / 10, soglia: r.soglia, unita: p.unita },
    da: finestra[0].quando, a: ultima.quando, misurato: ultima.quando, ricevuto: ultima.ricevuta };
}

// Il parametro è RIENTRATO? Le ultime misure valide stanno tutte dal lato
// buono della soglia di rientro (più severa di quella d'ingresso: è l'isteresi,
// che evita avvisi che si aprono e chiudono di continuo attorno alla soglia).
export function rientrato(r: Regola, tutte: MisuraVista[], ora: number): boolean {
  if (r.categoria !== 'parametro' || !r.parametro || r.soglia == null) return false;
  const limite = r.rientro ?? r.soglia;
  const n = Math.max(3, r.minimo_misure ?? 1);
  const valide = tutte.filter((m) => m.parametro === r.parametro && m.valore != null && m.quando <= ora && (m.qualita == null || m.qualita >= (r.qualita_minima ?? 0))).sort((a, b) => a.quando - b.quando).slice(-n);
  if (valide.length < n) return false;
  if (r.freschezza_s != null && ora - valide[valide.length - 1].quando > r.freschezza_s * 1000) return false;
  return valide.every((m) => !oltre(r, m.valore as number, limite) && m.valore !== limite);
}

// ── Problemi tecnici ────────────────────────────────────────────────────────
export type StatoTecnico = {
  programma: 'attivo' | 'in_pausa' | 'terminato';
  dispositivi: { nome: string; connesso: boolean; ultimo_contatto: number | null; batteria: number | null; sensore_applicato: boolean | null; errore: string | null; continuo: boolean }[];
  ultima_misura: number | null;      // l'ultima acquisita, di qualunque parametro continuo
  ritardo_mediano_s: number | null;  // fra acquisizione e ricezione, sulle ultime misure non recuperate
  qualita_media: number | null;      // sulle ultime misure che dichiarano una qualità
};

export function valutaTecnica(r: Regola, s: StatoTecnico, ora: number): Esito {
  if (r.categoria !== 'tecnico' || !r.problema) return { stato: 'non_valutabile', motivo: 'regola incompleta' };
  if (s.programma !== 'attivo') return { stato: 'falsa' };   // monitoraggio fermo: non è un guasto
  const attesa = (r.attesa_s ?? 0) * 1000;
  const vera = (spiegazione: string, valori: Record<string, number | string>, da: number): Esito => ({ stato: 'vera', spiegazione, valori, da, a: ora, misurato: da, ricevuto: ora });
  switch (r.problema) {
    case 'disconnesso': {
      const giu = s.dispositivi.filter((d) => !d.connesso && (d.ultimo_contatto == null || ora - d.ultimo_contatto >= attesa));
      if (!giu.length) return { stato: 'falsa' };
      const da = Math.min(...giu.map((d) => d.ultimo_contatto ?? ora - attesa));
      return vera(`${giu.map((d) => d.nome).join(', ')}: nessun contatto da ${durata(Math.round((ora - da) / 1000))}.`, { dispositivi: giu.length, da_secondi: Math.round((ora - da) / 1000) }, da);
    }
    case 'assenza_dati': {
      const collegati = s.dispositivi.filter((d) => d.connesso && d.continuo);
      if (!collegati.length) return { stato: 'falsa' };   // se è scollegato lo dice l'altra regola
      if (s.ultima_misura != null && ora - s.ultima_misura < attesa) return { stato: 'falsa' };
      const da = s.ultima_misura ?? ora - attesa;
      return vera(`Il dispositivo risulta collegato ma non arrivano misure da ${durata(Math.round((ora - da) / 1000))}.`, { da_secondi: Math.round((ora - da) / 1000) }, da);
    }
    case 'ritardo':
      if (s.ritardo_mediano_s == null || r.limite == null || s.ritardo_mediano_s <= r.limite) return { stato: 'falsa' };
      return vera(`Le misure arrivano con ${durata(Math.round(s.ritardo_mediano_s))} di ritardo (oltre ${durata(r.limite)}): quello che si vede non è l'adesso.`, { ritardo_secondi: Math.round(s.ritardo_mediano_s) }, ora);
    case 'batteria': {
      const basse = s.dispositivi.filter((d) => d.batteria != null && r.limite != null && d.batteria < r.limite);
      if (!basse.length) return { stato: 'falsa' };
      return vera(`Batteria bassa: ${basse.map((d) => `${d.nome} ${d.batteria}%`).join(', ')}.`, { batteria: Math.min(...basse.map((d) => d.batteria as number)) }, ora);
    }
    case 'segnale':
      if (s.qualita_media == null || r.limite == null || s.qualita_media >= r.limite) return { stato: 'falsa' };
      return vera(`Qualità media del segnale ${Math.round(s.qualita_media)} su 100 (sotto ${r.limite}): le misure non sono affidabili e le regole sui parametri non si valutano.`, { qualita: Math.round(s.qualita_media) }, ora);
    case 'sensore': {
      const staccati = s.dispositivi.filter((d) => d.sensore_applicato === false);
      if (!staccati.length) return { stato: 'falsa' };
      return vera(`Sensore non applicato correttamente: ${staccati.map((d) => d.nome).join(', ')} (lo segnala il dispositivo).`, { dispositivi: staccati.length }, ora);
    }
    case 'integrazione': {
      const guasti = s.dispositivi.filter((d) => d.errore);
      if (!guasti.length) return { stato: 'falsa' };
      return vera(`Errore del servizio di integrazione per ${guasti.map((d) => d.nome).join(', ')}.`, { dispositivi: guasti.length }, ora);
    }
  }
}

// ── Che cosa fare dell'esito ────────────────────────────────────────────────
// Deduplicazione: un solo avviso non chiuso per paziente e regola. Il rientro
// del parametro NON chiude l'avviso: lo segna, e la traccia resta finché una
// persona non lo chiude. Se l'anomalia ritorna prima della chiusura è un
// episodio in più dello stesso avviso, non un avviso nuovo.
export type AvvisoAperto = { stato: 'aperto' | 'in_carico'; rientrato_il: number | null; ultima_notifica: number | null };
export type Decisione = 'apri' | 'ricaduta' | 'rientro' | 'ripeti_notifica' | 'niente';

export function decidi(r: Regola, esito: Esito, aperto: AvvisoAperto | null, eRientrato: boolean, chiusoIl: number | null, ora: number): Decisione {
  if (!aperto) {
    if (esito.stato !== 'vera') return 'niente';
    // Appena chiuso da una persona: la stessa regola non riapre subito.
    if (chiusoIl != null && ora - chiusoIl < r.silenzio_dopo_chiusura_s * 1000) return 'niente';
    return 'apri';
  }
  if (esito.stato === 'vera') {
    if (aperto.rientrato_il != null) return 'ricaduta';
    // Nessuno l'ha preso in carico e l'anomalia continua: la notifica si ripete, ma non più spesso dell'intervallo.
    if (aperto.stato === 'aperto' && (aperto.ultima_notifica == null || ora - aperto.ultima_notifica >= r.ripeti_notifica_s * 1000)) return 'ripeti_notifica';
    return 'niente';
  }
  if (aperto.rientrato_il == null && (r.categoria === 'tecnico' ? esito.stato === 'falsa' : eRientrato)) return 'rientro';
  return 'niente';
}

// ── Le regole ILLUSTRATIVE della demo ───────────────────────────────────────
// Servono a far vedere come funziona il motore. NON sono soglie cliniche
// validate: per i dati reali le regole le scrive e le approva il personale
// clinico autorizzato, paziente per paziente.
const P = { minimo_misure: 4, qualita_minima: 50, freschezza_s: 120, ripeti_notifica_s: 600, silenzio_dopo_chiusura_s: 300, illustrativa: true } as const;
export const REGOLE_DEMO: Regola[] = [
  { ...P, chiave: 'fc_alta', nome: 'FC alta a riposo', categoria: 'parametro', livello: 1, parametro: 'fc', verso: 'sopra', soglia: 120, rientro: 110, durata_s: 120, sospendi_con_attivita: 55 },
  { ...P, chiave: 'fc_molto_alta', nome: 'FC molto alta', categoria: 'parametro', livello: 2, parametro: 'fc', verso: 'sopra', soglia: 150, rientro: 135, durata_s: 60, ripeti_notifica_s: 300 },
  { ...P, chiave: 'fc_bassa', nome: 'FC bassa', categoria: 'parametro', livello: 1, parametro: 'fc', verso: 'sotto', soglia: 45, rientro: 50, durata_s: 120 },
  { ...P, chiave: 'spo2_bassa', nome: 'SpO₂ bassa', categoria: 'parametro', livello: 1, parametro: 'spo2', verso: 'sotto', soglia: 92, rientro: 94, durata_s: 120 },
  { ...P, chiave: 'spo2_molto_bassa', nome: 'SpO₂ molto bassa', categoria: 'parametro', livello: 2, parametro: 'spo2', verso: 'sotto', soglia: 88, rientro: 91, durata_s: 60, ripeti_notifica_s: 300 },
  { ...P, chiave: 'fr_alta', nome: 'FR alta', categoria: 'parametro', livello: 1, parametro: 'fr', verso: 'sopra', soglia: 26, rientro: 23, durata_s: 180, minimo_misure: 3 },
  { ...P, chiave: 'temp_cutanea_alta', nome: 'Temperatura cutanea alta', categoria: 'parametro', livello: 1, parametro: 'temp_cutanea', verso: 'sopra', soglia: 37.8, rientro: 37.4, durata_s: 600, minimo_misure: 5, freschezza_s: 300 },
  { ...P, chiave: 'pa_sistolica_alta', nome: 'PA sistolica alta in due misure', categoria: 'parametro', livello: 1, parametro: 'pa_sistolica', verso: 'sopra', soglia: 180, rientro: 165, durata_s: 0, minimo_misure: 2, qualita_minima: 0, freschezza_s: 4 * 3600 },
  { chiave: 'tec_disconnesso', nome: 'Dispositivo disconnesso', categoria: 'tecnico', problema: 'disconnesso', attesa_s: 120, ripeti_notifica_s: 1800, silenzio_dopo_chiusura_s: 600, illustrativa: true },
  { chiave: 'tec_assenza_dati', nome: 'Assenza di dati', categoria: 'tecnico', problema: 'assenza_dati', attesa_s: 180, ripeti_notifica_s: 1800, silenzio_dopo_chiusura_s: 600, illustrativa: true },
  { chiave: 'tec_ritardo', nome: 'Dati in ritardo', categoria: 'tecnico', problema: 'ritardo', limite: 180, ripeti_notifica_s: 1800, silenzio_dopo_chiusura_s: 600, illustrativa: true },
  { chiave: 'tec_batteria', nome: 'Batteria bassa', categoria: 'tecnico', problema: 'batteria', limite: 15, ripeti_notifica_s: 3600, silenzio_dopo_chiusura_s: 1800, illustrativa: true },
  { chiave: 'tec_segnale', nome: 'Segnale insufficiente', categoria: 'tecnico', problema: 'segnale', limite: 45, ripeti_notifica_s: 1800, silenzio_dopo_chiusura_s: 600, illustrativa: true },
  { chiave: 'tec_sensore', nome: 'Sensore non applicato correttamente', categoria: 'tecnico', problema: 'sensore', ripeti_notifica_s: 1800, silenzio_dopo_chiusura_s: 600, illustrativa: true },
  { chiave: 'tec_integrazione', nome: 'Errore del servizio di integrazione', categoria: 'tecnico', problema: 'integrazione', ripeti_notifica_s: 1800, silenzio_dopo_chiusura_s: 600, illustrativa: true },
];

// Una regola scritta da una persona: si controlla che abbia senso prima di salvarla.
export function controllaRegola(r: any): string | null {
  if (!r || typeof r !== 'object') return 'Regola vuota.';
  if (r.categoria === 'tecnico') return typeof r.problema === 'string' ? null : 'Manca il problema tecnico.';
  if (typeof r.soglia !== 'number' || !Number.isFinite(r.soglia)) return 'La soglia deve essere un numero.';
  if (r.verso !== 'sopra' && r.verso !== 'sotto') return 'Il verso è «sopra» o «sotto».';
  if (r.rientro != null) {
    if (typeof r.rientro !== 'number' || !Number.isFinite(r.rientro)) return 'La soglia di rientro deve essere un numero.';
    if (r.verso === 'sopra' ? r.rientro > r.soglia : r.rientro < r.soglia) return 'La soglia di rientro deve stare dal lato buono della soglia (isteresi).';
  }
  const p = parametro(String(r.parametro ?? ''));
  if ((p.min != null && r.soglia < p.min) || (p.max != null && r.soglia > p.max)) return `Soglia fuori dalla scala del parametro (${p.min}–${p.max} ${p.unita}).`;
  if (r.livello !== 1 && r.livello !== 2) return 'Il livello è 1 (attenzione) o 2 (alta priorità).';
  for (const k of ['durata_s', 'minimo_misure', 'ripeti_notifica_s']) if (r[k] != null && (typeof r[k] !== 'number' || r[k] < 0 || r[k] > 86400)) return `Valore non valido per ${k}.`;
  return null;
}

// ── Lo stato del paziente, per la panoramica ────────────────────────────────
// Tre cose diverse che non devono sembrare la stessa: «nessun avviso
// rilevato» (ci sono dati freschi e nessuna regola è scattata), «dati
// insufficienti» (non si sa), «monitoraggio interrotto» (non si sta guardando).
export type StatoPaziente = 'avviso_alta' | 'avviso_attenzione' | 'nessun_avviso' | 'dati_insufficienti' | 'interrotto';
export function statoPaziente(o: { programma: string; avvisi: { categoria: string; livello: number | null; rientrato: boolean }[]; eta_ultimo_dato_s: number | null; qualita_media: number | null; continuo: boolean; intervallo_s: number }): StatoPaziente {
  if (o.programma !== 'attivo') return 'interrotto';
  const vivi = o.avvisi.filter((a) => a.categoria === 'parametro');
  if (vivi.some((a) => a.livello === 2)) return 'avviso_alta';
  if (vivi.some((a) => a.livello === 1)) return 'avviso_attenzione';
  const vecchio = o.eta_ultimo_dato_s == null || o.eta_ultimo_dato_s > Math.max(180, o.intervallo_s * 3);
  if (vecchio || (o.qualita_media != null && o.qualita_media < 45)) return 'dati_insufficienti';
  return 'nessun_avviso';
}

export type Connessione = 'in_aggiornamento' | 'in_ritardo' | 'interrotta' | 'terminato';
export function statoConnessione(o: { programma: string; connessi: number; dispositivi: number; eta_ultimo_dato_s: number | null; intervallo_s: number }): Connessione {
  if (o.programma !== 'attivo') return 'terminato';
  if (!o.dispositivi || !o.connessi) return 'interrotta';
  if (o.eta_ultimo_dato_s == null || o.eta_ultimo_dato_s > Math.max(120, o.intervallo_s * 2.5)) return 'in_ritardo';
  return 'in_aggiornamento';
}
