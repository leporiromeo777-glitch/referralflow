// Gli esami dell'archivio dello studio, regole PURE (6.10.2026).
// L'archivio resta al software Philips: la piattaforma chiede «che esami hai
// di questa persona?» e mostra la risposta. Qui si decide quali risposte sono
// di QUELLA persona — con la stessa severità dell'abbinamento delle immagini:
// attaccare gli esami di qualcuno alla cartella di un altro è il danno
// peggiore che questa pagina possa fare.
import { confrontaNomi } from './nome-simile';

export type StudioArchivio = {
  StudyInstanceUID: string; StudyDate: string; StudyTime: string; StudyDescription: string; ModalitiesInStudy: string;
  AccessionNumber: string; PatientName: string; PatientBirthDate: string; PatientID: string; PatientSex: string;
  NumberOfStudyRelatedSeries: string; NumberOfStudyRelatedInstances: string; ReferringPhysicianName: string; InstitutionName: string;
};

export type EsameArchivio = {
  study_uid: string; data: string | null; ora: string | null; descrizione: string; modalita: string;
  paziente: string; nascita: string | null; serie: number | null; immagini: number | null;
  // «sicuro»: stessa data di nascita e nome che suona uguale. «da_controllare»:
  // il nome corrisponde ma una delle due date di nascita manca.
  certezza: 'sicuro' | 'da_controllare' | null;
};

export const uidValido = (s: unknown): s is string => typeof s === 'string' && /^[0-9]+(\.[0-9]+)+$/.test(s) && s.length <= 64;

// «1950-01-01» → «19500101»; «19500101» → «1950-01-01» (null se non è una data).
export const dataDicom = (iso: string | null | undefined): string => (/^\d{4}-\d{2}-\d{2}/.test(String(iso ?? '')) ? String(iso).slice(0, 10).replace(/-/g, '') : '');
export const dataIso = (d: string | null | undefined): string | null => (/^\d{8}$/.test(String(d ?? '')) ? `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}` : null);

// «ROSSI^MARIO^^DR» → «ROSSI MARIO».
export const nomeLeggibile = (pn: string): string => String(pn || '').split('=')[0].split('^').slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();

// Il cognome come lo si chiede all'archivio: la prima parola (almeno tre
// lettere, se no tutto il cognome) più il carattere jolly, com'è scritto e
// in maiuscolo — gli apparecchi di solito scrivono in maiuscolo, e non tutti
// gli archivi ignorano la differenza.
export function modelliNome(cognome: string): string[] {
  const c = String(cognome || '').replace(/[*?^\\=]/g, ' ').replace(/\s+/g, ' ').trim();
  if (c.length < 2) return [];
  const prima = c.split(' ')[0].length >= 3 ? c.split(' ')[0] : c;
  return [...new Set([`${prima}*`, `${prima.toUpperCase()}*`])];
}

function leggi(s: StudioArchivio, certezza: EsameArchivio['certezza']): EsameArchivio {
  const n = (x: string) => (/^\d+$/.test(String(x || '').trim()) ? Number(x) : null);
  const ora = /^\d{4}/.test(s.StudyTime || '') ? `${s.StudyTime.slice(0, 2)}:${s.StudyTime.slice(2, 4)}` : null;
  return {
    study_uid: s.StudyInstanceUID, data: dataIso(s.StudyDate), ora, descrizione: String(s.StudyDescription || '').trim(),
    modalita: String(s.ModalitiesInStudy || '').split('\\').filter(Boolean).join(', '), paziente: nomeLeggibile(s.PatientName),
    nascita: dataIso(s.PatientBirthDate), serie: n(s.NumberOfStudyRelatedSeries), immagini: n(s.NumberOfStudyRelatedInstances), certezza,
  };
}

const perData = (a: EsameArchivio, b: EsameArchivio) => String(b.data ?? '').localeCompare(String(a.data ?? '')) || String(b.ora ?? '').localeCompare(String(a.ora ?? ''));

