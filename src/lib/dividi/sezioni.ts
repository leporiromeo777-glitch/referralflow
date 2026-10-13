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
import { SEZIONE_APPUNTI, SEZIONE_DEL_GENERE, dataPossibile, daGuardare, genereDaTesto, genereDelDocumento, type Genere } from './generi';
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

// Dal codice del foglio separatore (le ultime due cifre) alla sezione. I fogli della cartella di carta NON sono
// numerati come le sottocartelle che lo studio vuole: fino al 05 coincidono, poi no. Si è visto dai conteggi su una
// cartella vera (13.10.2026, solo quante pagine nominano che cosa): dopo il foglio 07 ci sono tabelle di valori
// (laboratorio), dopo lo 08 procure e dispense dal segreto (amministrativi), dopo lo 09 un intervento, e il foglio 10
// — il primo dopo la copertina — apre le carte varie del paziente. Prima il 07 finiva in «Intervento», lo 08 in
// «Laboratorio» e il 10 in «Documenti amministrativi»: erano le due sottocartelle sbagliate. Un codice che qui non
// c'è vale «numero + 1», come prima.
export const SEZIONE_DEL_CODICE: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 9, 8: 11, 9: 8, 10: 10, 11: 12 };

export type Foglio = { copertina: true } | { copertina: false; numero: number; nome: string };
// Che foglio è, dal codice letto: sei cifre = separatore di sezione (le ultime due); lettere e cifre
// = la copertina col numero del paziente. Un codice che non si riconosce non è un separatore.
export function foglioDelCodice(codice: string): Foglio | null {
  const c = String(codice ?? '').replace(/\s+/g, '').toUpperCase();
  if (/^\d{6}$/.test(c)) {
    const numero = SEZIONE_DEL_CODICE[Number(c.slice(4))] ?? Number(c.slice(4)) + 1;
    return { copertina: false, numero, nome: SEZIONI[numero]?.nome ?? `${String(numero).padStart(2, '0')}_Sezione ${numero}` };
  }
  if (/^[A-Z]{1,3}\d{5,10}$/.test(c)) return { copertina: true };
  return null;
}

