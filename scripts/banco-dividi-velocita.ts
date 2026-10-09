// Banco di velocità di «Dividi cartella» (9.10.2026): quale modello locale, e con quanto testo per pagina.
// Stessa cartella INVENTATA del banco (scripts/banco-dividi-dati.ts), in due versioni: corta com'è, e LUNGA —
// ogni pagina allungata con frasi inventate fino a ~1900 caratteri, come le pagine fitte di una cartella vera
// (lì il tempo lo fa quasi tutto la lettura della domanda, non la risposta).
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/banco-dividi-velocita.ts [modello …]
// Senza argomenti prova tutti i modelli generativi installati in Ollama. Nessun costo, niente esce. Si ferma se la catena lavora.
import { domanda, leggiRisposta } from '../src/lib/dividi/analisi';
import { catenaOccupata } from '../src/lib/esporta-grezze';
import { configurazioneOllama } from '../src/lib/ollama';
import { TAGLIO, estratti, pagineDaChiedere, type Risposta } from '../src/lib/dividi/sezioni';
import { PAGINE, SEP, misura } from './banco-dividi-dati';

const URL_O = configurazioneOllama.url;
const RIEMPITIVO = ['Il paziente riferisce di svolgere regolarmente una passeggiata quotidiana di circa quaranta minuti in piano senza disturbi.', 'Assume la terapia con regolarita e non riferisce effetti collaterali di rilievo.',
  'Non riferisce edemi declivi, ortopnea o risvegli notturni per mancanza di respiro.', 'Il peso corporeo e rimasto stabile negli ultimi mesi e l appetito e conservato.', 'Non ha avuto episodi di perdita di coscienza ne di vertigine importante.',
  'La pressione misurata a domicilio e in media nella norma secondo il diario che porta con se.', 'Dal punto di vista generale si sente in buone condizioni e mantiene le abituali attivita.'];
// La versione lunga: le frasi inventate entrano DOPO le prime righe e PRIMA delle ultime, così testa e coda restano quelle del documento.
const lunga = (t: string): string => {
  if (!t) return t;
  const r = t.split('\n'), meta = Math.min(r.length - 1, Math.max(1, Math.ceil(r.length / 2)));
  const pieno: string[] = []; for (let k = 0; pieno.join('\n').length + t.length < 1900; k++) pieno.push(RIEMPITIVO[k % RIEMPITIVO.length]);
  return [...r.slice(0, meta), ...pieno, ...r.slice(meta)].join('\n');
};
const CORTE = PAGINE.map((x) => x[0]), LUNGHE = CORTE.map(lunga);

async function scarica(modello: string) { try { await fetch(`${URL_O}/api/generate`, { method: 'POST', body: JSON.stringify({ model: modello, keep_alive: 0 }), signal: AbortSignal.timeout(30_000) }); } catch { /* pazienza */ } }
async function prova(modello: string, testi: string[], taglio: typeof TAGLIO, nota: string) {
  if (await catenaOccupata()) { console.log('La catena dei referti lavora: mi fermo.'); await scarica(modello); process.exit(0); }
  const da = pagineDaChiedere(testi, SEP), risposte: Record<number, Risposta> = {};
  let mute = 0, tokIn = 0, nsIn = 0, tokOut = 0, nsOut = 0;
  // Una chiamata a vuoto per caricare il modello: il caricamento da disco non è la velocità che interessa.
  await fetch(`${URL_O}/api/generate`, { method: 'POST', body: JSON.stringify({ model: modello, prompt: 'ok', stream: false, options: { num_predict: 1 } }), signal: AbortSignal.timeout(600_000) }).catch(() => null);
  const t0 = Date.now();
  for (const n of da) {
    try {
      const r = await fetch(`${URL_O}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300_000),
        body: JSON.stringify({ model: modello, prompt: domanda(estratti(testi, SEP, n, taglio)), stream: false, format: 'json', options: { temperature: 0 } }) });
      const j: any = await r.json();
      tokIn += j.prompt_eval_count ?? 0; nsIn += j.prompt_eval_duration ?? 0; tokOut += j.eval_count ?? 0; nsOut += j.eval_duration ?? 0;
      const x = leggiRisposta(String(j.response ?? '')); if (x) risposte[n] = x; else mute++;
    } catch { mute++; }
  }
  const s = (Date.now() - t0) / 1000 / da.length, c = misura('', risposte, testi, true).conto;
  console.log(`${modello.replace('hf.co/unsloth/', '').padEnd(28)} · ${nota.padEnd(22)} · interi ${String(c.interi).padStart(2)}/${c.daFare} · tagli di troppo ${c.inPiu} · date ${c.dateGiuste}/${c.dateDaTrovare} (sbagliate ${c.dateSbagliate}) · senza risposta ${mute} · ${s.toFixed(1).padStart(5)} s/pagina · domanda ${Math.round(tokIn / da.length)} token a ${nsIn ? Math.round(tokIn / (nsIn / 1e9)) : '?'}/s · risposta ${Math.round(tokOut / da.length)} token a ${nsOut ? Math.round(tokOut / (nsOut / 1e9)) : '?'}/s`);
}

(async () => {
  let modelli = process.argv.slice(2);
  if (!modelli.length) {
    const j: any = await (await fetch(`${URL_O}/api/tags`)).json();
    modelli = (j.models ?? []).filter((m: any) => !/bge|embed/i.test(m.name)).sort((a: any, b: any) => a.size - b.size).map((m: any) => m.name);
  }
  console.log(`modelli: ${modelli.join(', ')}`);
  for (const m of modelli) {
    await prova(m, LUNGHE, TAGLIO, 'pagine lunghe 1300+300');
    if (m === modelli[0]) {      // quanto testo serve: solo sul più veloce
      await prova(m, LUNGHE, { testa: 800, coda: 250, prima: 400 }, 'pagine lunghe 800+250');
      await prova(m, LUNGHE, { testa: 500, coda: 200, prima: 300 }, 'pagine lunghe 500+200');
      await prova(m, CORTE, TAGLIO, 'pagine corte');
    }
    await scarica(m);
  }
})();
