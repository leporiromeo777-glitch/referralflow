// Prestazioni da fatturare (14.9.2026): la piattaforma non emette fatture;
// prepara le righe delle prestazioni erogate nel periodo e le esporta in CSV
// per il gestionale di fatturazione dello studio (`;` come separatore, BOM
// UTF-8: Excel in italiano/tedesco lo apre giusto). Funzioni pure e testate;
// le query stanno nell'endpoint. Nel file mai testo clinico: solo chi, quando,
// con chi, quale prestazione.
export type RigaFattura = {
  id: string; data: string; ora: string; durata: number;
  cognome: string; nome: string; nascita: string; assicurazione: string; avs: string; n_assicurato: string; in_cartella: boolean;
  medico: string; gln_medico: string; rcc_medico: string; prestazione: string; codice_tariffa: string; luogo: string;
  fatta: boolean; referto: boolean; inviante: string;
  esportato_il: string;
  // Stato letto nell'agenda di MediOnline (vuoto quando l'agenda non lo dice).
  stato: string; stato_visto: string;
};

// Come si chiamano, in italiano, gli stati che l'agenda di MediOnline disegna
// con l'icona in alto a destra del riquadro.
export const ETICHETTE_STATO: Record<string, string> = {
  bloccato: 'Bloccato',
  fissato: 'Fissato',
  arrivato: 'Arrivato',
  in_corso: 'In corso',
  da_fatturare: 'Da fatturare',
  trattato: 'Trattato',
  fatturato: 'Fatturato',
  scusato: 'Scusato',
  annullato: 'Annullato',
};

// Stati che non diventano una fattura: non vanno contati fra i dimenticati.
const NON_FATTURABILI = new Set(['scusato', 'annullato', 'bloccato']);

export const COLONNE = ['Data', 'Ora', 'Durata (min)', 'Cognome', 'Nome', 'Data di nascita', 'Assicurazione', 'AVS', 'N. assicurato', 'Medico', 'GLN medico', 'RCC medico', 'Prestazione', 'Posizione tariffaria', 'Luogo', 'Visita segnata fatta', 'Referto confermato', 'Medico inviante', 'Stato in agenda', 'ID appuntamento', 'Esportato il'] as const;

function cella(v: string | number | boolean): string {
  const s = typeof v === 'boolean' ? (v ? 'sì' : 'no') : String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvPrestazioni(righe: RigaFattura[]): string {
  const testa = COLONNE.join(';');
  const corpo = righe.map((r) => [r.data, r.ora, r.durata, r.cognome, r.nome, r.nascita, r.assicurazione, r.avs, r.n_assicurato, r.medico, r.gln_medico, r.rcc_medico, r.prestazione, r.codice_tariffa, r.luogo, r.fatta, r.referto, r.inviante, ETICHETTE_STATO[r.stato] ?? '', r.id, r.esportato_il].map(cella).join(';'));
  return '﻿' + [testa, ...corpo].join('\r\n') + '\r\n';
}

export function nomeFileCsv(dal: string, al: string): string {
  return `prestazioni_${dal}_${al}.csv`;
}

// «AAAA-MM» → primo giorno del mese e primo giorno del mese dopo (ISO), o null.
export function periodoMese(mese: string | null | undefined): { dal: string; al: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mese ?? '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  const dal = `${y}-${p(mo)}-01`;
  const al = mo === 12 ? `${y + 1}-01-01` : `${y}-${p(mo + 1)}-01`;
  return { dal, al };
}

// Riepilogo per la pagina: quante righe, quante nuove, senza referto, senza cartella.
export function riepilogoPrestazioni(righe: RigaFattura[]) {
  return {
    totale: righe.length,
    nuove: righe.filter((r) => !r.esportato_il).length,
    esportate: righe.filter((r) => !!r.esportato_il).length,
    senza_referto: righe.filter((r) => !r.referto).length,
    senza_cartella: righe.filter((r) => !r.in_cartella).length,
    non_segnate: righe.filter((r) => !r.fatta).length,
    fatturate: righe.filter((r) => r.stato === 'fatturato').length,
    da_fatturare: righe.filter((r) => r.stato === 'da_fatturare').length,
  };
}

// «dd.mm.aaaa» → data, o null.
function dataCh(s: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Il controllo vero: la piattaforma non fattura, verifica che nulla si perda.
// «In sospeso» = prestazione fatta da `giorni` giorni o più che in agenda
// porta ancora la moneta. «Senza stato» = l'agenda non dice nulla (di solito
// appuntamenti importati prima che il robot leggesse lo stato): si segnala
// piano, non è un allarme. Gli annullati e gli scusati non contano.
export function controlloFatturazione(
  righe: RigaFattura[],
  oggi: Date = new Date(),
  giorni = 7
) {
  const limite = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - giorni);
  const utili = righe.filter((r) => !NON_FATTURABILI.has(r.stato));
  const vecchia = (r: RigaFattura) => {
    const d = dataCh(r.data);
    return d !== null && d <= limite;
  };
  const per_stato: Record<string, number> = {};
  for (const r of righe) {
    const k = r.stato || 'senza_stato';
    per_stato[k] = (per_stato[k] ?? 0) + 1;
  }
  return {
    giorni,
    in_sospeso: utili.filter((r) => r.stato === 'da_fatturare' && vecchia(r)),
    senza_stato: utili.filter((r) => !r.stato && vecchia(r)),
    non_fatturabili: righe.filter((r) => NON_FATTURABILI.has(r.stato)).length,
    per_stato,
  };
}