export type Risposta = { nuovo: boolean; data: string | null; titolo: string | null };
// Che cosa ha visto il modello GUARDANDO la pagina: se è scritta a mano per gran parte, e la data che ci ha letto.
export type Vista = { mano: boolean; data: string | null };
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
// Le pagine da far GUARDARE al modello (è scritta a mano?): non i fogli separatori, non le bianche, non le pagine
// fitte di testo stampato pulito. `inchiostro` è la parte scura di ogni pagina, in percento (dal lettore dei codici).
// I TRACCIATI (sezione 04) non si guardano: una striscia di ECG con due note a penna resta un ECG, non un appunto.
export function pagineDaGuardare(testi: string[], separatori: Separatore[], inchiostro?: number[] | null): number[] {
  const fogli = new Map(separatori.map((s) => [s.pagina, foglioDelCodice(s.codice)] as const).filter((x) => x[1]));
  const fuori: number[] = [];
  let tracciati = false;
  for (let i = 0; i < testi.length; i++) {
    const f = fogli.get(i + 1);
    if (f) { if (!f.copertina) tracciati = f.numero === 4; continue; }
    if (!tracciati && daGuardare(testi[i], inchiostro ? inchiostro[i] ?? null : null)) fuori.push(i + 1);
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
const NOME_GENERE: Record<Genere, string> = { laboratorio: 'Laboratorio', amministrativo: 'Documento amministrativo', ricetta: 'Piano di medicazione' };
export function componi(testi: string[], separatori: Separatore[], risposte: Record<number, Risposta>, paziente: string, forme?: Forma[], viste: Record<number, Vista> = {}): PezzoSezione[] {
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
  let correnteMano = false;             // il documento in corso è fatto di pagine scritte a mano
  let correnteGenere: Genere | null = null;      // il genere della prima pagina del documento in corso
  const mano = (i: number) => viste[i + 1]?.mano === true && sezione?.numero !== 4;      // nei tracciati la penna non fa un appunto
  const dataDi = (i: number): string | null => {
    const r = risposte[i + 1];
    const delModello = r?.data ? dataIn(r.data) : null;
    const dalTesto = delModello && tutteLeDate(testi[i]).has(delModello) ? delModello : dataDelDocumento(testi[i]);
    // Una pagina scritta a mano: la data che l'OCR non legge può averla letta il modello guardandola.
    return dalTesto ?? (mano(i) ? dataPossibile(viste[i + 1]?.data) : null);
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
    // Le pagine scritte a mano sono tutte APPUNTI (lo studio, 13.10.2026), in qualunque sezione stiano: non sono mai
    // «pagine vuote» anche se l'OCR non ci ha letto niente, e fanno documenti a sé, uno per giorno.
    const aMano = mano(i), fisica = sezione;
    const qui: { numero: number; nome: string } | null = aMano ? { numero: SEZIONE_APPUNTI, nome: SEZIONI[SEZIONE_APPUNTI].nome } : fisica;
    const s = senzaTesto || aMano ? { ...s0, vuota: false } : s0;
    const gPagina = aMano ? null : genereDaTesto(testi[i]), titolato = gPagina && gPagina !== 'laboratorio' ? gPagina : null;
    const catRegola = tipoDelDocumento(testi[i]), dataRegola = dataDelDocumento(testi[i]);
    if (!s.vuota) ultimaPiena = testi[i];
    const ripetuta = !!regola && s.segnali.every((x) => x.startsWith('titolo') || x === 'data in cima') && regola.categoria === catRegola && regola.data === dataRegola && catRegola !== 'altro';
    const perRegole = s.punti >= SOGLIA && !ripetuta;
    let nuovo: boolean, sicurezza: Pezzo['sicurezza'], segnali = s.segnali;
    if (!corrente || apre) { nuovo = true; sicurezza = 'alta'; segnali = [i === 0 ? 'prima pagina' : sezione ? 'dopo il separatore' : 'prima pagina', ...s.segnali]; }
    else if (s.vuota && !aMano) { nuovo = false; sicurezza = 'alta'; }      // il retro bianco resta col foglio prima, anche se quello è scritto a mano
    // Dalla stampa alla penna, o dalla penna alla stampa: comincia un documento (un appunto non continua una lettera).
    else if (aMano !== correnteMano) { nuovo = true; sicurezza = 'media'; segnali = [...s.segnali, aMano ? 'scritta a mano' : 'dopo le pagine scritte a mano']; }
    else if (senzaTesto || (!aMano && seguito(s.segnali))) { nuovo = false; sicurezza = 'alta'; }
    // Un titolo in cima che dice «procura», «dispensa», «piano di medicazione», «ricetta» apre un documento: è un'altra
    // cosa rispetto a quello in corso, anche se la pagina prima non «chiude» col nome di un medico.
    else if (!aMano && titolato && titolato !== correnteGenere) { nuovo = true; sicurezza = 'media'; segnali = [...s.segnali, `titolo in cima: ${NOME_GENERE[titolato].toLowerCase()}`]; }
    else if (s.segnali.includes('pagina 1 di N')) { nuovo = true; sicurezza = 'alta'; }
    else if (qui && PER_GIORNO.has(qui.numero)) {
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
    const sez = qui ? SEZIONI[qui.numero] : undefined;
    const spostataAMano = aMano && fisica?.numero !== SEZIONE_APPUNTI;      // scritta a mano, ma nella cartella di carta stava altrove
    const categoria: Tipo = sez?.tipo ?? tipoDaTitolo(descrModello) ?? (catRegola !== 'altro' ? catRegola : 'altro');
    const data = dataDi(i);
    // Di una pagina a penna il titolo detto dal modello viene da un testo che l'OCR ha letto male: si chiama «Appunti».
    const descrizione = aMano ? SEZIONI[SEZIONE_APPUNTI].voce : descrModello || (catRegola !== 'altro' && !sez?.tipo ? ETICHETTE[catRegola] : sez?.voce ?? ETICHETTE[categoria]);
    if (aMano && !segnali.includes('scritta a mano')) segnali = [...segnali, 'scritta a mano'];
    if (spostataAMano) { segnali = [...segnali, `era in «${fisica?.nome ?? 'nessuna sezione'}»`]; sicurezza = 'media'; }
    corrente = { da: i + 1, a: i + 1, categoria, data, titolo: s.vuota ? 'Pagina bianca' : nomeDocumento(data, paziente, descrizione), descrizione: s.vuota ? '' : descrizione, sicurezza, segnali, cartella: qui?.nome ?? null, escluso: s.vuota, foglio: null };
    correnteMano = aMano; correnteGenere = gPagina;
    pezzi.push(corrente);
    regola = { categoria: catRegola, data: dataRegola };
    apre = s.vuota;                       // il retro bianco del foglio separatore resta fuori, e il documento comincia dopo
  }
  // Senza testo da nessuna parte (scansione non ancora letta): un pezzo per sezione, e lo si dice.
  if (senzaTesto && testi.length > 1) for (const p of pezzi) if (!p.foglio) p.sicurezza = 'bassa';
  // IL CONTENUTO DECIDE LA SOTTOCARTELLA (lo studio, 13.10.2026): un documento fatto di valori di laboratorio va in
  // «Laboratorio», una procura o una dispensa fra i «Documenti amministrativi», un piano di medicazione sotto
  // «Ricette» — in qualunque sezione della carta fosse. Gli appunti a mano e i tracciati non si toccano.
  for (const p of pezzi) {
    if (p.foglio || p.escluso || p.segnali.includes('scritta a mano') || p.cartella === SEZIONI[4].nome) continue;
    const g = genereDelDocumento(testi.slice(p.da - 1, p.a));
    if (!g) continue;
    const dove = SEZIONI[SEZIONE_DEL_GENERE[g]];
    if (p.cartella === dove.nome) continue;
    p.segnali = [...p.segnali, `per contenuto: ${NOME_GENERE[g].toLowerCase()}`, `era in «${p.cartella ?? 'nessuna sezione'}»`];
    // il nome: quello che c'era se diceva già che cos'è; se era la voce generica della sezione di prima, quella del genere
    const generica = Object.values(SEZIONI).some((x) => x.voce === p.descrizione) || !p.descrizione;
    if (generica) p.descrizione = NOME_GENERE[g];
    p.cartella = dove.nome; p.categoria = g === 'laboratorio' ? 'laboratorio' : p.categoria === 'laboratorio' ? 'altro' : p.categoria; p.sicurezza = p.sicurezza === 'alta' ? 'media' : p.sicurezza;
    p.titolo = nomeDocumento(p.data, paziente, p.descrizione);
  }
  return pezzi;
}
