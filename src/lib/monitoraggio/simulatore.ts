// Il SIMULATORE: il primo adattatore del monitoraggio (6.10.2026). PURO e
// deterministico — ogni valore è una funzione di paziente, parametro, orario
// e stato dello scenario — quindi grafici, valori ed eventi restano coerenti
// fra loro, e le prove possono far scorrere il tempo. Tutto ciò che produce è
// `provenienza: 'simulato'`. Nomi, dispositivi e medici sono inventati; i
// modelli dei dispositivi NON corrispondono a prodotti in commercio.
import type { Adattatore, Capacita, DispositivoAbbinato, Lotto, MisuraGrezza, StatoDispositivo, TracciaGrezza } from './catalogo';

export type Evento = 'tachicardia_riposo' | 'tachicardia' | 'bradicardia' | 'desaturazione' | 'febbre' | 'ipertensione' | 'ritmo_irregolare';
export const EVENTI: Record<Evento, string> = {
  tachicardia_riposo: 'Frequenza cardiaca alta a riposo', tachicardia: 'Frequenza cardiaca molto alta', bradicardia: 'Frequenza cardiaca bassa',
  desaturazione: 'Saturazione in discesa', febbre: 'Temperatura cutanea in salita', ipertensione: 'Pressione alta', ritmo_irregolare: 'Ritmo irregolare (illustrativo)',
};
export type StatoPazienteSim = {
  evento?: { tipo: Evento; dal: number } | null;
  connessione?: { interrotta_dal: number; ripresa_il?: number | null } | null;
  segnale?: { scarso_dal: number } | null;
  batteria?: { livello: number; dal: number } | null;
  sensore?: { staccato_dal: number } | null;
  ritardo_s?: number | null;
};
export type StatoSim = { avviato_il: number; pazienti: Record<string, StatoPazienteSim> };

export type DispositivoDemo = { chiave: string; tipo: string; modello: string; capacita: Capacita[] };
export type PazienteDemo = {
  codice: string; nome: string; medico: string; nota: string;
  base: { fc: number; spo2: number; fr: number; temp: number; pas: number; pad: number };
  dispositivi: DispositivoDemo[];
  programma?: 'in_pausa' | 'terminato';
  // Lo scenario di partenza, in minuti PRIMA dell'avvio del simulatore.
  iniziale?: { evento?: [Evento, number]; interrotta?: number; ripresa?: number; segnale?: number; batteria?: number };
};

const cerotto = (): DispositivoDemo => ({ chiave: 'cerotto', tipo: 'cerotto', modello: 'Cerotto toracico dimostrativo', capacita: [
  { parametro: 'ecg', modo: 'continuo', campionamento_hz: 125, intervallo_s: 5, invio_s: 5, memoria: false },
  { parametro: 'fc', modo: 'continuo', intervallo_s: 15, invio_s: 15, memoria: true },
  { parametro: 'fr', modo: 'continuo', intervallo_s: 30, invio_s: 30, memoria: true },
  { parametro: 'temp_cutanea', modo: 'continuo', intervallo_s: 60, invio_s: 60, memoria: true },
  { parametro: 'attivita', modo: 'continuo', intervallo_s: 60, invio_s: 60, memoria: true },
  { parametro: 'postura', modo: 'continuo', intervallo_s: 60, invio_s: 60, memoria: true },
  { parametro: 'ritmo', modo: 'continuo', intervallo_s: 60, invio_s: 60, memoria: true },
] });
const saturimetro = (): DispositivoDemo => ({ chiave: 'saturimetro', tipo: 'sensore', modello: 'Saturimetro da dito dimostrativo', capacita: [
  { parametro: 'spo2', modo: 'continuo', intervallo_s: 15, invio_s: 15 }, { parametro: 'fc', modo: 'continuo', intervallo_s: 15, invio_s: 15 },
] });
const bracciale = (): DispositivoDemo => ({ chiave: 'bracciale', tipo: 'braccialetto', modello: 'Braccialetto dimostrativo', capacita: [
  { parametro: 'fc', modo: 'continuo', intervallo_s: 30, invio_s: 60, memoria: true },
  { parametro: 'spo2', modo: 'intermittente', intervallo_s: 600, invio_s: 600, memoria: true },
  { parametro: 'attivita', modo: 'continuo', intervallo_s: 60, invio_s: 60, memoria: true },
] });
const periodico = (): DispositivoDemo => ({ chiave: 'periodico', tipo: 'braccialetto', modello: 'Braccialetto a misure periodiche dimostrativo', capacita: [
  { parametro: 'fc', modo: 'intermittente', intervallo_s: 300, invio_s: 300, memoria: true },
  { parametro: 'spo2', modo: 'intermittente', intervallo_s: 600, invio_s: 600, memoria: true },
] });
const sfigmo = (): DispositivoDemo => ({ chiave: 'sfigmo', tipo: 'sensore', modello: 'Sfigmomanometro connesso dimostrativo', capacita: [
  { parametro: 'pa_sistolica', modo: 'intermittente', intervallo_s: 900, invio_s: 900, metodo: 'bracciale oscillometrico, misura singola (simulata)' },
  { parametro: 'pa_diastolica', modo: 'intermittente', intervallo_s: 900, invio_s: 900, metodo: 'bracciale oscillometrico, misura singola (simulata)' },
] });

