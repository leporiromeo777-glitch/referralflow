import 'server-only';
import { configurazioneOllama, generaOllamaEsito, ollamaAttivo } from '../ollama';
import { dettaglio } from './archivio';

// L'assistente del monitoraggio (6.10.2026). Riassume, non decide.
//
// 1. I FATTI li calcola il codice, dai dati archiviati: per ogni parametro
//    quante misure, minimo, massimo, media, com'è cambiata fra l'inizio e la
//    fine dell'intervallo, quanta parte dell'intervallo è coperta, dove ci
//    sono buchi, la qualità; poi gli avvisi e chi li ha gestiti.
// 2. Il TESTO lo scrive il modello locale dello studio (Ollama: niente esce
//    dal Mac) a partire dai soli fatti. Se cita un numero che nei fatti non
//    c'è, o usa parole da diagnosi o terapia, la sua risposta si scarta.
// 3. Se il modello non c'è, risponde un modello FISSO (frasi composte dal
//    codice) e lo si dice: non si finge un'elaborazione AI.
// Il tracciato ECG non passa di qui: un modello di linguaggio generico non lo
// legge. L'assistente non apre, non chiude e non modifica niente.

const ora = (d: Date | string | null | undefined) => (d ? new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—');
const giorno = (d: Date | string) => new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit' }).format(new Date(d));
const n1 = (v: number, dec = 0) => v.toFixed(dec).replace('.', ',');

export type Fatti = {
  periodo: { da: string; a: string; minuti: number };
  parametri: { codice: string; nome: string; unita: string; modo: string; misure: number; minimo: number; massimo: number; media: number; inizio: number | null; fine: number | null; variazione: number | null; copertura_pct: number; buchi: { da: string; a: string; minuti: number }[]; qualita: number | null; recuperati: boolean }[];
  senza_dati: string[];
  categorie: { nome: string; valori: Record<string, number>; fonte: string | null }[];
  avvisi: { id: string; nome: string; categoria: string; livello: number | null; stato: string; generato: string; rientrato: string | null; chiuso: string | null; responsabile: string | null; azioni: string[] }[];
  dispositivi: { modello: string; connesso: boolean; batteria: number | null }[];
  limiti: string[];
};

export function calcolaFatti(d: NonNullable<Awaited<ReturnType<typeof dettaglio>>>): Fatti {
  const da = new Date(d.intervallo.da).getTime(), a = new Date(d.intervallo.a).getTime();
  const limiti: string[] = [], senza: string[] = [];
  const parametri: Fatti['parametri'] = [];
  for (const s of d.serie) {
    const p = s.punti as number[][];
    if (!p.length) { senza.push(s.nome); continue; }
    const v = p.map((x) => x[1]);
    const terzo = Math.max(1, Math.floor(p.length / 3));
    const med = (x: number[]) => x.reduce((t, y) => t + y, 0) / x.length;
    const passo = Math.max(s.passo_s, s.intervallo_s) * 1000;
    const buchi: Fatti['parametri'][number]['buchi'] = [];
    let coperti = 0;
    for (let i = 0; i < p.length; i++) {
      coperti += passo;
      const prima = i ? p[i - 1][0] : da - passo;
      if (p[i][0] - prima > passo * 2.5 && s.modo === 'continuo') buchi.push({ da: ora(new Date(prima + passo)), a: ora(new Date(p[i][0])), minuti: Math.round((p[i][0] - prima - passo) / 60_000) });
    }
    if (a - p[p.length - 1][0] > passo * 2.5 && s.modo === 'continuo') buchi.push({ da: ora(new Date(p[p.length - 1][0] + passo)), a: ora(new Date(a)), minuti: Math.round((a - p[p.length - 1][0] - passo) / 60_000) });
    const q = p.map((x) => x[4]).filter((x): x is number => x != null);
    const inizio = p.length >= 3 ? med(v.slice(0, terzo)) : null, fine = p.length >= 3 ? med(v.slice(-terzo)) : null;
    parametri.push({
      codice: s.codice, nome: s.nome, unita: s.unita, modo: s.modo, misure: p.reduce((t, x) => t + (x[6] ?? 1), 0),
      minimo: Math.min(...p.map((x) => x[2])), massimo: Math.max(...p.map((x) => x[3])), media: Math.round(med(v) * 10) / 10,
      inizio: inizio == null ? null : Math.round(inizio * 10) / 10, fine: fine == null ? null : Math.round(fine * 10) / 10,
      variazione: inizio == null || fine == null ? null : Math.round((fine - inizio) * 10) / 10,
      copertura_pct: Math.min(100, Math.round((coperti / Math.max(1, a - da)) * 100)), buchi: buchi.slice(0, 6), qualita: q.length ? Math.round(med(q)) : null, recuperati: p.some((x) => x[5] === 1),
    });
    const ult = parametri[parametri.length - 1];
    if (s.modo === 'continuo' && ult.copertura_pct < 80) limiti.push(`${s.nome}: dati per il ${ult.copertura_pct}% dell'intervallo.`);
    if (s.modo === 'intermittente') limiti.push(`${s.nome}: misura a intervalli (ogni ${Math.round(s.intervallo_s / 60)} min), non un monitoraggio continuo.`);
    if (ult.qualita != null && ult.qualita < 50) limiti.push(`${s.nome}: qualità media del segnale ${ult.qualita} su 100.`);
    if (ult.recuperati) limiti.push(`${s.nome}: una parte dei dati è arrivata dopo, alla riconnessione del dispositivo.`);
  }
  if (senza.length) limiti.push(`Nessuna misura nell'intervallo per: ${senza.join(', ')}.`);
  const cat = new Map<string, { nome: string; valori: Record<string, number>; fonte: string | null }>();
  for (const c of d.categorie) { const x = cat.get(c.parametro) ?? { nome: c.nome, valori: {}, fonte: c.fonte }; x.valori[c.testo] = (x.valori[c.testo] ?? 0) + 1; cat.set(c.parametro, x); }
  const avvisi = d.avvisi.filter((x: any) => new Date(x.generato_il).getTime() <= a && (x.stato !== 'chiuso' || new Date(x.chiuso_il).getTime() >= da)).map((x: any) => ({
    id: x.id, nome: x.nome, categoria: x.categoria, livello: x.livello, stato: x.stato, generato: `${giorno(x.generato_il)} ${ora(x.generato_il)}`, rientrato: x.rientrato_il ? ora(x.rientrato_il) : null, chiuso: x.chiuso_il ? ora(x.chiuso_il) : null,
    responsabile: x.responsabile, azioni: (x.azioni as any[]).filter((z) => !String(z.azione).startsWith('sistema:')).map((z) => `${z.azione.replace(/_/g, ' ')} (${z.chi ?? 'qualcuno'}, ${ora(z.quando)})`),
  }));
  if (d.paziente.programma !== 'attivo') limiti.push(`Il monitoraggio è ${d.paziente.programma === 'terminato' ? 'terminato' : 'in pausa'}: non arrivano dati nuovi.`);
  for (const x of d.dispositivi) if (!x.connesso && d.paziente.programma === 'attivo') limiti.push(`${x.modello}: non collegato.`);
  return { periodo: { da: `${giorno(new Date(da))} ${ora(new Date(da))}`, a: `${giorno(new Date(a))} ${ora(new Date(a))}`, minuti: Math.round((a - da) / 60_000) }, parametri, senza_dati: senza, categorie: [...cat.values()],
    avvisi, dispositivi: d.dispositivi.map((x) => ({ modello: x.modello, connesso: x.connesso, batteria: x.batteria })), limiti };
}

// Il modello FISSO: frasi composte dal codice. È ciò che si legge quando l'AI non c'è.
export function testoFisso(f: Fatti): string {
  const righe: string[] = [`Periodo analizzato: dal ${f.periodo.da} al ${f.periodo.a} (${f.periodo.minuti} minuti).`];
  for (const p of f.parametri) {
    const dec = p.codice.startsWith('temp') ? 1 : 0;
    let r = `${p.nome}: ${p.misure} misure, da ${n1(p.minimo, dec)} a ${n1(p.massimo, dec)} ${p.unita} (media ${n1(p.media, 1)})`;
    if (p.variazione != null && Math.abs(p.variazione) >= (dec ? 0.3 : 3)) r += `; fra l'inizio e la fine dell'intervallo la media è passata da ${n1(p.inizio!, 1)} a ${n1(p.fine!, 1)} ${p.unita}`;
    else if (p.variazione != null) r += '; nessun cambiamento di rilievo fra inizio e fine';
    righe.push(`${r}.`);
  }
  for (const c of f.categorie) righe.push(`${c.nome}: ${Object.entries(c.valori).map(([k, v]) => `${k} in ${v} rilevazioni`).join(', ')}${c.fonte ? ` (fonte: ${c.fonte})` : ''}.`);
  if (f.avvisi.length) righe.push(`Avvisi nel periodo: ${f.avvisi.map((a) => `${a.nome} (${a.categoria === 'tecnico' ? 'tecnico' : `livello ${a.livello}`}, generato ${a.generato}, ${a.stato.replace('_', ' ')}${a.rientrato ? `, parametro rientrato alle ${a.rientrato}` : ''}${a.responsabile ? `, in carico a ${a.responsabile}` : ''})`).join('; ')}.`);
  else righe.push('Nessun avviso generato nel periodo.');
  if (f.limiti.length) righe.push(`Limiti dei dati: ${f.limiti.join(' ')}`);
  return righe.join('\n');
}

const VIETATE = /fuori pericolo|non (?:è|e) in pericolo|stabile|diagnos|si consiglia|consiglio di|somministr|terapia|farmac|prescriv|aritmia|fibrillazione|infarto|emergenza/i;

// La risposta del modello vale solo se non cita numeri che i fatti non hanno e non sconfina.
export function rispostaAmmessa(testo: string, f: Fatti, domanda: string): { ok: true } | { ok: false; motivo: string } {
  if (VIETATE.test(testo)) return { ok: false, motivo: 'usava parole da valutazione clinica o da terapia' };
  const norm = (s: string) => s.replace(',', '.').replace(/\.0+$/, '');
  const noti = new Set((`${JSON.stringify(f)} ${domanda}`.match(/\d+(?:[.,]\d+)?/g) ?? []).map(norm));
  for (const n of testo.match(/\d+(?:[.,]\d+)?/g) ?? []) if (!noti.has(norm(n))) return { ok: false, motivo: 'citava un numero che nei dati non c\'è' };
  return { ok: true };
}

export type Riassunto = {
  testo: string; fonte: 'modello_locale' | 'modello_fisso'; modello: string | null; nota: string | null;
  periodo: Fatti['periodo']; dati_usati: { codice: string; nome: string; misure: number; copertura_pct: number }[];
  collegamenti: { tipo: 'grafico' | 'avviso'; riferimento: string; etichetta: string }[]; limiti: string[]; avvertenza: string;
};

export async function riassumi(studioId: string, pazienteId: string, ruolo: string, c: { da: Date; a: Date; domanda?: string }): Promise<Riassunto | null> {
  const d = await dettaglio(studioId, pazienteId, ruolo, { da: c.da, a: c.a }, c.a);
  if (!d || d.vista_tecnica) return null;
  const f = calcolaFatti(d);
  const domanda = String(c.domanda ?? '').trim().slice(0, 300);
  const comune = {
    periodo: f.periodo, dati_usati: f.parametri.map((p) => ({ codice: p.codice, nome: p.nome, misure: p.misure, copertura_pct: p.copertura_pct })),
    collegamenti: [...f.parametri.filter((p) => p.variazione != null && Math.abs(p.variazione) >= 3).map((p) => ({ tipo: 'grafico' as const, riferimento: p.codice, etichetta: `Grafico: ${p.nome}` })),
      ...f.avvisi.map((a) => ({ tipo: 'avviso' as const, riferimento: a.id, etichetta: `Avviso: ${a.nome} (${a.generato})` }))],
    limiti: f.limiti,
    avvertenza: 'Riassunto automatico di dati SIMULATI: descrive i dati, non è una valutazione clinica e non sostituisce chi cura. Il tracciato ECG non è stato analizzato.',
  };
  const fisso = (nota: string): Riassunto => ({ ...comune, testo: testoFisso(f), fonte: 'modello_fisso', modello: null, nota });
  if (process.env.MONITORAGGIO_AI === 'spenta') return fisso('Assistente AI spento su questo server: riepilogo composto da un modello fisso, senza AI.');
  if (!(await ollamaAttivo())) return fisso('L\'AI locale non risponde: riepilogo composto da un modello fisso, senza AI.');
  const prompt = [
    'Sei l\'assistente del monitoraggio remoto di uno studio medico. Ricevi FATTI già calcolati su dati SIMULATI (demo).',
    'Scrivi in italiano, tono asciutto, al massimo otto frasi, testo semplice senza elenchi né titoli.',
    'Regole: usa SOLO i fatti; ogni numero che scrivi deve comparire nei fatti; cita il periodo analizzato; di\' che cosa è cambiato fra inizio e fine; riassumi gli avvisi e chi li ha gestiti; segnala i limiti dei dati (buchi, misure a intervalli, segnale scarso).',
    'Divieti: niente diagnosi, niente terapie o consigli di trattamento, non dire che il paziente è stabile o fuori pericolo, non interpretare il ritmo o il tracciato ECG, non chiudere né giudicare gli avvisi.',
    domanda ? `DOMANDA di chi cura: ${domanda}\nRispondi alla domanda con i soli fatti; se i fatti non bastano, dillo.` : 'Compito: riassumi l\'andamento nel periodo.',
    `FATTI: ${JSON.stringify(f)}`,
  ].join('\n');
  const r = await generaOllamaEsito(prompt, { timeoutMs: 60_000 });
  if (!r.ok) return fisso('L\'AI locale non ha risposto in tempo: riepilogo composto da un modello fisso, senza AI.');
  const testo = r.testo.trim();
  const esame = rispostaAmmessa(testo, f, domanda);
  if (!testo || !esame.ok) return fisso(`La risposta dell'AI locale è stata scartata (${esame.ok ? 'vuota' : esame.motivo}): riepilogo composto da un modello fisso.`);
  return { ...comune, testo, fonte: 'modello_locale', modello: configurazioneOllama.modello, nota: null };
}
