// Dettatura in tempo reale (Dragon) accanto alla registrazione (11.10.2026, [[Piattaforma/Dittafono]]). PURO.
//
// Il medico detta in una casella mentre la pagina registra. Così di uno stesso dettato ci sono DUE testi
// indipendenti: quello scritto dal programma di dettatura e quello che la catena del Mac ricava dall'audio.
// Qui si mettono a confronto parola per parola: dove coincidono si può stare tranquilli, dove no c'è un punto
// da riascoltare — e le parole della catena portano il loro secondo nell'audio, quindi il punto si ritrova.
// Non decide chi ha ragione: lo decide chi rivede, ascoltando.

export type ParolaTempo = [string, number];
export type Pezzo = { t: string; uguale: boolean; s: number | null; mac?: string };
export type Confronto = { pezzi: Pezzo[]; parole_dettato: number; parole_mac: number; uguali: number; punti: number; troncato: boolean };

const MAX = 3000;      // oltre, il confronto costerebbe troppo: si guarda l'inizio e lo si dice
// Una parola ridotta all'osso per il confronto: minuscola, senza punteggiatura attorno, la virgola dei decimali come punto.
export function osso(parola: string): string {
  return String(parola ?? '').toLowerCase().replace(/[’`´]/g, "'").replace(/(\d),(\d)/g, '$1.$2').replace(/^[^a-zà-ÿ0-9]+|[^a-zà-ÿ0-9%]+$/gi, '');
}
// Le parole di un testo, con la forma scritta (per mostrarla) e l'osso (per confrontarla). I segni da soli non contano.
function parole(testo: string): { scritta: string; osso: string }[] {
  return String(testo ?? '').split(/\s+/).map((scritta) => ({ scritta, osso: osso(scritta) })).filter((p) => p.scritta);
}

export function confronta(dettato: string, mac: ParolaTempo[]): Confronto {
  const tutteA = parole(dettato), tutteB = (Array.isArray(mac) ? mac : []).map(([w, s]) => ({ scritta: String(w), osso: osso(String(w)), s: Number(s) }));
  const troncato = tutteA.length > MAX || tutteB.length > MAX;
  const A = tutteA.slice(0, MAX), B = tutteB.slice(0, MAX);
  // I segni di punteggiatura isolati («,» «.») restano nel testo mostrato ma non entrano nel confronto.
  const ia = A.map((p, i) => (p.osso ? i : -1)).filter((i) => i >= 0), ib = B.map((p, i) => (p.osso ? i : -1)).filter((i) => i >= 0);
  const n = ia.length, m = ib.length;
  // La sottosequenza comune più lunga, con la tabella classica (n e m al massimo 3000).
  const L = new Uint16Array((n + 1) * (m + 1)), W = m + 1;
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i * W + j] = A[ia[i]].osso === B[ib[j]].osso ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const coppia = new Map<number, number>();      // indice in A → indice in B, per le parole che coincidono
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[ia[i]].osso === B[ib[j]].osso) { coppia.set(ia[i], ib[j]); i++; j++; }
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++; else j++;
  }
  // Si ricompone il testo dettato a pezzi: tratti uguali e tratti diversi. A ogni tratto diverso si affianca ciò che ha
  // sentito il Mac nello stesso punto (anche quando Dragon lì non ha scritto niente: una parola saltata) e il secondo
  // dell'audio da cui riascoltare.
  const pezzi: Pezzo[] = [];
  const macFra = (da: number, a: number) => B.slice(da, a).filter((p) => p.osso).map((p) => p.scritta).join(' ');
  let uguali: string[] = [], sUguali: number | null = null, diversi: string[] = [], pb = 0, ultimoS: number | null = null;
  const chiudiUguali = () => { if (uguali.length) pezzi.push({ t: uguali.join(' '), uguale: true, s: sUguali }); uguali = []; sUguali = null; };
  const chiudiDiversi = (finoA: number) => {
    const altro = macFra(pb, finoA);
    if (!diversi.length && !altro) return;
    chiudiUguali();
    const primo = B.slice(pb, finoA).find((x) => x.osso);
    pezzi.push({ t: diversi.join(' '), uguale: false, s: primo ? primo.s : ultimoS, mac: altro });
    diversi = [];
  };
  for (let k = 0; k < A.length; k++) {
    const p = A[k];
    if (!p.osso) { (diversi.length ? diversi : uguali).push(p.scritta); continue; }      // un segno da solo sta col tratto aperto
    const j = coppia.get(k);
    if (j === undefined) { chiudiUguali(); diversi.push(p.scritta); continue; }
    chiudiDiversi(j);
    if (!uguali.length) sUguali = B[j].s;
    uguali.push(p.scritta); pb = j + 1; ultimoS = B[j].s;
  }
  chiudiDiversi(B.length);
  chiudiUguali();
  return { pezzi, parole_dettato: n, parole_mac: m, uguali: coppia.size, punti: pezzi.filter((x) => !x.uguale).length, troncato };
}
