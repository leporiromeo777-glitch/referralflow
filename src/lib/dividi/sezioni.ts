// Dividi cartella, seconda mano (9.10.2026, [[Piattaforma/Dividi cartella]]). PURO.
//
// Tre cose che le sole regole di tagli.ts non davano:
//  1. i FOGLI SEPARATORI col codice a barre: la cartella cartacea dello studio mette un foglio fra un
//     gruppo di documenti e l'altro, e il codice dice che sezione comincia (le ultime due cifre: 00 è la
//     prima sezione, 01 la seconda…). Ogni sezione diventa una sottocartella; il foglio resta fuori.
//  2. il GIUDIZIO DEL MODELLO locale, pagina per pagina («comincia un documento?», data, che documento è),
//     che legge il contesto dove le regole contano solo parole. Le regole restano il paracadute — quando il
//     modello non c'è — e il freno: una «pagina 2 di 3» o un retro bianco non aprono mai un documento, e una
//     data che nella pagina non è scritta non si accetta.
//  3. il NOME del documento come lo vuole lo studio: «AAAA.MM.GG Cognome Nome Che cos'è».
// Qui si compone la proposta; chi legge i codici (imaging/separatori.py) e chi chiede al modello
// (analisi.ts) sta fuori. La conferma resta di una persona.
import { ETICHETTE, SOGLIA, dataDelDocumento, dataIn, inizio, tipoDaTitolo, tipoDelDocumento, tutteLeDate, type Pezzo, type Tipo } from './tagli';

// Le sezioni della cartella cartacea dello studio, col numero che portano nel nome. `tipo` è il tipo dei
// documenti quando la sezione lo dice da sola; `voce` è come chiamare un documento di cui non si capisce altro.
export const SEZIONI: Record<number, { nome: string; tipo: Tipo | null; voce: string }> = {
  1: { nome: '01_Rapporti', tipo: null, voce: 'Rapporto' },
  2: { nome: '02_Rapporti esterni - ricoveri', tipo: null, voce: 'Rapporto esterno' },
  3: { nome: '03_Appunti', tipo: 'altro', voce: 'Appunti' },
  4: { nome: '04_ECG - tracciato PM-ICD', tipo: 'ecg', voce: 'ECG' },
  5: { nome: '05_Apparecchi', tipo: null, voce: 'Apparecchio' },
  6: { nome: '06_Ciclo - Ergospiro', tipo: 'ciclo', voce: 'Cicloergometria' },
  7: { nome: '07_TAC - MRI - RX', tipo: 'imaging', voce: 'Imaging' },
  8: { nome: '08_Intervento cardiologico', tipo: null, voce: 'Intervento' },
  9: { nome: '09_Laboratorio e analisi', tipo: 'laboratorio', voce: 'Laboratorio' },
  10: { nome: '10_Vari', tipo: 'altro', voce: 'Documento' },
  11: { nome: '11_Documenti amministrativi', tipo: 'altro', voce: 'Documento amministrativo' },
};

export type Foglio = { copertina: true } | { copertina: false; numero: number; nome: string };
// Che foglio è, dal codice letto: sei cifre = separatore di sezione (le ultime due, da 00); lettere e cifre
// = la copertina col numero del paziente. Un codice che non si riconosce non è un separatore.
export function foglioDelCodice(codice: string): Foglio | null {
  const c = String(codice ?? '').replace(/\s+/g, '').toUpperCase();
  if (/^\d{6}$/.test(c)) {
    const numero = Number(c.slice(4)) + 1;
    return { copertina: false, numero, nome: SEZIONI[numero]?.nome ?? `${String(numero).padStart(2, '0')}_Sezione ${numero}` };
  }
  if (/^[A-Z]{1,3}\d{5,10}$/.test(c)) return { copertina: true };
  return null;
}

export type Risposta = { nuovo: boolean; data: string | null; titolo: string | null };
export type Separatore = { pagina: number; codice: string };
export type PezzoSezione = Pezzo & { cartella: string | null; escluso: boolean; descrizione: string; foglio: 'separatore' | 'copertina' | null };

const lettere = (t: string) => String(t ?? '').replace(/[^A-Za-zÀ-ÿ]/g, '').length;
const seguito = (segnali: string[]) => segnali.some((x) => /^pagina \d+ di N$/.test(x) && x !== 'pagina 1 di N');