const B = (fc: number, spo2: number, fr: number, temp: number, pas: number, pad: number) => ({ fc, spo2, fr, temp, pas, pad });
const [M1, M2, M3] = ['Dr.ssa Demo Uno', 'Dr. Demo Due', 'Dr.ssa Demo Tre'];
export const PAZIENTI_DEMO: PazienteDemo[] = [
  { codice: 'DEMO-001', nome: 'Aurelia Fontanesi (demo)', medico: M1, nota: 'Parametri senza avvisi, due dispositivi.', base: B(68, 97, 14, 33.8, 124, 78), dispositivi: [cerotto(), saturimetro()] },
  { codice: 'DEMO-002', nome: 'Bruno Castelnovi (demo)', medico: M2, nota: 'Parametri senza avvisi, braccialetto.', base: B(74, 96, 15, 33.5, 131, 82), dispositivi: [bracciale()] },
  { codice: 'DEMO-003', nome: 'Carla Menegotti (demo)', medico: M1, nota: 'Avviso di attenzione: frequenza cardiaca alta a riposo.', base: B(80, 97, 16, 34.0, 128, 80), dispositivi: [cerotto()], iniziale: { evento: ['tachicardia_riposo', 25] } },
  { codice: 'DEMO-004', nome: 'Dario Valsecchi (demo)', medico: M2, nota: 'Avviso di alta priorità: saturazione molto bassa.', base: B(82, 95, 17, 33.9, 136, 84), dispositivi: [cerotto(), saturimetro()], iniziale: { evento: ['desaturazione', 20] } },
  { codice: 'DEMO-005', nome: 'Elena Ravasi (demo)', medico: M3, nota: 'Dispositivo disconnesso.', base: B(70, 97, 14, 33.6, 118, 74), dispositivi: [bracciale()], iniziale: { interrotta: 40 } },
  { codice: 'DEMO-006', nome: 'Fausto Bernardoni (demo)', medico: M1, nota: 'Segnale insufficiente.', base: B(76, 96, 15, 33.7, 126, 79), dispositivi: [cerotto()], iniziale: { segnale: 15 } },
  { codice: 'DEMO-007', nome: 'Gemma Tiraboschi (demo)', medico: M3, nota: 'Batteria bassa.', base: B(66, 98, 13, 33.4, 120, 76), dispositivi: [saturimetro(), bracciale()], iniziale: { batteria: 12 } },
  { codice: 'DEMO-008', nome: 'Ivo Marcandalli (demo)', medico: M2, nota: 'Dati intermittenti: il dispositivo misura ogni 5–10 minuti.', base: B(72, 96, 15, 33.5, 134, 83), dispositivi: [periodico(), sfigmo()] },
  { codice: 'DEMO-009', nome: 'Lidia Quadranti (demo)', medico: M1, nota: 'Tre dispositivi; pressione alta in due misure.', base: B(78, 97, 15, 33.9, 142, 88), dispositivi: [cerotto(), saturimetro(), sfigmo()], iniziale: { evento: ['ipertensione', 120] } },
  { codice: 'DEMO-010', nome: 'Marzio Colombini (demo)', medico: M3, nota: 'Temperatura cutanea alta.', base: B(79, 96, 16, 34.1, 122, 77), dispositivi: [cerotto()], iniziale: { evento: ['febbre', 55] } },
  { codice: 'DEMO-011', nome: 'Nives Pedrazzoli (demo)', medico: M2, nota: 'Monitoraggio terminato.', base: B(70, 97, 14, 33.6, 125, 79), dispositivi: [bracciale()], programma: 'terminato' },
  { codice: 'DEMO-012', nome: 'Oreste Gandolfi (demo)', medico: M3, nota: 'Ritmo irregolare illustrativo; dati recuperati dopo una disconnessione.', base: B(84, 96, 16, 33.8, 138, 85), dispositivi: [cerotto()], iniziale: { evento: ['ritmo_irregolare', 50], interrotta: 35, ripresa: 12 } },
  { codice: 'DEMO-013', nome: 'Piera Sangalli (demo)', medico: M1, nota: 'Monitoraggio in pausa.', base: B(69, 97, 14, 33.5, 119, 75), dispositivi: [bracciale()], programma: 'in_pausa' },
];

