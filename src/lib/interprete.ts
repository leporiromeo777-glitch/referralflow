// Interprete delle domande scritte (13.9.2026): dal testo libero all'azione,
// in CODICE. Normalizza (minuscole, accenti, punteggiatura), tollera i refusi
// («ciusura mensile» → chiusura), riconosce la procedura dalle frasi del
// registro e dalle parole chiave, estrae paziente (dalle anagrafiche che
// riceve), mese e giorno, usa il contesto della pagina (paziente aperto,
// bozza aperta), e dice quanto è sicuro. Nei casi grigi il modello locale può
// essere interpellato come giudice tra le procedure (fuori da qui, in
// `api/prototipo/interpreta`), ma la sua scelta è verificata contro il
// registro. Puro, testato in `prove-interprete.test.ts`.
import { PRIORITA, type ProceduraDef } from './procedure-registro';

export type PazienteNoto = { id: string; cognome: string; nome: string };
export type ContestoDomanda = { pagina?: string; paziente_id?: string | null; bozza_id?: string | null; documento_id?: string | null };
export type Sicurezza = 'alta' | 'media' | 'nessuna';
export type Candidato = { nome: string; titolo: string; punteggio: number; perche: string[] };

export type Interpretazione = {
  domanda: string;
  normalizzata: string;
  sicurezza: Sicurezza;
  procedura: ProceduraDef | null;
  candidati: Candidato[];
  paziente: PazienteNoto | null;
  pazientiAmbigui: PazienteNoto[];
  bozzaId: string | null;
  mese: string | null;
  giorno: string | null;
  mancano: ('paziente' | 'bozza')[];
  spiegazione: string;
};

export function normalizza(s: string): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’`´]/g, ' ').replace(/[^a-z0-9\s/.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function gettoni(s: string): string[] {
  return normalizza(s).split(' ').filter((t) => t.length >= 2);
}

const GENERICHE = new Set(['il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'uno', 'di', 'del', 'della', 'dei', 'delle', 'dello', 'degli', 'da', 'dal', 'dalla', 'in', 'nel', 'nella', 'per', 'con', 'su', 'sul', 'sulla', 'che', 'chi', 'cosa', 'come', 'quando', 'quale', 'quali', 'mi', 'ti', 'ci', 'si', 'ha', 'ho', 'e', 'ed', 'a', 'al', 'alla', 'ai', 'agli', 'o', 'ma', 'se', 'non', 'piu', 'anche', 'fai', 'fammi', 'dammi', 'puoi', 'vorrei', 'voglio', 'per favore', 'grazie', 'signor', 'signora', 'sig', 'dott', 'dottor', 'dr', 'paziente', 'pazienti', 'abbiamo', 'avete', 'hanno', 'oggi', 'ieri', 'domani', 'questa', 'questo', 'questi', 'queste', 'fatto', 'fatti', 'esami', 'esame', 'documenti', 'documento']);

// Distanza di Levenshtein limitata: basta sapere se è ≤ max.
export function distanza(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minRiga = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (cur[j] < minRiga) minRiga = cur[j];
    }
    if (minRiga > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

// Un gettone «somiglia» a una radice: inizia con la radice, o la radice inizia
// col gettone (≥4), o differiscono per 1 refuso (≥5 lettere) / 2 (≥8).
export function somiglia(gettone: string, radice: string): boolean {
  if (gettone.startsWith(radice)) return true;
  if (gettone.length >= 4 && radice.startsWith(gettone)) return true;
  const n = Math.min(gettone.length, radice.length);
  const tolleranza = n >= 8 ? 2 : n >= 5 ? 1 : 0;
  if (!tolleranza) return false;
  return distanza(gettone.slice(0, radice.length + tolleranza), radice, tolleranza) <= tolleranza;
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function meseDaTesto(norm: string, oggi: Date): string | null {
  const m = norm.match(new RegExp(`(${MESI.join('|')})(?:\\s+(\\d{4}))?`));
  if (m) return `${m[2] ? Number(m[2]) : oggi.getFullYear()}-${String(MESI.indexOf(m[1]) + 1).padStart(2, '0')}`;
  if (/mese scorso|scorso mese|mese passato/.test(norm)) { const d = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  const iso = norm.match(/\b(\d{4})-(\d{2})\b/);
  return iso ? `${iso[1]}-${iso[2]}` : null;
}

export function giornoDaTesto(norm: string, oggi: Date): string | null {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (/\bdomani\b/.test(norm)) return iso(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1));
  if (/\bieri\b/.test(norm)) return iso(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 1));
  if (/\bdopodomani\b/.test(norm)) return iso(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 2));
  const d = norm.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/);
  if (d) return `${d[3] ? Number(d[3]) : oggi.getFullYear()}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  return null;
}