// Fra le risposte dell'archivio, gli esami di QUESTO paziente. Date di
// nascita diverse: mai. Nome che non corrisponde: mai, nemmeno con la stessa
// data (due persone nate lo stesso giorno). Senza una delle due date il nome
// non basta per agganciare: «da controllare».
export function sceltiPerPaziente(studi: StudioArchivio[], p: { cognome: string; nome: string; data_nascita: string | null }): EsameArchivio[] {
  const mia = dataDicom(p.data_nascita);
  const visti = new Set<string>();
  const out: EsameArchivio[] = [];
  for (const s of studi) {
    if (!uidValido(s.StudyInstanceUID) || visti.has(s.StudyInstanceUID)) continue;
    const sua = /^\d{8}$/.test(s.PatientBirthDate || '') ? s.PatientBirthDate : '';
    if (mia && sua && mia !== sua) continue;
    if (!confrontaNomi(nomeLeggibile(s.PatientName), p)) continue;
    visti.add(s.StudyInstanceUID);
    out.push(leggi(s, mia && sua ? 'sicuro' : 'da_controllare'));
  }
  return out.sort(perData);
}

// Ricerca libera (pagina Immagini): quello che l'archivio risponde, in ordine.
export function tutti(studi: StudioArchivio[]): EsameArchivio[] {
  const visti = new Set<string>();
  return studi.filter((s) => uidValido(s.StudyInstanceUID) && !visti.has(s.StudyInstanceUID) && !!visti.add(s.StudyInstanceUID)).map((s) => leggi(s, null)).sort(perData);
}

// Che cosa si cerca, da ciò che scrive chi cerca: una data di nascita
// («12.03.1961» o «1961-03-12») o un cognome (almeno tre lettere), con o
// senza nome. Niente = non si cerca: l'archivio intero non si sfoglia.
export function filtriDaTesto(q: string): { nome?: string[]; nascita?: string; parole: string } | null {
  const t = String(q || '').trim();
  const d = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/.exec(t) ?? null;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  const nascita = d ? `${d[3]}${d[2].padStart(2, '0')}${d[1].padStart(2, '0')}` : iso ? `${iso[1]}${iso[2]}${iso[3]}` : undefined;
  const parole = t.replace(d?.[0] ?? iso?.[0] ?? '\u0000', ' ').replace(/[^\p{L}' -]/gu, ' ').replace(/\s+/g, ' ').trim();
  const nome = parole.length >= 3 ? modelliNome(parole) : [];
  if (!nascita && !nome.length) return null;
  return { ...(nome.length ? { nome } : {}), ...(nascita ? { nascita } : {}), parole };
}

// I motivi di un recupero fallito, detti a chi guarda.
export function spiegaErrore(codice: string | null | undefined): string {
  switch (codice) {
    case 'destinazione_sconosciuta': return 'L\'archivio non conosce ancora questo Mac come destinazione: va aggiunto fra i suoi dispositivi (nome, indirizzo e porta sono nella pagina Immagini).';
    case 'non_raggiungibile': return 'L\'archivio non risponde: è acceso? Il Mac è collegato alla rete degli apparecchi?';
    case 'rifiutato': return 'L\'archivio ha rifiutato il collegamento.';
    case 'ricerca_rifiutata': return 'L\'archivio ha rifiutato la ricerca.';
    case 'niente_da_mandare': return 'L\'archivio non ha trovato l\'esame da mandare.';
    case 'alcune_immagini_non_arrivate': return 'Non tutte le immagini sono arrivate.';
    case 'niente_arrivato': return 'L\'archivio dice di aver mandato l\'esame, ma qui non è arrivato niente: la ricezione del Mac è accesa e aperta all\'archivio?';
    case 'ricezione_spenta': return 'La ricezione delle immagini su questo Mac è spenta: l\'archivio non saprebbe dove mandare l\'esame.';
    case 'tempo_scaduto': return 'L\'archivio non ha finito in tempo.';
    case 'non_configurato': return 'L\'archivio dello studio non è ancora configurato su questo server.';
    default: return 'Il recupero dall\'archivio non è riuscito.';
  }
}