export function statoIniziale(avviato_il: number): StatoSim {
  const pazienti: Record<string, StatoPazienteSim> = {};
  for (const p of PAZIENTI_DEMO) {
    const i = p.iniziale; if (!i) continue;
    const min = (m: number) => avviato_il - m * 60_000;
    pazienti[p.codice] = {
      ...(i.evento ? { evento: { tipo: i.evento[0], dal: min(i.evento[1]) } } : {}),
      ...(i.interrotta != null ? { connessione: { interrotta_dal: min(i.interrotta), ripresa_il: i.ripresa != null ? min(i.ripresa) : null } } : {}),
      ...(i.segnale != null ? { segnale: { scarso_dal: min(i.segnale) } } : {}),
      ...(i.batteria != null ? { batteria: { livello: i.batteria, dal: avviato_il } } : {}),
    };
  }
  return { avviato_il, pazienti };
}

// ── Numeri ripetibili ───────────────────────────────────────────────────────
function h(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
// Rumore morbido in [-1, 1]: valori ripetibili a passi di `periodo_s`, raccordati.
function onda(seme: string, t: number, periodo_s: number): number {
  const x = t / 1000 / periodo_s, i = Math.floor(x), f = x - i, s = (1 - Math.cos(f * Math.PI)) / 2;
  return (h(`${seme}:${i}`) * (1 - s) + h(`${seme}:${i + 1}`) * s) * 2 - 1;
}
const rampa = (t: number, dal: number, min: number) => Math.max(0, Math.min(1, (t - dal) / (min * 60_000)));
const fra = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function attivita(p: PazienteDemo, t: number): number {
  const n = onda(`${p.codice}:att`, t, 1500);
  return Math.round(fra((n - 0.45) / 0.55, 0, 1) * 85 + (onda(`${p.codice}:att2`, t, 90) + 1) * 4);
}

// Il valore VERO del paziente simulato in quell'istante (prima del sensore).
export function valore(p: PazienteDemo, par: string, t: number, s: StatoPazienteSim | undefined): number {
  const e = s?.evento, att = attivita(p, t), k = p.codice;
  const su = (tipo: Evento, min: number) => (e && e.tipo === tipo ? rampa(t, e.dal, min) : 0);
  switch (par) {
    case 'attivita': return att;
    case 'fc': return Math.round(fra(p.base.fc + 5 * onda(`${k}:fc`, t, 600) + 2 * onda(`${k}:fc2`, t, 50) + 0.4 * att
      + 46 * su('tachicardia_riposo', 4) + 98 * su('tachicardia', 3) - 30 * su('bradicardia', 4) + 14 * su('febbre', 25) + 8 * su('desaturazione', 5) + 6 * onda(`${k}:irr`, t, 20) * su('ritmo_irregolare', 1), 30, 210));
    case 'spo2': return Math.round(fra(p.base.spo2 + 0.9 * onda(`${k}:sp`, t, 300) - (att > 60 ? 1 : 0) - 10.5 * su('desaturazione', 5), 60, 100));
    case 'fr': return Math.round(fra(p.base.fr + 1.4 * onda(`${k}:fr`, t, 240) + 0.07 * att + 5 * su('desaturazione', 5) + 4 * su('febbre', 25), 6, 45));
    case 'temp_cutanea': return Math.round(fra(p.base.temp + 0.2 * onda(`${k}:t`, t, 3600) + 4.3 * su('febbre', 25), 28, 41) * 10) / 10;
    case 'pa_sistolica': return Math.round(p.base.pas + 7 * onda(`${k}:pas`, t, 1800) + 48 * su('ipertensione', 30));
    case 'pa_diastolica': return Math.round(p.base.pad + 5 * onda(`${k}:pad`, t, 1800) + 20 * su('ipertensione', 30));
    default: return 0;
  }
}
export function postura(p: PazienteDemo, t: number): string {
  const a = attivita(p, t);
  return a > 55 ? 'in cammino' : a > 25 ? 'in piedi' : onda(`${p.codice}:pos`, t, 2400) > 0.2 ? 'supino' : 'seduto';
}

// ── ECG sintetico, una derivazione ──────────────────────────────────────────
// La fase del battito è continua fra un pezzo e l'altro: la frequenza vale a
// blocchi di 5 secondi e la fase si somma da un ancoraggio ogni dieci minuti.
const HZ = 125, PEZZO_S = 5, MV = 0.005;
function fase(p: PazienteDemo, t: number, s: StatoPazienteSim | undefined): number {
  const ancora = Math.floor(t / 600_000) * 600_000;
  let f = h(`${p.codice}:fase:${ancora}`);
  for (let b = ancora; b + PEZZO_S * 1000 <= t; b += PEZZO_S * 1000) f += (valore(p, 'fc', b, s) / 60) * PEZZO_S;
  return f;
}
const campana = (x: number, c: number, w: number, a: number) => a * Math.exp(-((x - c) * (x - c)) / (2 * w * w));
export function ecgPezzo(p: PazienteDemo, inizio: number, s: StatoPazienteSim | undefined): Int16Array {
  const n = HZ * PEZZO_S, out = new Int16Array(n);
  const fc = valore(p, 'fc', inizio, s) / 60, f0 = fase(p, inizio, s);
  const irregolare = s?.evento?.tipo === 'ritmo_irregolare' && inizio >= s.evento.dal;
  const scarso = !!s?.segnale && inizio >= s.segnale.scarso_dal;
  for (let i = 0; i < n; i++) {
    const tt = inizio + (i * 1000) / HZ, f = f0 + (fc * i) / HZ, battito = Math.floor(f);
    let x = f - battito;
    if (irregolare) x = Math.pow(x, 1 + (h(`${p.codice}:rr:${battito}`) - 0.5) * 0.9);
    let mv = (irregolare ? 0 : campana(x, 0.18, 0.028, 0.12)) + campana(x, 0.352, 0.009, -0.09) + campana(x, 0.37, 0.011, 1.05) + campana(x, 0.39, 0.010, -0.24) + campana(x, 0.63, 0.05, 0.3);
    mv += 0.04 * Math.sin(tt / 1700) + (h(`${p.codice}:n:${Math.floor(tt / 8)}`) - 0.5) * (scarso ? 0.5 : 0.03);
    if (irregolare) mv += 0.035 * Math.sin(tt / 23);
    if (scarso && h(`${p.codice}:art:${Math.floor(tt / 700)}`) > 0.6) mv += 0.6 * Math.sin(tt / 90);
    out[i] = Math.round(fra(mv, -3, 3) / MV);
  }
  return out;
}

// ── L'adattatore ────────────────────────────────────────────────────────────
// `leggi(da, a]` restituisce ciò che ARRIVA in quell'intervallo: le misure
// appena prese, quelle in ritardo, e — alla riconnessione — quelle tenute in
// memoria dal dispositivo durante la disconnessione, coi loro orari veri.
const RECUPERO_MAX_MS = 45 * 60_000;
export function creaSimulatore(leggiStato: () => StatoSim): Adattatore {
  return {
    id: 'simulatore', nome: 'Simulatore (dati sintetici)', ambiente: 'demo',
    async leggi({ dispositivi, da, a }) { return genera(dispositivi, da.getTime(), a.getTime(), leggiStato()); },
  };
}

const serialeDi = (codice: string, chiave: string) => `SIM-${codice}-${chiave}`;
export { serialeDi };

export function genera(dispositivi: DispositivoAbbinato[], da: number, a: number, stato: StatoSim): Lotto {
  const misure: MisuraGrezza[] = [], tracce: TracciaGrezza[] = [], stati: StatoDispositivo[] = [];
  for (const d of dispositivi) {
    const p = PAZIENTI_DEMO.find((x) => x.codice === d.paziente_codice);
    if (!p) continue;
    const s = stato.pazienti[p.codice];
    const c = s?.connessione;
    const scollegato = (t: number) => !!c && t >= c.interrotta_dal && (c.ripresa_il == null || t < c.ripresa_il);
    const scarso = (t: number) => !!s?.segnale && t >= s.segnale.scarso_dal;
    const staccato = (t: number) => !!s?.sensore && t >= s.sensore.staccato_dal;
    const ritardo = Math.max(0, (s?.ritardo_s ?? 0) * 1000);
    const una = (cap: Capacita, t: number, arrivata: number) => {
      if (staccato(t)) return;
      // Segnale scarso: una misura su tre non esce proprio, le altre hanno qualità bassa.
      if (scarso(t) && h(`${d.seriale}:${cap.parametro}:buco:${t}`) < 0.35) return;
      const q = scarso(t) ? Math.round(22 + 22 * h(`${d.seriale}:q:${t}`)) : Math.round(fra(93 + 5 * onda(`${d.seriale}:q`, t, 300) - attivita(p, t) * 0.2, 40, 100));
      const comune = { dispositivo: d.id, parametro: cap.parametro, acquisita_il: new Date(t), arrivata_il: new Date(arrivata), provenienza: 'simulato' as const };
      if (cap.parametro === 'postura') misure.push({ ...comune, valore_testo: postura(p, t), unita: '', qualita: q, fonte: 'accelerometro (simulato)' });
      else if (cap.parametro === 'ritmo') misure.push({ ...comune, valore_testo: s?.evento?.tipo === 'ritmo_irregolare' && t >= s.evento.dal ? 'irregolare' : 'regolare', unita: '', qualita: q, fonte: 'classificatore del simulatore v1 — non è un algoritmo diagnostico' });
      else {
        const rumore = scarso(t) ? (h(`${d.seriale}:${cap.parametro}:e:${t}`) - 0.5) * (cap.parametro === 'spo2' ? 5 : 14) : (h(`${d.seriale}:${cap.parametro}:e:${t}`) - 0.5) * (cap.parametro === 'fc' ? 2 : 0);
        const v = valore(p, cap.parametro, t, s) + (cap.parametro === 'temp_cutanea' ? 0 : Math.round(rumore));
        misure.push({ ...comune, valore: cap.parametro === 'spo2' ? Math.min(100, v) : v, unita: '', qualita: cap.modo === 'intermittente' && cap.parametro.startsWith('pa_') ? null : q, fonte: cap.metodo ?? null });
      }
    };
    for (const cap of d.capacita) {
      const passo = cap.intervallo_s * 1000;
      if (cap.parametro === 'ecg') {
        // Solo pezzi interi, e solo gli ultimi due minuti: il tracciato non si recupera a posteriori.
        // (un pezzo è pronto quando è finito: quelli che finiscono in (da, a])
        for (let t = Math.floor((Math.max(da, a - 120_000) - passo) / passo) * passo + passo; t + passo <= a; t += passo) {
          if (scollegato(t) || staccato(t)) continue;
          tracce.push({ dispositivo: d.id, derivazione: 'I (simulata)', hz: HZ, mv_per_unita: MV, inizio: new Date(t), campioni: ecgPezzo(p, t, s), qualita: scarso(t) ? 28 : 95, provenienza: 'simulato' });
        }
        continue;
      }
      // Ciò che viene misurato e arriva in (da, a], tenendo conto del ritardo.
      for (let t = Math.floor((da - ritardo) / passo) * passo + passo; t <= a - ritardo; t += passo) if (!scollegato(t)) una(cap, t, t + ritardo + 800);
      // Riconnessione dentro l'intervallo: il dispositivo scarica ciò che aveva in memoria.
      if (c?.ripresa_il != null && c.ripresa_il > da && c.ripresa_il <= a && cap.memoria) {
        for (let t = Math.ceil(Math.max(c.interrotta_dal, c.ripresa_il - RECUPERO_MAX_MS) / passo) * passo; t < c.ripresa_il; t += passo) una(cap, t, c.ripresa_il + 1500);
      }
    }
    const giu = scollegato(a);
    const ore = Math.max(0, (a - stato.avviato_il) / 3_600_000);
    const partenza = s?.batteria ? s.batteria.livello : 62 + Math.round(h(`${d.seriale}:bat`) * 34);
    const batteria = Math.max(1, Math.round(partenza - (s?.batteria ? (a - s.batteria.dal) / 3_600_000 : ore) * 1.5));
    stati.push({ dispositivo: d.id, connesso: !giu, ultimo_contatto: new Date(giu ? c!.interrotta_dal : a), batteria, sensore_applicato: d.tipo === 'cerotto' ? !staccato(a) : null, errore: null });
  }
  return { misure, tracce, stati, errori: [] };
}
