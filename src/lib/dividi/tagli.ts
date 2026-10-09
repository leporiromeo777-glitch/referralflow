// Dividere una cartella completa nei suoi documenti (9.10.2026, [[Piattaforma/Dividi cartella]]). PURO.
//
// Una cartella cartacea scansionata, o esportata da un altro programma, arriva
// come UN PDF con dentro lettere, referti, esami di laboratorio, ECG… Qui, dal
// testo di ogni pagina, si PROPONE dove comincia ogni documento, che tipo è e
// che data porta. È una proposta: la conferma una persona guardando le pagine,
// perché una regola che taglia male divide una lettera in due o ne incolla due.
//
// Regole e non un modello: si misurano, sono uguali a ogni giro, e il testo
// clinico non va da nessuna parte. Segnali di INIZIO (un saluto, «Luogo, data»,
// un titolo di documento, «pagina 1 di N», un oggetto, la pagina prima che
// chiude coi saluti) e di SEGUITO («pagina 2 di N», una pagina quasi vuota —
// il retro di un foglio —, una riga che comincia in minuscolo).

export const TIPI = ['referto', 'ecg', 'imaging', 'lettera', 'consenso', 'laboratorio', 'dimissione', 'holter', 'ett', 'ciclo', 'altro'] as const;
export type Tipo = (typeof TIPI)[number];
export const ETICHETTE: Record<Tipo, string> = {
  referto: 'Referto', ecg: 'ECG', imaging: 'Imaging', lettera: 'Lettera', consenso: 'Consenso', laboratorio: 'Laboratorio',
  dimissione: 'Lettera di dimissione', holter: 'Holter', ett: 'Ecocardiogramma', ciclo: 'Prova da sforzo', altro: 'Documento',
};
export type Pezzo = { da: number; a: number; categoria: Tipo; data: string | null; titolo: string; sicurezza: 'alta' | 'media' | 'bassa'; segnali: string[] };

export const SOGLIA = 3;
const righeDi = (t: string): string[] => String(t ?? '').split(/\r?\n/).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);

const SALUTO = /^(egregi[oa]|gentil(?:e|issim[oa])|car[oa]|carissim[oa]|stimat[oa]|spettabile|sehr geehrte[rs]?|liebe[rs]?|ch[eè]re?|dear)\b/i;
const CHIUSURA = /(cordiali saluti|distinti saluti|migliori saluti|cari saluti|un cordiale saluto|collegiali saluti|freundliche[nm]? gr[uü](?:ss|ß)e?n?|meilleures salutations|salutations distingu[ée]es|kind regards|best regards)/i;
const OGGETTO = /^(concerne|oggetto|betrifft|betreff|objet|concerning)\s*:/i;
const MESI: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  januar: 1, februar: 2, 'märz': 3, maerz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, juin: 6, juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre_fr: 11, 'décembre': 12, decembre: 12,
  april: 4, august: 8, september: 9, november: 11,
};
const DATA_NUM = /(\d{1,2})\s?[./]\s?(\d{1,2})\s?[./]\s?(\d{4}|\d{2})\b/;
const DATA_MESE = /(\d{1,2})\.?\s+([A-Za-zÀ-ÿ]{3,10})\s+(\d{4})\b/;
const LUOGO_DATA = new RegExp(`^[A-ZÀ-Ý][A-Za-zÀ-ÿ' .-]{2,30},\\s*(?:il\\s+|l[ìi]\\s+|den\\s+|le\\s+)?(?:${DATA_NUM.source}|${DATA_MESE.source})\\s*\\.?$`);
const NUMERO_PAGINA = /(?:\b(?:pagina|pag\.?|seite|page|p\.)\s*|^\s*)(\d{1,3})\s*(?:di|von|de|of|\/)\s*(\d{1,3})\b/i;
const NASCITA = /(nat[oa]\b|n\.\s|nascita|geb\.|geboren|geburtsdatum|n[ée]e?\s+le|\*\s?$)/i;

