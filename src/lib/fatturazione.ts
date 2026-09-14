// Prestazioni da fatturare (14.9.2026): la piattaforma non emette fatture;
// prepara le righe delle prestazioni erogate nel periodo e le esporta in CSV
// per il gestionale di fatturazione dello studio (`;` come separatore, BOM
// UTF-8: Excel in italiano/tedesco lo apre giusto). Funzioni pure e testate;
// le query stanno nell'endpoint. Nel file mai testo clinico: solo chi, quando,
// con chi, quale prestazione.
export type RigaFattura = {
  id: string; data: string; ora: string; durata: number;
  cognome: string; nome: string; nascita: string; assicurazione: string; in_cartella: boolean;
  medico: string; prestazione: string; luogo: string;
  fatta: boolean; referto: boolean; inviante: string;
  esportato_il: string;
};

export const COLONNE = ['Data', 'Ora', 'Durata (min)', 'Cognome', 'Nome', 'Data di nascita', 'Assicurazione', 'Medico', 'Prestazione', 'Luogo', 'Visita segnata fatta', 'Referto confermato', 'Medico inviante', 'ID appuntamento', 'Esportato il'] as const;

function cella(v: string | number | boolean): string {
  const s = typeof v === 'boolean' ? (v ? 'sì' : 'no') : String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvPrestazioni(righe: RigaFattura[]): string {
  const testa = COLONNE.join(';');
  const corpo = righe.map((r) => [r.data, r.ora, r.durata, r.cognome, r.nome, r.nascita, r.assicurazione, r.medico, r.prestazione, r.luogo, r.fatta, r.referto, r.inviante, r.id, r.esportato_il].map(cella).join(';'));
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
  };
}
