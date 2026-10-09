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
import { ETICHETTE, SOGLIA, dataDelDocumento, dataIn, formaDaTesto, inizio, tipoDaTitolo, tipoDelDocumento, tutteLeDate, type Forma, type Pezzo, type Tipo } from './tagli';

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
  12: { nome: '12_Ricette', tipo: 'altro', voce: 'Ricetta' },
};
// Le sezioni dove un documento è «tutte le pagine di un giorno» (un tracciato e le sue strisce, gli appunti di una visita):
// lì un documento nuovo comincia quando cambia la data, non a ogni foglio.
const PER_GIORNO = new Set([3, 4]);
// Le sezioni fatte di esami (apparecchi, ciclo, immagini, laboratorio): i referti spesso non finiscono col nome di un
// medico, e un esame nuovo si riconosce anche solo dalla data che cambia.
const PER_ESAME = new Set([5, 6, 7, 9]);

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
export function pagineDaChiedere(testi: string[], separatori: Separatore[], forme?: Forma[]): number[] {
  const fogli = new Map(separatori.map((s) => [s.pagina, foglioDelCodice(s.codice)] as const).filter((x) => x[1]));
  const F = forme ?? testi.map(formaDaTesto);
  const fuori: number[] = [];
  let prima: number | null = null, perGiorno = false;      // l'ultima pagina scritta della stessa sezione; perGiorno: qui la forma non basta a escludere
  for (let i = 0; i < testi.length; i++) {
    const f = fogli.get(i + 1);
    if (f) { prima = null; if (!f.copertina) perGiorno = PER_GIORNO.has(f.numero) || PER_ESAME.has(f.numero); continue; }
    if (lettere(testi[i]) < 40) continue;
    const s = inizio(testi[i], null);
    // Di sicuro un seguito: lo dice la pagina («pagina 2 di 3»), oppure la pagina prima non ha chiuso e questa non ha niente di un inizio.
    const seguitoCerto = seguito(s.segnali) || (prima !== null && !perGiorno && !F[prima].chiusa && ((!F[i].titolo && F[i].destra < 2 && s.punti < SOGLIA) || s.segnali.includes('comincia in minuscolo')));
    prima = i;
    if (!seguitoCerto) fuori.push(i + 1);
  }
  return fuori;
}
// Che cosa si dà al modello per una pagina: la fine dell'ultima pagina scritta prima (nella stessa sezione)
// e l'inizio e la fine di questa. Poco testo: basta a capire se il discorso continua, e fa presto.
export const TAGLIO = { testa: 1300, coda: 300, prima: 500 };
export type Estratto = { sezione: string; prima: string; questa: string; indizi: { chiusaPrima: boolean | null; titolo: boolean; destra: boolean } };
export function estratti(testi: string[], separatori: Separatore[], pagina: number, taglio = TAGLIO, forme?: Forma[]): Estratto {
  const fogli = new Map(separatori.map((s) => [s.pagina, foglioDelCodice(s.codice)] as const).filter((x) => x[1]));
  let sezione = '', prima = '', quale = 0;
  for (let k = pagina - 1; k >= 1; k--) {
    const f = fogli.get(k);
    if (f) { if (!f.copertina) sezione = f.nome; break; }
    if (!prima && lettere(testi[k - 1]) >= 40) { prima = testi[k - 1].trim().slice(-taglio.prima); quale = k; }
  }
  if (!sezione) for (let k = pagina - 1; k >= 1; k--) { const f = fogli.get(k); if (f && !f.copertina) { sezione = f.nome; break; } }
  const t = String(testi[pagina - 1] ?? '').trim();
  // Gli indizi dell'impaginazione, che dal testo spezzato il modello non può vedere: glieli si dice.
  const F = (k: number) => forme?.[k - 1] ?? formaDaTesto(testi[k - 1]);
  const indizi = { chiusaPrima: quale ? F(quale).chiusa : null, titolo: F(pagina).titolo, destra: F(pagina).destra >= 2 };
  return { sezione, prima, questa: t.length > taglio.testa + taglio.coda + 100 ? `${t.slice(0, taglio.testa)}\n[…]\n${t.slice(-taglio.coda)}` : t, indizi };
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
export function componi(testi: string[], separatori: Separatore[], risposte: Record<number, Risposta>, paziente: string, forme?: Forma[]): PezzoSezione[] {
  const F = forme ?? testi.map(formaDaTesto);
  const fogli = new Map<number, Foglio>();
  for (const s of separatori) { const f = foglioDelCodice(s.codice); if (f && s.pagina >= 1 && s.pagina <= testi.length) fogli.set(s.pagina, f); }
  const pezzi: PezzoSezione[] = [];
  let sezione: { numero: number; nome: string } | null = null;
  let apre = true;                       // la prossima pagina scritta apre per forza un documento (prima pagina, o dopo un separatore)
  let ultimaPiena: string | null = null;
  let chiusaPrima = false;              // l'ultima pagina scritta del documento in corso finisce col nome del medico o coi saluti
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
      apre = true; ultimaPiena = null; corrente = null; regola = null; chiusaPrima = false;
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
    else if (sezione && PER_GIORNO.has(sezione.numero)) {
      // Tracciati e appunti: un documento per giorno. Cambia la data → documento nuovo; stessa data o nessuna → continua.
      const d = dataDi(i);
      // Il documento in corso non aveva ancora una data (un primo foglio senza): la prende da qui, senza spezzarsi.
      if (d && !corrente.data) { corrente.data = d; corrente.titolo = nomeDocumento(d, paziente, corrente.descrizione); }
      // Una pagina può portare più date (quella dell'esame, quella di nascita, quella di stampa): se fra le sue c'è
      // quella del documento in corso, è ancora lui.
      nuovo = !!d && d !== corrente.data && !tutteLeDate(testi[i]).has(corrente.data ?? ''); sicurezza = d ? 'alta' : 'media'; segnali = [...s.segnali, nuovo ? 'cambia la data' : d ? 'stessa data' : 'senza data: resta col documento prima'];
    } else {
      // La forma della pagina (indicazione dello studio): finché la pagina prima non «chiude» col nome del medico o coi
      // saluti, e questa non ha né un titolo in alto né il blocco a destra né altri segni d'inizio, è il suo seguito —
      // qualunque cosa dica il modello. Se la pagina prima ha chiuso e questa ha un inizio, è un documento nuovo.
      const minuscolo = s.segnali.includes('comincia in minuscolo');      // una frase che continua dalla pagina prima
      const d = dataDi(i), cambiaData = !!sezione && PER_ESAME.has(sezione.numero) && !!d && !!corrente.data && d !== corrente.data && !tutteLeDate(testi[i]).has(corrente.data);
      const f = F[i], haInizio = !minuscolo && (f.titolo || f.destra >= 2 || perRegole || cambiaData);
      if (!chiusaPrima && !haInizio) { nuovo = false; sicurezza = 'alta'; segnali = [...s.segnali, 'la pagina prima non chiude']; }
      else if (ripetuta) { nuovo = false; sicurezza = 'alta'; segnali = [...s.segnali, 'stessa testata e stessa data']; }
      else if (chiusaPrima && haInizio) { nuovo = true; sicurezza = !r || r.nuovo ? 'alta' : 'media'; segnali = [...s.segnali, 'la pagina prima chiude', ...(f.titolo ? ['titolo in alto'] : []), ...(f.destra >= 2 ? ['blocco in alto a destra'] : [])]; }
      else if (r) { nuovo = r.nuovo; sicurezza = 'media'; segnali = [...s.segnali, chiusaPrima ? 'la pagina prima chiude' : 'la pagina prima non chiude', r.nuovo ? 'il modello: documento nuovo' : 'il modello: continua']; }
      else { nuovo = (perRegole || cambiaData) && !minuscolo; sicurezza = 'media'; }      // senza il modello, nei casi incerti decidono i punti delle regole
    }
    if (!s.vuota) chiusaPrima = F[i].chiusa;
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