// Il paziente nominato: cognome o nome (≥4 lettere, con 1 refuso ammesso)
// tra i gettoni non generici. Se più pazienti corrispondono, sono ambigui;
// se cognome E nome compaiono entrambi, quello vince.
export function pazienteDaTesto(norm: string, pazienti: PazienteNoto[]): { paziente: PazienteNoto | null; ambigui: PazienteNoto[] } {
  const tok = gettoni(norm).filter((t) => !GENERICHE.has(t));
  const corrisponde = (parola: string) => { const p = normalizza(parola); return p.length >= 3 && tok.some((t) => t === p || (p.length >= 5 && t.length >= 5 && distanza(t, p, 1) <= 1)); };
  const trovati = pazienti.map((p) => {
    const cog = p.cognome.split(/[\s-]+/).some(corrisponde);
    const nom = p.nome.split(/[\s-]+/).some(corrisponde);
    return { p, n: (cog ? 2 : 0) + (nom ? 1 : 0) };
  }).filter((x) => x.n >= 1);
  if (!trovati.length) return { paziente: null, ambigui: [] };
  const max = Math.max(...trovati.map((x) => x.n));
  const migliori = trovati.filter((x) => x.n === max).map((x) => x.p);
  // solo il nome di battesimo non basta se ce ne sono altri con lo stesso
  if (max === 1 && migliori.length > 1) return { paziente: null, ambigui: migliori };
  return migliori.length === 1 ? { paziente: migliori[0], ambigui: [] } : { paziente: null, ambigui: migliori };
}

export function candidatiProcedura(norm: string, registro: ProceduraDef[]): Candidato[] {
  const tok = gettoni(norm).filter((t) => !GENERICHE.has(t));
  const out: Candidato[] = [];
  for (const p of registro) {
    const perche: string[] = [];
    let punteggio = 0;
    if (p.frasi.some((f) => { try { return new RegExp(f, 'i').test(norm); } catch { return false; } })) { punteggio += 3; perche.push('frase del registro'); }
    const forte = p.parole[0];
    const colpite = p.parole.filter((r) => tok.some((t) => somiglia(t, r)));
    for (const r of colpite) { punteggio += r === forte ? 2 : 1; perche.push(r === forte ? `parola forte «${r}»` : `parola «${r}»`); }
    if (punteggio > 0) out.push({ nome: p.nome, titolo: p.titolo, punteggio, perche });
  }
  return out.sort((a, b) => b.punteggio - a.punteggio || PRIORITA.indexOf(a.nome) - PRIORITA.indexOf(b.nome));
}

export function interpreta(domanda: string, a: { registro: ProceduraDef[]; pazienti: PazienteNoto[]; contesto?: ContestoDomanda; oggi?: Date }): Interpretazione {
  const oggi = a.oggi ?? new Date();
  const norm = normalizza(domanda);
  const ctx = a.contesto ?? {};
  const candidati = candidatiProcedura(norm, a.registro);
  const primo = candidati[0];
  const secondo = candidati[1];
  let sicurezza: Sicurezza = 'nessuna';
  if (primo) {
    const forteColpita = primo.perche.some((x) => x.startsWith('frase') || x.startsWith('parola forte'));
    // alta: frase o parola forte con distacco netto; oppure la parola forte da
    // sola senza nessun altro candidato («brifing di Pedrazini»).
    if (primo.punteggio >= 3 && forteColpita && (!secondo || primo.punteggio - secondo.punteggio >= 2)) sicurezza = 'alta';
    else if (primo.punteggio >= 2 && forteColpita && !secondo) sicurezza = 'alta';
    else if (primo.punteggio >= 2 || forteColpita) sicurezza = 'media';
  }
  const procedura = sicurezza === 'nessuna' ? null : a.registro.find((p) => p.nome === primo.nome) ?? null;

  const { paziente: nominato, ambigui } = pazienteDaTesto(norm, a.pazienti);
  const inContesto = ctx.paziente_id ? a.pazienti.find((p) => p.id === ctx.paziente_id) ?? null : null;
  const paziente = nominato ?? (ambigui.length ? null : inContesto);
  const bozzaId = ctx.bozza_id ?? null;
  const mese = meseDaTesto(norm, oggi);
  const giorno = giornoDaTesto(norm, oggi);
  const mancano: ('paziente' | 'bozza')[] = [];
  if (procedura?.input === 'paziente' && !paziente) mancano.push('paziente');
  if (procedura?.input === 'bozza' && !bozzaId && !paziente) mancano.push('bozza');

  const spiegazione = procedura
    ? `«${procedura.titolo}»${paziente ? ` per ${paziente.cognome} ${paziente.nome}` : ''}${mese ? ` · ${mese}` : ''}${giorno ? ` · ${giorno}` : ''} (${sicurezza === 'alta' ? 'sicuro' : 'probabile'}: ${primo.perche.join(', ')})`
    : 'nessuna procedura riconosciuta: domanda libera';
  return { domanda, normalizzata: norm, sicurezza, procedura, candidati, paziente, pazientiAmbigui: ambigui, bozzaId, mese, giorno, mancano, spiegazione };
}
