// Monitoraggio remoto (6.10.2026): i tipi comuni e il catalogo dei parametri.
// PURO. È il vocabolario che adattatori, archivio, regole e interfaccia
// condividono: un dispositivo nuovo non aggiunge colonne, dichiara che cosa
// misura con questi nomi (o con un nome nuovo: il catalogo è estensibile).

export type Ambiente = 'demo' | 'reale';
export type Provenienza = 'misurato' | 'elaborato' | 'simulato';

export type Parametro = {
  codice: string; nome: string; breve: string; unita: string; decimali: number;
  tipo: 'numerico' | 'categoria' | 'traccia';
  // Limiti di PLAUSIBILITÀ tecnica (un valore fuori è un errore del sensore,
  // non un'anomalia clinica): non sono soglie cliniche.
  min?: number; max?: number;
  nota?: string;
};

export const PARAMETRI: Record<string, Parametro> = {
  fc: { codice: 'fc', nome: 'Frequenza cardiaca', breve: 'FC', unita: 'bpm', decimali: 0, tipo: 'numerico', min: 20, max: 300 },
  spo2: { codice: 'spo2', nome: 'Saturazione di ossigeno (SpO₂)', breve: 'SpO₂', unita: '%', decimali: 0, tipo: 'numerico', min: 50, max: 100 },
  fr: { codice: 'fr', nome: 'Frequenza respiratoria', breve: 'FR', unita: 'atti/min', decimali: 0, tipo: 'numerico', min: 3, max: 80 },
  temp_cutanea: { codice: 'temp_cutanea', nome: 'Temperatura cutanea', breve: 'T cutanea', unita: '°C', decimali: 1, tipo: 'numerico', min: 25, max: 43, nota: 'Misurata sulla pelle: non è la temperatura corporea centrale.' },
  temp_corporea: { codice: 'temp_corporea', nome: 'Temperatura corporea', breve: 'T corporea', unita: '°C', decimali: 1, tipo: 'numerico', min: 30, max: 43 },
  attivita: { codice: 'attivita', nome: 'Attività', breve: 'Attività', unita: 'indice 0–100', decimali: 0, tipo: 'numerico', min: 0, max: 100 },
  postura: { codice: 'postura', nome: 'Postura', breve: 'Postura', unita: '', decimali: 0, tipo: 'categoria' },
  pa_sistolica: { codice: 'pa_sistolica', nome: 'Pressione arteriosa sistolica', breve: 'PA sist.', unita: 'mmHg', decimali: 0, tipo: 'numerico', min: 50, max: 280, nota: 'Il metodo (bracciale oscillometrico, stima senza bracciale…) sta nella fonte della misura.' },
  pa_diastolica: { codice: 'pa_diastolica', nome: 'Pressione arteriosa diastolica', breve: 'PA diast.', unita: 'mmHg', decimali: 0, tipo: 'numerico', min: 30, max: 180 },
  ritmo: { codice: 'ritmo', nome: 'Classificazione del ritmo', breve: 'Ritmo', unita: '', decimali: 0, tipo: 'categoria', nota: 'Solo se la fornisce un algoritmo dedicato, con la sua fonte e versione.' },
  ecg: { codice: 'ecg', nome: 'ECG', breve: 'ECG', unita: 'mV', decimali: 2, tipo: 'traccia' },
};

// Un parametro che il catalogo non conosce resta utilizzabile: si mostra col
// suo codice e con l'unità dichiarata dal dispositivo.
export function parametro(codice: string, unita = ''): Parametro {
  return PARAMETRI[codice] ?? { codice, nome: codice, breve: codice, unita, decimali: 1, tipo: 'numerico' };
}

// ── Il contratto degli adattatori ───────────────────────────────────────────
// Che cosa un dispositivo sa misurare, e come: continuo o a intervalli, con
// che campionamento e ogni quanto invia. L'interfaccia mostra «intermittente»
// e non disegna una linea continua dove il dispositivo misura ogni dieci minuti.
export type Capacita = {
  parametro: string;
  modo: 'continuo' | 'intermittente';
  campionamento_hz?: number;   // per i segnali (ECG)
  intervallo_s: number;        // ogni quanto c'è un valore
  invio_s: number;             // ogni quanto il dispositivo trasmette
  memoria?: boolean;           // tiene i dati se resta scollegato e li manda dopo
  metodo?: string;             // es. «bracciale oscillometrico»
};

export type MisuraGrezza = {
  dispositivo: string;         // id del dispositivo in piattaforma
  parametro: string;
  valore?: number | null;
  valore_testo?: string | null;
  unita: string;
  acquisita_il: Date;
  arrivata_il?: Date | null;   // quando l'ha ricevuta il canale del produttore, se lo dice
  qualita?: number | null;     // 0–100, se il dispositivo la dichiara
  provenienza: Provenienza;
  fonte?: string | null;       // algoritmo e versione, metodo di misura
  contesto?: Record<string, unknown> | null;
};

export type TracciaGrezza = {
  dispositivo: string; derivazione: string; hz: number; mv_per_unita: number;
  inizio: Date; campioni: Int16Array; qualita?: number | null; provenienza: Provenienza;
};

export type StatoDispositivo = {
  dispositivo: string; connesso: boolean; ultimo_contatto: Date | null;
  batteria?: number | null; sensore_applicato?: boolean | null; errore?: string | null;
};