// Le pagine da far leggere al modello: quelle scritte, che non sono fogli separatori e non dichiarano da
// sole di essere un seguito («pagina 2 di 3»).
export function pagineDaChiedere(testi: string[], separatori: Separatore[]): number[] {
  const fogli = new Set(separatori.filter((s) => foglioDelCodice(s.codice)).map((s) => s.pagina));
  const fuori: number[] = [];
  for (let i = 0; i < testi.length; i++) {
    if (fogli.has(i + 1) || lettere(testi[i]) < 40) continue;
    if (seguito(inizio(testi[i], null).segnali)) continue;
    fuori.push(i + 1);
  }
  return fuori;
}
// Che cosa si dà al modello per una pagina: la fine dell'ultima pagina scritta prima (nella stessa sezione)
// e l'inizio e la fine di questa. Poco testo: basta a capire se il discorso continua, e fa presto.
export function estratti(testi: string[], separatori: Separatore[], pagina: number): { sezione: string; prima: string; questa: string } {
  const fogli = new Map(separatori.map((s) => [s.pagina, foglioDelCodice(s.codice)] as const).filter((x) => x[1]));
  let sezione = '', prima = '';
  for (let k = pagina - 1; k >= 1; k--) {
    const f = fogli.get(k);
    if (f) { if (!f.copertina) sezione = f.nome; break; }
    if (!prima && lettere(testi[k - 1]) >= 40) prima = testi[k - 1].trim().slice(-500);
  }
  if (!sezione) for (let k = pagina - 1; k >= 1; k--) { const f = fogli.get(k); if (f && !f.copertina) { sezione = f.nome; break; } }
  const t = String(testi[pagina - 1] ?? '').trim();
  return { sezione, prima, questa: t.length > 1700 ? `${t.slice(0, 1300)}\n[…]\n${t.slice(-300)}` : t };
}

