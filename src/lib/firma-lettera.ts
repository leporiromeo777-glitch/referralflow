// La firma in fondo alla lettera (20.10.2026, richiesta dello studio: «la firma del medico sempre completa, Dr. med. …,
// e sempre in grassetto; la frase tra parentesi sotto il nome più piccola, 9 su Word»). PURO.
//
// Dopo il saluto finale («Cordiali saluti,») vengono le righe della firma. Una riga che è il nome del medico scritto
// corto («Marco», «Moccetti», «Dr. Moccetti», «Marco Moccetti») diventa il nome completo del profilo
// («Dr. med. Marco Moccetti»), in grassetto; una riga tutta tra parentesi («(partito dopo dettatura)») va a 9 punti.
// «Copia:» e «Allegato:» chiudono la firma: lì non si tocca niente. Senza saluto finale non si tocca niente.
import { B, vociDai, type Voce } from './formattazione';

const SALUTO_FINALE = /^(cordiali|cari|distinti|i migliori|con i migliori|un caro|saluti|con stima|ti saluto|vi saluto|un cordiale)\b/i;
const TITOLI = new Set(['dr', 'dott', 'dottor', 'dottore', 'dssa', 'drssa', 'ssa', 'med', 'prof', 'pd', 'fmh']);
const PICCOLO = 9;

const parole = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w && !TITOLI.has(w));

// Una riga è il nome del medico se le sue parole (tolti i titoli) sono parole del suo nome.
export function eNomeDelMedico(riga: string, nomeCompleto: string): boolean {
  const r = riga.trim();
  if (!r || /\d/.test(r) || r.length > 60) return false;
  const mie = parole(r), sue = new Set(parole(nomeCompleto));
  return mie.length > 0 && mie.length <= 4 && mie.every((w) => sue.has(w));
}

export function firmaDellaLettera(testo: string, nomeCompleto: string): { testo: string; voci: Voce[] } {
  const nome = (nomeCompleto ?? '').trim();
  const righe = String(testo ?? '').replace(/\r\n/g, '\n').split('\n');
  let iSaluto = -1;
  righe.forEach((r, k) => { if (SALUTO_FINALE.test(r.trim()) && r.trim().length < 80) iSaluto = k; });
  if (iSaluto < 0) return { testo: String(testo ?? ''), voci: [] };
  const segnati: { k: number; v: number }[] = [];
  for (let k = iSaluto + 1; k < righe.length; k++) {
    const r = righe[k].trim();
    if (/^(copia|allegat|cc\b|c\.c\.)/i.test(r)) break;
    if (/^\(.*\)[.,]?$/.test(r)) { segnati.push({ k, v: PICCOLO << 3 }); continue; }
    if (nome && eNomeDelMedico(r, nome)) { righe[k] = nome; segnati.push({ k, v: B }); }
  }
  const nuovo = righe.join('\n');
  if (!segnati.length) return { testo: nuovo, voci: [] };
  const segni = new Uint16Array(nuovo.length);
  let inizio = 0;
  righe.forEach((r, k) => { const s = segnati.find((x) => x.k === k); if (s) segni.fill(s.v, inizio, inizio + r.length); inizio += r.length + 1; });
  return { testo: nuovo, voci: vociDai(nuovo, segni) };
}
