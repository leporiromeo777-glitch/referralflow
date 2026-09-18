// Mettere in ordine quello che arriva (18.9.2026) — logica pura, provata.
//
// Da un CD, da una chiavetta o da un trascinamento nella pagina arrivano
// centinaia di file sciolti, senza alcun ordine: è il DICOM dentro a dire a
// quale esame e a quale serie appartengono. Qui non si tocca il disco e non si
// parla col database: si prendono i metadati letti e si dice come si
// raggruppano, a chi somigliano e con quale finestra si guardano.

export type MetaMinima = {
  study_uid: string; series_uid: string; sop_uid: string;
  modalita: string; data_esame: string; ora_esame?: string;
  descrizione_esame: string; descrizione_serie: string;
  numero_serie: number; numero_immagine: number; parte_corpo?: string;
  accession?: string; istituto?: string; inviante?: string;
  paziente_nome: string; paziente_nascita: string; paziente_id?: string;
  righe: number; colonne: number; frame: number; immagine: boolean;
  ww?: number | null; wl?: number | null; sop_class?: string;
};

export type Immagine = { sop_uid: string; numero: number; frame: number; righe: number; colonne: number; ww: number | null; wl: number | null; immagine: boolean; sop_class: string; indice: number };
export type Serie = { serie_uid: string; modalita: string; descrizione: string; numero: number; parte_corpo: string; immagini: Immagine[] };
export type Esame = {
  study_uid: string; accession: string; data_esame: string; ora_esame: string;
  descrizione: string; modalita: string; istituto: string; inviante: string;
  paziente_nome: string; paziente_nascita: string; paziente_id: string;
  serie: Serie[]; n_immagini: number;
};

export const slugNome = (s: string): string =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).sort().join(' ');

// Un file senza descrizione non è un file senza nome: la modalità e la parte
// del corpo bastano a riconoscerlo in elenco, e «Esame» da solo no.
export function etichetta(m: MetaMinima): string {
  const pezzi = [m.descrizione_esame?.trim(), m.parte_corpo?.trim()].filter(Boolean);
  if (pezzi.length) return pezzi.join(' · ').slice(0, 200);
  return (m.modalita || 'Esame').toUpperCase();
}

// I file arrivano mescolati: si raggruppano per StudyInstanceUID e, dentro,
// per SeriesInstanceUID. L'ordine dentro la serie è quello dell'apparecchio
// (InstanceNumber), non quello del nome del file — che spesso è casuale.
export function raggruppa(lette: { indice: number; meta: MetaMinima }[]): Esame[] {
  const esami = new Map<string, Esame>();
  for (const { indice, meta: m } of lette) {
    if (!m?.study_uid || !m?.series_uid || !m?.sop_uid) continue;
    let e = esami.get(m.study_uid);
    if (!e) {
      e = {
        study_uid: m.study_uid, accession: m.accession ?? '', data_esame: m.data_esame ?? '',
        ora_esame: m.ora_esame ?? '', descrizione: etichetta(m), modalita: '',
        istituto: m.istituto ?? '', inviante: m.inviante ?? '',
        paziente_nome: m.paziente_nome ?? '', paziente_nascita: m.paziente_nascita ?? '',
        paziente_id: m.paziente_id ?? '', serie: [], n_immagini: 0,
      };
      esami.set(m.study_uid, e);
    }
    let s = e.serie.find((x) => x.serie_uid === m.series_uid);
    if (!s) {
      s = { serie_uid: m.series_uid, modalita: (m.modalita || '').toUpperCase(), descrizione: m.descrizione_serie ?? '', numero: m.numero_serie || 0, parte_corpo: m.parte_corpo ?? '', immagini: [] };
      e.serie.push(s);
    }
    if (s.immagini.some((x) => x.sop_uid === m.sop_uid)) continue;   // stesso file due volte
    s.immagini.push({
      sop_uid: m.sop_uid, numero: m.numero_immagine || 0, frame: Math.max(1, m.frame || 1),
      righe: m.righe || 0, colonne: m.colonne || 0,
      ww: Number.isFinite(m.ww as number) ? Number(m.ww) : null,
      wl: Number.isFinite(m.wl as number) ? Number(m.wl) : null,
      immagine: !!m.immagine, sop_class: m.sop_class ?? '', indice,
    });
  }
  for (const e of esami.values()) {
    e.serie.sort((a, b) => (a.numero || 9999) - (b.numero || 9999) || a.serie_uid.localeCompare(b.serie_uid));
    for (const s of e.serie) s.immagini.sort((a, b) => (a.numero || 9999) - (b.numero || 9999) || a.sop_uid.localeCompare(b.sop_uid));
    e.n_immagini = e.serie.reduce((n, s) => n + s.immagini.length, 0);
    e.modalita = [...new Set(e.serie.map((s) => s.modalita).filter(Boolean))].sort().join(', ');
  }
  return [...esami.values()];
}

// A quale paziente della cartella appartiene un esame.
//
// Regola severa, e resta severa: si abbina SOLO quando nome e data di nascita
// combaciano tutti e due, e un solo paziente corrisponde. Un omonimo senza
// data non si indovina: l'esame resta «da verificare» e lo abbina una persona.
// Attaccare le immagini al paziente sbagliato è il danno peggiore che questa
// pagina possa fare.
export function abbinaPaziente(
  nomeDicom: string, nascitaDicom: string,
  pazienti: { id: string; cognome: string; nome: string; data_nascita: string | null }[]
): { id: string | null; motivo: 'abbinato' | 'senza_nome' | 'nessuno' | 'omonimi' | 'nascita_diversa' } {
  const chiave = slugNome(nomeDicom);
  if (!chiave) return { id: null, motivo: 'senza_nome' };
  const stessoNome = pazienti.filter((p) => slugNome(`${p.cognome} ${p.nome}`) === chiave);
  if (!stessoNome.length) return { id: null, motivo: 'nessuno' };
  if (!nascitaDicom) return stessoNome.length === 1 ? { id: null, motivo: 'nascita_diversa' } : { id: null, motivo: 'omonimi' };
  const conNascita = stessoNome.filter((p) => (p.data_nascita ?? '').slice(0, 10) === nascitaDicom);
  if (conNascita.length === 1) return { id: conNascita[0].id, motivo: 'abbinato' };
  if (conNascita.length > 1) return { id: null, motivo: 'omonimi' };
  return { id: null, motivo: 'nascita_diversa' };
}

// Le finestre che un medico usa davvero, per modalità. Non sono preferenze
// grafiche: sono il modo in cui si guarda un tessuto invece di un altro.
export const FINESTRE: Record<string, { nome: string; ww: number; wl: number }[]> = {
  CT: [
    { nome: 'Mediastino', ww: 350, wl: 50 },
    { nome: 'Polmone', ww: 1500, wl: -600 },
    { nome: 'Osso', ww: 2000, wl: 400 },
    { nome: 'Cervello', ww: 80, wl: 40 },
    { nome: 'Angio', ww: 600, wl: 150 },
  ],
  MR: [],
  US: [],
  XA: [],
};

export function finestreDi(modalita: string): { nome: string; ww: number; wl: number }[] {
  const m = String(modalita ?? '').toUpperCase().split(/[,\s]+/)[0];
  return FINESTRE[m] ?? [];
}