// Il titolo breve detto dal modello, ripulito: senza il nome del paziente, senza date, senza segni che un
// nome di file non regge. Vuoto se non resta niente di utile.
export function pulisciTitolo(titolo: string | null | undefined, paziente: string): string {
  let t = String(titolo ?? '').replace(/[\\/:*?"<>|\u0000-\u001f«»]/g, ' ');
  for (const w of paziente.split(/\s+/).filter((x) => x.length >= 3)) t = t.replace(new RegExp(`(^|[^A-Za-zÀ-ÿ])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-zÀ-ÿ])`, 'gi'), '$1');
  t = t.replace(/\b\d{1,2}\s?[./-]\s?\d{1,2}\s?[./-]\s?\d{2,4}\b/g, ' ').replace(/\b(paziente|signor[ae]?|sig\.(?:ra)?)\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,.;–-]+|[\s,.;–-]+$/g, '').trim();
  if (t.length > 48) t = t.slice(0, 48).replace(/\s+\S*$/, '');
  return /^(documento|pagina|testo|n\/a|null|sconosciuto)?$/i.test(t) ? '' : t;
}
// Il nome del documento: data (anno.mese.giorno, così l'ordine alfabetico è quello del tempo), paziente, che cos'è.
export function nomeDocumento(data: string | null, paziente: string, descrizione: string): string {
  return [data ? `${data.slice(0, 4)}.${data.slice(5, 7)}.${data.slice(8, 10)}` : '', paziente.trim(), descrizione.trim()].filter(Boolean).join(' ');
}

// La proposta: i pezzi in ordine di pagina. I fogli separatori sono pezzi «lasciati fuori» che aprono una sezione.
export function componi(testi: string[], separatori: Separatore[], risposte: Record<number, Risposta>, paziente: string): PezzoSezione[] {
  const fogli = new Map<number, Foglio>();
  for (const s of separatori) { const f = foglioDelCodice(s.codice); if (f && s.pagina >= 1 && s.pagina <= testi.length) fogli.set(s.pagina, f); }
  const pezzi: PezzoSezione[] = [];
  let sezione: { numero: number; nome: string } | null = null;
  let apre = true;                       // la prossima pagina scritta apre per forza un documento (prima pagina, o dopo un separatore)
  let ultimaPiena: string | null = null;
  let regola: { categoria: Tipo; data: string | null } | null = null;      // tipo e data che le REGOLE danno al pezzo in corso (per la testata ripetuta)
  let corrente: PezzoSezione | null = null;
  const dataDi = (i: number): string | null => {
    const r = risposte[i + 1];
    const delModello = r?.data ? dataIn(r.data) : null;
    return delModello && tutteLeDate(testi[i]).has(delModello) ? delModello : dataDelDocumento(testi[i]);
  };
  const senzaTesto = testi.every((t, k) => fogli.has(k + 1) || lettere(t) < 40);
  for (let i = 0; i < testi.length; i++) {
    const f = fogli.get(i + 1);
    if (f) {
      if (!f.copertina) sezione = { numero: f.numero, nome: f.nome };
      pezzi.push({ da: i + 1, a: i + 1, categoria: 'altro', data: null, titolo: f.copertina ? 'Copertina' : `Separatore ${f.nome}`, descrizione: '', sicurezza: 'alta', segnali: ['codice a barre'],
        cartella: f.copertina ? null : f.nome, escluso: true, foglio: f.copertina ? 'copertina' : 'separatore' });
      apre = true; ultimaPiena = null; corrente = null; regola = null;
      continue;
    }
    const s0 = inizio(testi[i], ultimaPiena), r = risposte[i + 1];
    const s = senzaTesto ? { ...s0, vuota: false } : s0;
    const catRegola = tipoDelDocumento(testi[i]), dataRegola = dataDelDocumento(testi[i]);
    if (!s.vuota) ultimaPiena = testi[i];
    const ripetuta = !!regola && s.segnali.every((x) => x.startsWith('titolo') || x === 'data in cima') && regola.categoria === catRegola && regola.data === dataRegola && catRegola !== 'altro';
    const perRegole = s.punti >= SOGLIA && !ripetuta;
    let nuovo: boolean, sicurezza: Pezzo['sicurezza'], segnali = s.segnali;
    if (!corrente || apre) { nuovo = true; sicurezza = 'alta'; segnali = [i === 0 ? 'prima pagina' : sezione ? 'dopo il separatore' : 'prima pagina', ...s.segnali]; }
    else if (s.vuota || senzaTesto || seguito(s.segnali)) { nuovo = false; sicurezza = 'alta'; }
    else if (s.segnali.includes('pagina 1 di N')) { nuovo = true; sicurezza = 'alta'; }
    else if (r) { nuovo = r.nuovo; sicurezza = r.nuovo === perRegole ? 'alta' : 'media'; segnali = [...s.segnali, r.nuovo ? 'il modello: documento nuovo' : 'il modello: continua']; }
    else { nuovo = perRegole; sicurezza = s.punti >= 5 ? 'alta' : 'media'; }
    if (!nuovo) { corrente!.a = i + 1; continue; }
    const descrModello = pulisciTitolo(r?.titolo, paziente);
    const sez = sezione ? SEZIONI[sezione.numero] : undefined;
    const categoria: Tipo = sez?.tipo ?? tipoDaTitolo(descrModello) ?? (catRegola !== 'altro' ? catRegola : 'altro');
    const data = dataDi(i);
    const descrizione = descrModello || (catRegola !== 'altro' && !sez?.tipo ? ETICHETTE[catRegola] : sez?.voce ?? ETICHETTE[categoria]);
    corrente = { da: i + 1, a: i + 1, categoria, data, titolo: s.vuota ? 'Pagina bianca' : nomeDocumento(data, paziente, descrizione), descrizione: s.vuota ? '' : descrizione, sicurezza, segnali, cartella: sezione?.nome ?? null, escluso: s.vuota, foglio: null };
    pezzi.push(corrente);
    regola = { categoria: catRegola, data: dataRegola };
    apre = s.vuota;                       // il retro bianco del foglio separatore resta fuori, e il documento comincia dopo
  }
  // Senza testo da nessuna parte (scansione non ancora letta): un pezzo per sezione, e lo si dice.
  if (senzaTesto && testi.length > 1) for (const p of pezzi) if (!p.foglio) p.sicurezza = 'bassa';
  return pezzi;
}