export type DispositivoAbbinato = { id: string; seriale: string; modello: string; tipo: string; capacita: Capacita[]; paziente_id: string; paziente_codice: string };

export type Lotto = { misure: MisuraGrezza[]; tracce: TracciaGrezza[]; stati: StatoDispositivo[]; errori: string[] };

// Un adattatore parla col canale del produttore (gateway, telefono, la sua
// piattaforma) e restituisce un lotto NORMALE: niente di ciò che sta sopra
// (archivio, regole, interfaccia) sa chi ha prodotto i dati.
export interface Adattatore {
  id: string;
  nome: string;
  ambiente: Ambiente;
  // Tutto ciò che è stato acquisito o è ARRIVATO nell'intervallo (da, a]:
  // anche dati vecchi consegnati adesso (dopo una disconnessione).
  leggi(richiesta: { dispositivi: DispositivoAbbinato[]; da: Date; a: Date }): Promise<Lotto>;
}

// ── Normalizzazione e validazione ───────────────────────────────────────────
export type MisuraNormale = Required<Pick<MisuraGrezza, 'dispositivo' | 'parametro' | 'unita' | 'provenienza'>> & {
  valore: number | null; valore_testo: string | null; acquisita_il: Date; ricevuta_il: Date;
  qualita: number | null; fonte: string | null; contesto: Record<string, unknown> | null; recuperata: boolean;
};
export type Scarto = { motivo: 'parametro_non_dichiarato' | 'valore_assente' | 'fuori_scala' | 'orario_futuro' | 'orario_assente' | 'demo_non_simulata' };

// Una misura grezza diventa una misura d'archivio, o viene scartata col suo
// motivo. Non si corregge e non si inventa niente: un valore non plausibile
// non entra, e manca. `recuperata`: è arrivata molto dopo essere stata presa
// (dati tenuti in memoria durante una disconnessione) — è storia, non l'adesso.
export function normalizza(m: MisuraGrezza, capacita: Capacita[], ambiente: Ambiente, adesso: Date): MisuraNormale | Scarto {
  const cap = capacita.find((c) => c.parametro === m.parametro);
  // L'orario d'arrivo: quello dichiarato dal canale se c'è e non è nel futuro, se no adesso.
  const ricevuta = m.arrivata_il instanceof Date && !Number.isNaN(m.arrivata_il.getTime()) && m.arrivata_il.getTime() <= adesso.getTime() ? m.arrivata_il : adesso;
  if (!cap) return { motivo: 'parametro_non_dichiarato' };
  if (!(m.acquisita_il instanceof Date) || Number.isNaN(m.acquisita_il.getTime())) return { motivo: 'orario_assente' };
  if (m.acquisita_il.getTime() > ricevuta.getTime() + 60_000) return { motivo: 'orario_futuro' };
  if (ambiente === 'demo' && m.provenienza !== 'simulato') return { motivo: 'demo_non_simulata' };
  const p = parametro(m.parametro, m.unita);
  let valore: number | null = null, testo: string | null = null;
  if (p.tipo === 'categoria') {
    testo = String(m.valore_testo ?? '').trim().slice(0, 60);
    if (!testo) return { motivo: 'valore_assente' };
  } else {
    if (typeof m.valore !== 'number' || !Number.isFinite(m.valore)) return { motivo: 'valore_assente' };
    if ((p.min != null && m.valore < p.min) || (p.max != null && m.valore > p.max)) return { motivo: 'fuori_scala' };
    valore = m.valore;
  }
  const ritardo = (ricevuta.getTime() - m.acquisita_il.getTime()) / 1000;
  return {
    dispositivo: m.dispositivo, parametro: m.parametro, unita: m.unita || p.unita, provenienza: m.provenienza,
    valore, valore_testo: testo, acquisita_il: m.acquisita_il, ricevuta_il: ricevuta,
    qualita: typeof m.qualita === 'number' && Number.isFinite(m.qualita) ? Math.max(0, Math.min(100, Math.round(m.qualita))) : null,
    fonte: m.fonte ? String(m.fonte).slice(0, 120) : cap.metodo ?? null, contesto: m.contesto ?? null,
    recuperata: ritardo > Math.max(120, cap.invio_s * 3),
  };
}

// ── Permessi del modulo ─────────────────────────────────────────────────────
// Quattro capacità distinte, applicate dal server. Il tecnico tiene in piedi
// i dispositivi ma non vede i valori dei pazienti (vista tecnica).
export const PUO_MON = {
  consultare: ['medico', 'assistente', 'segretaria', 'admin'],
  prendere_in_carico: ['medico', 'assistente'],
  modificare_regole: ['medico', 'admin'],
  gestire_dispositivi: ['admin', 'tecnico'],
  usare_simulatore: ['medico', 'assistente', 'admin', 'tecnico'],
} as const;
export type CapacitaMon = keyof typeof PUO_MON;
export const puoMon = (ruolo: string | null | undefined, cosa: CapacitaMon): boolean => !!ruolo && (PUO_MON[cosa] as readonly string[]).includes(ruolo);
export const vistaTecnica = (ruolo: string | null | undefined): boolean => !puoMon(ruolo, 'consultare') && puoMon(ruolo, 'gestire_dispositivi');
