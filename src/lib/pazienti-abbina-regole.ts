// Abbinare un nome scritto (in agenda, in un referto) a una cartella: le
// regole, PURE (22.9.2026). Severe per scelta: attaccare un appuntamento o un
// referto alla persona sbagliata è peggio che lasciarlo senza cartella.
//  - il nome si confronta senza accenti, maiuscole e punteggiatura, nei due
//    ordini (cognome nome / nome cognome);
//  - se chi scrive porta una data di nascita e la cartella ne ha una, devono
//    coincidere; se coincidono, scelgono anche fra omonimi;
//  - due cartelle con lo stesso nome e nessuna data che decida: non si abbina.
import { leggiTitolo, nomePulito } from './agenda-titolo';

export type PazienteMinimo = { id: string; cognome: string; nome: string; data_nascita: string | null };

export function chiaveNome(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
// «31.12.1950», «1950-12-31», «31/12/50» → «1950-12-31»; altro → ''.
export function dataIso(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return '';
  const anno = m[3].length === 2 ? (Number(m[3]) > 30 ? `19${m[3]}` : `20${m[3]}`) : m[3];
  return `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export type Indice = Map<string, PazienteMinimo[]>;
export function indicePazienti(pazienti: PazienteMinimo[]): Indice {
  const idx: Indice = new Map();
  const metti = (k: string, p: PazienteMinimo) => { if (!k) return; const l = idx.get(k) ?? []; if (!l.includes(p)) l.push(p); idx.set(k, l); };
  for (const p of pazienti) { metti(chiaveNome(`${p.cognome} ${p.nome}`), p); metti(chiaveNome(`${p.nome} ${p.cognome}`), p); }
  return idx;
}

export type Esito = { id: string | null; motivo: 'unico' | 'unico_per_nascita' | 'nessuno' | 'omonimi' | 'nascita_diversa' };
export function abbina(nome: string, nascita: string | null | undefined, idx: Indice): Esito {
  const candidati = idx.get(chiaveNome(nome)) ?? [];
  if (!candidati.length) return { id: null, motivo: 'nessuno' };
  const n = dataIso(nascita);
  if (n) {
    const stessa = candidati.filter((p) => dataIso(p.data_nascita) === n);
    if (stessa.length === 1) return { id: stessa[0].id, motivo: candidati.length > 1 ? 'unico_per_nascita' : 'unico' };
    if (stessa.length > 1) return { id: null, motivo: 'omonimi' };
    // nessuna cartella con quella data: vale solo se l'unico candidato non ha una data sua
    const senza = candidati.filter((p) => !dataIso(p.data_nascita));
    if (candidati.length === 1 && senza.length === 1) return { id: senza[0].id, motivo: 'unico' };
    return { id: null, motivo: 'nascita_diversa' };
  }
  return candidati.length === 1 ? { id: candidati[0].id, motivo: 'unico' } : { id: null, motivo: 'omonimi' };
}

// Dal titolo dell'agenda, come lo scrive MediOnline — «Cognome Cognome Nome
// (gg.mm.aaaa / N° 123456) · sigla» — a nome, nascita e numero paziente. I
// blocchi che non sono persone («— Formazione (02:00) · M.M.») lo dicono.
export function daTitoloAgenda(titolo: string): { nome: string; nascita: string; nPaziente: string; persona: boolean } {
  const grezzo = (titolo ?? '').trim();
  const t = leggiTitolo(grezzo);
  const persona = !!t.nome && !/^[—–-]/.test(grezzo) && !t.durata && /^[A-Za-zÀ-ÿ]/.test(t.nome);
  return { nome: nomePulito(t.nome || '').trim(), nascita: dataIso(t.nascita), nPaziente: t.nPaziente || '', persona };
}
// Per precompilare «Crea cartella»: il cognome è la parte in MAIUSCOLO
// all'inizio, se c'è; altrimenti la prima parola. È una proposta: la conferma chi salva.
export function proponiAnagrafica(titolo: string): { cognome: string; nome: string; data_nascita: string } {
  const { nome, nascita } = daTitoloAgenda(titolo);
  const parole = nome.split(/\s+/).filter(Boolean);
  let k = 0;
  while (k < parole.length && parole[k].length > 1 && parole[k] === parole[k].toUpperCase() && /[A-ZÀ-Ý]/.test(parole[k])) k++;
  if (k === 0 || k === parole.length) k = Math.min(1, parole.length);
  const bello = (s: string) => s.split(/([\s'-])/).map((x) => (/^[\s'-]$/.test(x) ? x : x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())).join('');
  return { cognome: bello(parole.slice(0, k).join(' ')), nome: bello(parole.slice(k).join(' ')), data_nascita: nascita };
}
