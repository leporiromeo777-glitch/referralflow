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
  calibrazione?: unknown;   // mm per pixel, dal file: il righello si regge su questo
  geometria?: unknown;      // tutta la geometria (MSE fase 1); calibrazione ne è la vista compatta
};

export type Immagine = { sop_uid: string; numero: number; frame: number; righe: number; colonne: number; ww: number | null; wl: number | null; immagine: boolean; sop_class: string; indice: number; calibrazione: unknown; geometria: unknown };
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
      immagine: !!m.immagine, sop_class: m.sop_class ?? '', indice, calibrazione: m.calibrazione ?? null, geometria: m.geometria ?? null,
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

// ── L'archivio che cresce (7.10.2026) ───────────────────────────────────────
// L'ecografo manda gli esami direttamente al Mac: cinque-dieci al giorno, che
// restano. Due cose pure servono a reggerlo.

// Quali file dello spool entrano nel prossimo lotto: in ordine, non più di
// `perGiro`, e fermandosi al peso dato — ma almeno uno, per grande che sia
// (un filmato da mezzo gigabyte deve poter entrare).
export function scegliLotto(file: { nome: string; byte: number }[], perGiro: number, peso: number): string[] {
  const presi: string[] = []; let somma = 0;
  for (const f of file) {
    if (presi.length >= perGiro) break;
    if (presi.length && somma + f.byte > peso) break;
    presi.push(f.nome); somma += f.byte;
  }
  return presi;
}

// Che cosa si sta cercando nell'elenco degli esami: una data (dell'esame o di
// nascita: 3.5.1950, 03/05/1950, 1950-05-03), un anno, oppure parole che devono
// comparire TUTTE nel nome (della cartella o scritto nel file) o nella
// descrizione. Niente di più furbo: una ricerca che indovina sbaglia persona.
export type Ricerca = { data: string | null; anno: number | null; parole: string[] };
export function leggiRicerca(testo: string): Ricerca {
  const fuori: Ricerca = { data: null, anno: null, parole: [] };
  for (const pezzo of String(testo ?? '').trim().slice(0, 80).split(/\s+/).filter(Boolean)) {
    let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(pezzo);
    if (m) { const d = dataValida(+m[3], +m[2], +m[1]); if (d && !fuori.data) { fuori.data = d; continue; } }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pezzo);
    if (m) { const d = dataValida(+m[1], +m[2], +m[3]); if (d && !fuori.data) { fuori.data = d; continue; } }
    if (/^(19|20)\d{2}$/.test(pezzo) && fuori.anno === null) { fuori.anno = +pezzo; continue; }
    const parola = pezzo.replace(/[%_\\^]/g, '').toLowerCase();
    if (parola.length >= 2 && fuori.parole.length < 4) fuori.parole.push(parola);
  }
  return fuori;
}
function dataValida(a: number, m: number, g: number): string | null {
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || g < 1 || g > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}
export const ricercaVuota = (r: Ricerca): boolean => !r.data && r.anno === null && !r.parole.length;

// L'elenco di serie mostra solo gli esami RECENTI (9.10.2026, richiesta dello
// studio dopo il catalogo dei 3022 esami del NAS): gli altri si trovano coi
// filtri — anno dell'esame, provenienza, stato — da soli o insieme alle parole.
export const GIORNI_RECENTI = 30;
export const ORIGINI = ['rete', 'nas', 'archivio', 'import', 'portale'] as const;
export type Filtro = { anno: number | null; origine: (typeof ORIGINI)[number] | null; stato: 'verifica' | 'senza' | null };
export function leggiFiltro(c: { anno?: unknown; origine?: unknown; stato?: unknown } | null | undefined): Filtro {
  const a = Number(c?.anno);
  const o = String(c?.origine ?? '');
  const s = String(c?.stato ?? '');
  return {
    anno: Number.isInteger(a) && a >= 1900 && a <= 2100 ? a : null,
    origine: (ORIGINI as readonly string[]).includes(o) ? (o as Filtro['origine']) : null,
    stato: s === 'verifica' || s === 'senza' ? s : null,
  };
}
export const filtroVuoto = (f: Filtro): boolean => f.anno === null && f.origine === null && f.stato === null;