// I titoli che di solito stanno in cima a un documento, col tipo che dicono.
const TITOLI: [RegExp, Tipo][] = [
  [/lettera di dimissione|rapporto d[’' ]uscita|lettera d[’' ]uscita|austrittsbericht|lettre de sortie|discharge (?:letter|summary)/i, 'dimissione'],
  [/consenso informato|dichiarazione di consenso|einverst[aä]ndniserkl[aä]rung|consentement/i, 'consenso'],
  [/laboratorio|laborbefund|laborwerte|risultati di laboratorio|chimica clinica|ematologia|emocromo/i, 'laboratorio'],
  [/holter/i, 'holter'],
  [/ergometria|test da sforzo|prova da sforzo|cicloergometr|belastungs-?ekg|ergometrie|[ée]preuve d[’']effort/i, 'ciclo'],
  [/ecocardiogra|echokardiogra|[ée]chocardiogra|ecocolordoppler cardiaco|transtoracic|transesofage/i, 'ett'],
  [/elettrocardiogramma|\becg\b|\bekg\b/i, 'ecg'],
  [/radiografia|risonanza|\btac\b|tomografia|scintigrafia|coronarografia|angiografia|r[oö]ntgen|\bmri\b|\bmrt\b|\bct\b/i, 'imaging'],
  [/referto|rapporto|bericht|consulto|consilium|visita cardiologica|rapport/i, 'referto'],
];

function giornoIso(g: number, m: number, a: number): string | null {
  if (a < 100) a += a < 50 ? 2000 : 1900;
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || g < 1 || g > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCMonth() === m - 1 && d.getUTCDate() === g ? `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}` : null;
}
export function dataIn(riga: string): string | null {
  let m = DATA_NUM.exec(riga);
  if (m) { const d = giornoIso(+m[1], +m[2], +m[3]); if (d) return d; }
  m = DATA_MESE.exec(riga);
  if (m) { const mese = MESI[m[2].toLowerCase()]; if (mese) return giornoIso(+m[1], mese, +m[3]); }
  return null;
}
// Tutte le date scritte in una pagina: serve a controllare che una data proposta dal modello ci sia davvero.
export function tutteLeDate(testo: string): Set<string> {
  const fuori = new Set<string>(), t = String(testo ?? '');
  for (const m of t.matchAll(new RegExp(DATA_NUM.source, 'g'))) { const d = giornoIso(+m[1], +m[2], +m[3]); if (d) fuori.add(d); }
  for (const m of t.matchAll(new RegExp(DATA_MESE.source, 'g'))) { const mese = MESI[m[2].toLowerCase()]; const d = mese ? giornoIso(+m[1], mese, +m[3]) : null; if (d) fuori.add(d); }
  return fuori;
}
// Il tipo che dice un titolo breve («Holter», «EcoTT», «Dimissione Ospedale…»), o null.
export function tipoDaTitolo(titolo: string): Tipo | null {
  const t = String(titolo ?? '');
  if (/eco\s?tt|eco|ete|ett/i.test(t)) return 'ett';
  if (/dimissione|degenza|ricovero/i.test(t)) return 'dimissione';
  if (/^lettera/i.test(t)) return 'lettera';
  for (const [re, tp] of TITOLI) if (re.test(t)) return tp;
  return null;
}
// La data del documento: quella di «Luogo, data» se c'è; se no la prima in cima che non sia una data di nascita.
export function dataDelDocumento(testo: string): string | null {
  const r = righeDi(testo).slice(0, 25);
  for (const x of r) if (LUOGO_DATA.test(x)) { const d = dataIn(x); if (d) return d; }
  for (const x of r) { if (NASCITA.test(x)) continue; const d = dataIn(x); if (d) return d; }
  return null;
}
export function tipoDelDocumento(testo: string): Tipo {
  const r = righeDi(testo);
  const cima = r.slice(0, 10).join('\n');
  for (const [re, t] of TITOLI) if (t !== 'referto' && re.test(cima)) return t;
  if (r.slice(0, 20).some((x) => SALUTO.test(x))) return 'lettera';
  if (TITOLI[TITOLI.length - 1][0].test(cima)) return 'referto';
  return 'altro';
}

export type Segnali = { punti: number; segnali: string[]; vuota: boolean };
// Quanto questa pagina sembra la PRIMA di un documento (prima = il testo della pagina precedente, o null).
export function inizio(testo: string, prima: string | null): Segnali {
  const r = righeDi(testo);
  const lettere = r.join('').replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  if (lettere < 40) return { punti: -5, segnali: ['pagina quasi vuota'], vuota: true };
  let punti = 0; const segnali: string[] = [];
  const cima = r.slice(0, 18);
  const np = cima.concat(r.slice(-4)).map((x) => NUMERO_PAGINA.exec(x)).find((m) => m && +m[2] >= +m[1] && +m[2] > 1);
  if (np) { if (+np[1] === 1) { punti += 4; segnali.push('pagina 1 di N'); } else { punti -= 6; segnali.push(`pagina ${+np[1]} di N`); } }
  if (cima.some((x) => SALUTO.test(x))) { punti += 3; segnali.push('saluto'); }
  if (cima.slice(0, 16).some((x) => LUOGO_DATA.test(x))) { punti += 3; segnali.push('luogo e data'); }
  // Un titolo d'esame nelle prime tre righe pesa di più di una parola come «referto» trovata un po' più giù.
  if (TITOLI.some(([re, tp]) => tp !== 'referto' && re.test(r.slice(0, 3).join('\n')))) { punti += 3; segnali.push('titolo in cima'); }
  else if (TITOLI.some(([re]) => re.test(r.slice(0, 8).join('\n')))) { punti += 2; segnali.push('titolo'); }
  if (r.slice(0, 6).some((x) => !NASCITA.test(x) && dataIn(x))) { punti += 1; segnali.push('data in cima'); }
  if (r.slice(0, 20).some((x) => OGGETTO.test(x))) { punti += 2; segnali.push('oggetto'); }
  if (prima !== null && CHIUSURA.test(righeDi(prima).slice(-14).join('\n'))) { punti += 2; segnali.push('la pagina prima chiude coi saluti'); }
  if (/^[a-zà-ÿ]/.test(r[0] ?? '')) { punti -= 2; segnali.push('comincia in minuscolo'); }
  return { punti, segnali, vuota: false };
}

// Di chi è la cartella (9.10.2026): quando il PDF si trascina PRIMA di aver scelto il paziente — perché in
// piattaforma non c'è ancora — nome e data di nascita si leggono dalle righe «Concerne: Signora …, nata il …»,
// «Paziente: …», «Data di nascita: …» delle prime pagine. Una cartella ripete il suo paziente su molti fogli:
// vince il nome scritto più volte. È una proposta per riempire il modulo: la conferma chi crea la cartella.
const TITOLO_PERSONA = /^(?:(?:sig(?:nor[ae]?|\.ra|\.na|\.)|herrn?|frau|madame|mme|monsieur|m\.|mr\.?|mrs\.?)\s+)/i;
const CHI = /^(?:concerne|oggetto|betrifft|betreff|objet|paziente|patient(?:in|e)?|nome e cognome|cognome e nome|nome|name)\s*:\s*(.+)$/i;
const PAROLA_NOME = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*$/;
const NATO = new RegExp(`(?:nat[oa]\\s+il|data di nascita\\s*:?|geb(?:oren|\\.)?(?:\\s+am)?|geburtsdatum\\s*:?|n[ée]e?\\s+le|\\*)\\s*(${DATA_NUM.source}|${DATA_MESE.source})`, 'i');
export function leggiPaziente(pagine: string[]): { nome: string; nascita: string | null } | null {
  const nomi = new Map<string, { scritto: string; n: number }>(), nascite = new Map<string, number>();
  for (const pagina of pagine.slice(0, 15)) {
    for (const riga of righeDi(pagina).slice(0, 40)) {
      const nt = NATO.exec(riga);
      if (nt) { const d = dataIn(nt[1]); if (d) nascite.set(d, (nascite.get(d) ?? 0) + 1); }
      const m = CHI.exec(riga);
      if (!m) continue;
      // Il nome: le parole con la maiuscola che seguono, fino alla virgola, a «nata il», a una cifra.
      const parole: string[] = [];
      for (const w of m[1].replace(TITOLO_PERSONA, '').split(/[\s]+/)) {
        const pulita = w.replace(/[,;.]+$/, '');
        if (!PAROLA_NOME.test(pulita) || /^(nat[oa]|geb|n[ée]e?)$/i.test(pulita)) break;
        parole.push(pulita);
        if (/[,;]$/.test(w) || parole.length === 4) break;
      }
      if (parole.length < 2) continue;
      const scritto = parole.join(' '), k = scritto.toLowerCase();
      nomi.set(k, { scritto, n: (nomi.get(k)?.n ?? 0) + 1 });
    }
  }
  // Il foglio di copertina di una cartella cartacea: «Cognome: …» e «Nome: …» su due righe.
  if (!nomi.size) {
    const r = righeDi(pagine[0] ?? '').slice(0, 20);
    const dopo = (re: RegExp) => { const x = r.map((y) => re.exec(y)).find(Boolean); return x ? x[1].split(/\s+/).filter((w) => /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*$/.test(w)).slice(0, 3).join(' ') : ''; };
    const cognome = dopo(/^cognome\s*:\s*(.+)$/i), nome = dopo(/^nome\s*:\s*(.+)$/i);
    if (cognome && nome) nomi.set(`${cognome} ${nome}`.toLowerCase(), { scritto: `${cognome} ${nome}`, n: 1 });
  }
  const piu = <T,>(voci: [T, number][]): T | null => (voci.length ? voci.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null);
  const nome = piu([...nomi.values()].map((v) => [v.scritto, v.n] as [string, number]));
  return nome ? { nome, nascita: piu([...nascite.entries()]) } : null;
}

// La proposta: i pezzi, in ordine, che coprono tutte le pagine.
export function proponi(pagine: string[]): Pezzo[] {
  const pezzi: Pezzo[] = [];
  let ultimaPiena: string | null = null;      // i saluti stanno sull'ultima pagina SCRITTA: in mezzo può esserci il retro bianco del foglio
  for (let i = 0; i < pagine.length; i++) {
    const s = i === 0 ? { ...inizio(pagine[0], null), punti: 99 } : inizio(pagine[i], ultimaPiena);
    if (!s.vuota) ultimaPiena = pagine[i];
    const categoria = tipoDelDocumento(pagine[i]), data = dataDelDocumento(pagine[i]);
    // La stessa testata ripetuta (un laboratorio di tre fogli la porta su ognuno): stesso tipo e stessa data
    // del pezzo in corso, e nessun altro segnale che il titolo → è il seguito, non un documento nuovo.
    const ripetuta = i > 0 && pezzi.length > 0 && s.segnali.every((x) => x.startsWith('titolo') || x === 'data in cima')
      && pezzi[pezzi.length - 1].categoria === categoria && pezzi[pezzi.length - 1].data === data && categoria !== 'altro';
    if (i === 0 || (s.punti >= SOGLIA && !ripetuta)) {
      pezzi.push({ da: i + 1, a: i + 1, categoria, data, titolo: titoloDi(categoria, data), sicurezza: i === 0 || s.punti >= 5 ? 'alta' : 'media', segnali: i === 0 ? ['prima pagina'] : s.segnali });
    } else pezzi[pezzi.length - 1].a = i + 1;
  }
  // Un PDF senza testo (scansione non ancora letta) è un pezzo solo, e lo si dice: lì i tagli li mette la persona.
  if (pezzi.length === 1 && pagine.length > 1 && pagine.every((p) => inizio(p, null).vuota)) pezzi[0].sicurezza = 'bassa';
  return pezzi;
}
export function titoloDi(categoria: Tipo, data: string | null): string {
  return `${ETICHETTE[categoria]}${data ? ` ${data.slice(8, 10)}.${data.slice(5, 7)}.${data.slice(0, 4)}` : ''}`;
}

// Ciò che la persona ha confermato: intervalli in ordine, senza sovrapposizioni, dentro il documento.
// Non devono coprire tutto: una pagina bianca si può lasciare fuori.
export type PezzoScelto = { da: number; a: number; categoria: Tipo; titolo: string; data: string | null; cartella: string | null };
export function controllaPezzi(grezzi: unknown, totale: number): { pezzi: PezzoScelto[] } | { errore: string } {
  if (!Array.isArray(grezzi) || !grezzi.length) return { errore: 'Nessun documento da creare.' };
  if (grezzi.length > 300) return { errore: 'Troppi documenti in una volta: al massimo 300.' };
  const pezzi: PezzoScelto[] = []; let fine = 0;
  for (const g of grezzi as Record<string, unknown>[]) {
    const da = Number(g?.da), a = Number(g?.a);
    if (!Number.isInteger(da) || !Number.isInteger(a) || da < 1 || a < da || a > totale) return { errore: `Pagine non valide (${String(g?.da)}–${String(g?.a)}): il documento ne ha ${totale}.` };
    if (da <= fine) return { errore: `Le pagine ${da}–${a} si sovrappongono al documento precedente.` };
    fine = a;
    const categoria = (TIPI as readonly string[]).includes(String(g?.categoria)) ? (g.categoria as Tipo) : 'altro';
    const dg = String(g?.data ?? '').trim();
    const data = /^\d{4}-\d{2}-\d{2}$/.test(dg) ? giornoIso(+dg.slice(8, 10), +dg.slice(5, 7), +dg.slice(0, 4)) : dataIn(dg);
    const titolo = String(g?.titolo ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || titoloDi(categoria, data);
    const cartella = String(g?.cartella ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
    pezzi.push({ da, a, categoria, titolo, data, cartella });
  }
  return { pezzi };
}
// Quanti tagli proposti sono rimasti com'erano: è la misura di quanto la proposta serve.
export function confronta(proposti: [number, number][], scelti: { da: number; a: number }[]): { proposti: number; scelti: number; uguali: number } {
  const chiavi = new Set(proposti.map(([a, b]) => `${a}-${b}`));
  return { proposti: proposti.length, scelti: scelti.length, uguali: scelti.filter((p) => chiavi.has(`${p.da}-${p.a}`)).length };
}
