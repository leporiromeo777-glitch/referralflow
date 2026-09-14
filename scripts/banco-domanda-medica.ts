// Banco della «domanda medica»: quale modello risponde meglio.
//
//   npm run banco-domanda-medica
//
// Dieci domande di medicina generale — già nella forma riscritta, quindi
// SENZA dati di nessuno: si possono mandare a qualunque fornitore senza
// rischio. Gira sui modelli dell'account Infomaniak (unico fornitore nella
// lista autorizzata) più il modello locale come riferimento gratuito.
//
// Scrive ~/banco-domanda-medica.md con le risposte MESCOLATE e anonime
// (A, B, C…, ordine diverso per ogni domanda): il medico legge e dà un voto
// senza sapere chi ha scritto cosa. La chiave sta in fondo, da guardare DOPO.
// Nei log solo conteggi, tempi e token.
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RISPOSTA_PROMPT } from '../src/lib/domanda-medica';

const DOMANDE = [
  'Come si aggiusta la dose di apixaban nell’insufficienza renale moderata in fibrillazione atriale?',
  'In caso di sincope ricorrente con ECG normale, è preferibile il loop recorder impiantabile o un Holter di 7 giorni?',
  'Nella stenosi aortica severa asintomatica con frazione di eiezione conservata, quando è indicato l’intervento?',
  'Quali beta-bloccanti sono compatibili con la gravidanza e quali vanno evitati?',
  'Come si inquadra una dispnea da sforzo con BNP elevato e frazione di eiezione conservata?',
  'Dopo quanto tempo dall’impianto di uno stent medicato si può ridurre la doppia antiaggregazione in chi ha alto rischio emorragico?',
  'Quali sono le indicazioni attuali agli inibitori di SGLT2 nello scompenso cardiaco?',
  'Come si distingue una cardiomiopatia ipertrofica da un cuore d’atleta?',
  'Quale soglia di pressione domiciliare definisce l’ipertensione, e come si rapporta a quella misurata in ambulatorio?',
  'In quali casi va cercata un’amiloidosi cardiaca in chi ha ipertrofia ventricolare sinistra?',
];

type Concorrente = { nome: string; dove: 'infomaniak' | 'locale'; modello: string };
const CONCORRENTI: Concorrente[] = [
  { nome: 'Qwen 3.5 397B', dove: 'infomaniak', modello: 'Qwen/Qwen3.5-397B-A17B-FP8' },
  { nome: 'Kimi K2.6', dove: 'infomaniak', modello: 'moonshotai/Kimi-K2.6' },
  { nome: 'Mistral Small 4 119B', dove: 'infomaniak', modello: 'mistralai/Mistral-Small-4-119B-2603' },
  { nome: 'Apertus 70B (svizzero)', dove: 'infomaniak', modello: 'swiss-ai/Apertus-v1.5-70B' },
  { nome: 'gemma 4 31B (quello di oggi)', dove: 'infomaniak', modello: 'google/gemma-4-31B-it' },
  { nome: 'modello locale sul Mac', dove: 'locale', modello: process.env.PROTOTIPO_LLM || 'gemma3:12b' },
];

function conf(): { url: string; chiave: string } {
  const testo = readFileSync(path.join(os.homedir(), '.referralflow-esterno.conf'), 'utf-8');
  const leggi = (k: string) => testo.split('\n').find((r) => r.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? '';
  return { url: leggi('url'), chiave: leggi('chiave') };
}

type Esito = { testo: string; ms: number; tokenIn: number; tokenOut: number; pensiero: number; errore?: string };

// I modelli di ragionamento (Qwen 3.5, Kimi) mettono il ragionamento in
// `message.reasoning` e la risposta in `content`: se il tetto dei token è
// basso il pensiero se lo mangia tutto e `content` torna vuoto. Serve spazio.
const TETTO_TOKEN = 2500;
function rispostaDa(m: any): { testo: string; pensiero: number } {
  const pensiero = String(m?.reasoning ?? m?.reasoning_content ?? '').length;
  let testo = String(m?.content ?? '').trim();
  // Alcuni modelli chiudono il pensiero dentro <think>…</think> nel contenuto.
  if (/<\/think>/i.test(testo)) testo = testo.split(/<\/think>/i).pop()!.trim();
  return { testo, pensiero };
}

async function chiediInfomaniak(modello: string, domanda: string): Promise<Esito> {
  const { url, chiave } = conf();
  if (!url.startsWith('https://api.infomaniak.com/')) {
    return { testo: '', ms: 0, tokenIn: 0, tokenOut: 0, pensiero: 0, errore: 'fornitore non autorizzato' };
  }
  const t0 = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` },
    body: JSON.stringify({
      model: modello,
      messages: [{ role: 'user', content: RISPOSTA_PROMPT.replace('{testo}', domanda) }],
      temperature: 0,
      max_tokens: TETTO_TOKEN,
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) return { testo: '', ms, tokenIn: 0, tokenOut: 0, pensiero: 0, errore: `HTTP ${r.status}` };
  const j: any = await r.json();
  const { testo, pensiero } = rispostaDa(j?.choices?.[0]?.message);
  const troncata = j?.choices?.[0]?.finish_reason === 'length' && !testo;
  return {
    testo,
    ms,
    tokenIn: Number(j?.usage?.prompt_tokens ?? 0),
    tokenOut: Number(j?.usage?.completion_tokens ?? 0),
    pensiero,
    errore: troncata ? `il ragionamento ha esaurito i ${TETTO_TOKEN} token prima della risposta` : undefined,
  };
}

async function chiediLocale(modello: string, domanda: string): Promise<Esito> {
  const t0 = Date.now();
  const r = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modello, prompt: RISPOSTA_PROMPT.replace('{testo}', domanda), stream: false, options: { temperature: 0 } }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) return { testo: '', ms, tokenIn: 0, tokenOut: 0, pensiero: 0, errore: `HTTP ${r.status}` };
  const j: any = await r.json();
  return { testo: String(j?.response ?? '').trim(), ms, tokenIn: Number(j?.prompt_eval_count ?? 0), tokenOut: Number(j?.eval_count ?? 0), pensiero: 0 };
}

// Mescolata stabile ma diversa per ogni domanda: la lettera non tradisce il modello.
function mescola<T>(v: T[], seme: number): T[] {
  const a = [...v];
  let s = seme * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LETTERE = 'ABCDEFGH'.split('');

// Le risposte dei modelli contengono titoli markdown: dentro il foglio del
// banco spezzerebbero le sezioni e «### A» non sarebbe più l'unico confine.
// Si abbassano a grassetto, il testo resta identico.
function senzaTitoli(t: string): string {
  return t.split('\n').map((r) => (/^#{1,6}\s/.test(r) ? `**${r.replace(/^#{1,6}\s*/, '').trim()}**` : r)).join('\n');
}

async function main() {
  const risultati: { domanda: string; risposte: { c: Concorrente; e: Esito }[] }[] = [];
  const somma = new Map<string, { ms: number; tin: number; tout: number; pens: number; errori: number }>();
  for (const [i, domanda] of DOMANDE.entries()) {
    const risposte: { c: Concorrente; e: Esito }[] = [];
    for (const c of CONCORRENTI) {
      const e = c.dove === 'locale' ? await chiediLocale(c.modello, domanda) : await chiediInfomaniak(c.modello, domanda);
      risposte.push({ c, e });
      const s = somma.get(c.nome) ?? { ms: 0, tin: 0, tout: 0, pens: 0, errori: 0 };
      s.ms += e.ms; s.tin += e.tokenIn; s.tout += e.tokenOut; s.pens += e.pensiero; if (e.errore) s.errori++;
      somma.set(c.nome, s);
      console.log(`  ${i + 1}/${DOMANDE.length} ${c.nome}: ${e.errore ? 'ERRORE ' + e.errore : `${e.testo.length} caratteri, ${(e.ms / 1000).toFixed(1)} s, ${e.tokenIn}+${e.tokenOut} token`}`);
    }
    risultati.push({ domanda, risposte });
  }

  const righe: string[] = [
    '# Banco: quale modello risponde meglio alle domande di medicina',
    '',
    `Dieci domande di medicina **generale** (nessun paziente, nessun dato): ${CONCORRENTI.length} modelli, ${DOMANDE.length * CONCORRENTI.length} risposte.`,
    '',
    '**Come si legge.** Per ogni domanda le risposte sono mescolate e senza nome — e l\'ordine cambia a ogni domanda, quindi «A» non è sempre lo stesso modello. Dai un voto da 1 a 5 a ognuna (1 = sbagliata o inutile, 3 = corretta ma generica, 5 = quello che diresti tu a un collega). La chiave dei nomi è **in fondo**: guardala solo dopo aver votato tutto.',
    '',
    '---',
    '',
  ];
  const chiave: string[] = [];
  for (const [i, r] of risultati.entries()) {
    righe.push(`## Domanda ${i + 1}`, '', `**${r.domanda}**`, '');
    const ordine = mescola(r.risposte, i + 1);
    ordine.forEach((x, k) => {
      righe.push(`### ${LETTERE[k]}`, '', x.e.errore ? `*(nessuna risposta: ${x.e.errore})*` : senzaTitoli(x.e.testo), '', '**Voto (1-5):** ____', '');
      chiave.push(`| ${i + 1} | ${LETTERE[k]} | ${x.c.nome} |`);
    });
    righe.push('---', '');
  }
  righe.push('', '## Consumo e tempi', '', '| modello | tempo medio | token in | token out | di cui ragionamento (car.) | errori |', '|---|---|---|---|---|---|');
  for (const c of CONCORRENTI) {
    const s = somma.get(c.nome)!;
    righe.push(`| ${c.nome} | ${(s.ms / DOMANDE.length / 1000).toFixed(1)} s | ${s.tin} | ${s.tout} | ${s.pens || '—'} | ${s.errori} |`);
  }
  righe.push('', '', '## Chiave — guardare solo dopo aver votato', '', '| domanda | lettera | modello |', '|---|---|---|', ...chiave);

  writeFileSync(path.join(os.homedir(), 'banco-domanda-medica-grezzo.json'), JSON.stringify(risultati, null, 2), 'utf-8');
  const dest = path.join(os.homedir(), 'banco-domanda-medica.md');
  writeFileSync(dest, righe.join('\n') + '\n', 'utf-8');
  const tin = [...somma.values()].reduce((t, s) => t + s.tin, 0);
  const tout = [...somma.values()].reduce((t, s) => t + s.tout, 0);
  console.log(`\nScritto ${dest}`);
  console.log(`Consumo totale: ${tin} token in, ${tout} token out (locale escluso dal conto: gira sul Mac).`);
}

main();
