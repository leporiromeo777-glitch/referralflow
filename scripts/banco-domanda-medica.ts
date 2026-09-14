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

type Dove = 'infomaniak' | 'locale' | 'anthropic' | 'openai' | 'gemini';
type Concorrente = { nome: string; dove: Dove; modello: string };
const CONCORRENTI: Concorrente[] = [
  { nome: 'Qwen 3.5 397B', dove: 'infomaniak', modello: 'Qwen/Qwen3.5-397B-A17B-FP8' },
  { nome: 'Kimi K2.6', dove: 'infomaniak', modello: 'moonshotai/Kimi-K2.6' },
  { nome: 'Mistral Small 4 119B', dove: 'infomaniak', modello: 'mistralai/Mistral-Small-4-119B-2603' },
  { nome: 'Apertus 70B (svizzero)', dove: 'infomaniak', modello: 'swiss-ai/Apertus-v1.5-70B' },
  { nome: 'gemma 4 31B (quello di oggi)', dove: 'infomaniak', modello: 'google/gemma-4-31B-it' },
  { nome: 'modello locale sul Mac', dove: 'locale', modello: process.env.PROTOTIPO_LLM || 'gemma3:12b' },
  // Fuori dalla lista autorizzata: partecipano SOLO se la chiave è in
  // ~/.referralflow-banco.conf. Ammessi qui perché le domande del banco sono
  // di medicina generale e non contengono dati di nessuno; per usarne uno in
  // produzione serve prima la scheda in docs/legale/fornitori-cloud.md.
  { nome: 'Claude Sonnet 5', dove: 'anthropic', modello: 'claude-sonnet-5' },
  { nome: 'Claude Haiku 4.5', dove: 'anthropic', modello: 'claude-haiku-4-5-20251001' },
  { nome: 'GPT-5.5', dove: 'openai', modello: 'gpt-5.5' },
  { nome: 'Gemini 3.1 Pro', dove: 'gemini', modello: 'gemini-3.1-pro' },
];

// Chiavi dei concorrenti fuori lista: file a parte, permessi 600, mai nel repo.
function chiaviBanco(): Record<string, string> {
  try {
    const t = readFileSync(path.join(os.homedir(), '.referralflow-banco.conf'), 'utf-8');
    const fuori: Record<string, string> = {};
    for (const r of t.split('\n')) {
      if (r.trim().startsWith('#') || !r.includes('=')) continue;
      const [k, ...v] = r.split('=');
      const valore = v.join('=').trim();
      if (valore) fuori[k.trim()] = valore;
    }
    return fuori;
  } catch {
    return {};
  }
}

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

async function chiediAnthropic(modello: string, domanda: string, chiave: string): Promise<Esito> {
  const t0 = Date.now();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': chiave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: modello, max_tokens: TETTO_TOKEN, messages: [{ role: 'user', content: RISPOSTA_PROMPT.replace('{testo}', domanda) }] }),
  });
  const ms = Date.now() - t0;
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { testo: '', ms, tokenIn: 0, tokenOut: 0, pensiero: 0, errore: `HTTP ${r.status} ${String(j?.error?.message ?? '').slice(0, 80)}` };
  const testo = (j?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim();
  return { testo, ms, tokenIn: Number(j?.usage?.input_tokens ?? 0), tokenOut: Number(j?.usage?.output_tokens ?? 0), pensiero: 0 };
}

async function chiediOpenai(modello: string, domanda: string, chiave: string): Promise<Esito> {
  const t0 = Date.now();
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` },
    body: JSON.stringify({ model: modello, messages: [{ role: 'user', content: RISPOSTA_PROMPT.replace('{testo}', domanda) }], max_completion_tokens: TETTO_TOKEN }),
  });
  const ms = Date.now() - t0;
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { testo: '', ms, tokenIn: 0, tokenOut: 0, pensiero: 0, errore: `HTTP ${r.status} ${String(j?.error?.message ?? '').slice(0, 80)}` };
  const { testo, pensiero } = rispostaDa(j?.choices?.[0]?.message);
  return { testo, ms, tokenIn: Number(j?.usage?.prompt_tokens ?? 0), tokenOut: Number(j?.usage?.completion_tokens ?? 0), pensiero };
}

async function chiediGemini(modello: string, domanda: string, chiave: string): Promise<Esito> {
  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chiave },
    body: JSON.stringify({ contents: [{ parts: [{ text: RISPOSTA_PROMPT.replace('{testo}', domanda) }] }] }),
  });
  const ms = Date.now() - t0;
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { testo: '', ms, tokenIn: 0, tokenOut: 0, pensiero: 0, errore: `HTTP ${r.status} ${String(j?.error?.message ?? '').slice(0, 80)}` };
  const testo = (j?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('').trim();
  const u = j?.usageMetadata ?? {};
  return { testo, ms, tokenIn: Number(u.promptTokenCount ?? 0), tokenOut: Number(u.candidatesTokenCount ?? 0), pensiero: Number(u.thoughtsTokenCount ?? 0) };
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
  const chiavi = chiaviBanco();
  // --solo "Nome, Altro nome": rigira SOLO quei concorrenti e fonde il
  // risultato con le risposte già in archivio. Serve quando uno solo fallisce
  // (chiave scaduta, fornitore giù): rifare tutto il banco vuol dire
  // ripagare — e rimisurare — anche chi aveva già risposto bene.
  const iSolo = process.argv.indexOf('--solo');
  const solo = iSolo > -1 ? (process.argv[iSolo + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : [];
  let archivio: { domanda: string; risposte: { c: Concorrente; e: Esito }[] }[] = [];
  if (solo.length) {
    try {
      archivio = JSON.parse(readFileSync(path.join(os.homedir(), 'banco-domanda-medica-grezzo.json'), 'utf-8'));
      console.log(`Rigiro solo: ${solo.join(', ')} — il resto viene dall'archivio.\n`);
    } catch {
      console.log('Archivio non trovato: --solo ha bisogno di un giro completo precedente.');
      process.exit(1);
    }
  }
  const inGara = CONCORRENTI.filter(
    (c) => (solo.length ? solo.includes(c.nome) : true) && (['infomaniak', 'locale'].includes(c.dove) || chiavi[c.dove])
  );
  if (solo.length && !inGara.length) { console.log('Nessuno dei nomi dati è in gara (chiave mancante?).'); process.exit(1); }
  const fuori = CONCORRENTI.filter((c) => !inGara.includes(c));
  if (fuori.length) console.log(`Senza chiave, non partecipano: ${fuori.map((c) => c.nome).join(', ')}\n`);
  const risultati: { domanda: string; risposte: { c: Concorrente; e: Esito }[] }[] = [];
  const somma = new Map<string, { ms: number; tin: number; tout: number; pens: number; errori: number }>();
  for (const [i, domanda] of DOMANDE.entries()) {
    const risposte: { c: Concorrente; e: Esito }[] = [];
    for (const c of inGara) {
      const e =
        c.dove === 'locale' ? await chiediLocale(c.modello, domanda)
        : c.dove === 'infomaniak' ? await chiediInfomaniak(c.modello, domanda)
        : c.dove === 'anthropic' ? await chiediAnthropic(c.modello, domanda, chiavi.anthropic)
        : c.dove === 'openai' ? await chiediOpenai(c.modello, domanda, chiavi.openai)
        : await chiediGemini(c.modello, domanda, chiavi.gemini);
      risposte.push({ c, e });
      const s = somma.get(c.nome) ?? { ms: 0, tin: 0, tout: 0, pens: 0, errori: 0 };
      s.ms += e.ms; s.tin += e.tokenIn; s.tout += e.tokenOut; s.pens += e.pensiero; if (e.errore) s.errori++;
      somma.set(c.nome, s);
      console.log(`  ${i + 1}/${DOMANDE.length} ${c.nome}: ${e.errore ? 'ERRORE ' + e.errore : `${e.testo.length} caratteri, ${(e.ms / 1000).toFixed(1)} s, ${e.tokenIn}+${e.tokenOut} token`}`);
    }
    // Con --solo: le risposte nuove sostituiscono le vecchie dello stesso
    // concorrente, le altre restano come sono.
    if (solo.length) {
      const vecchie = (archivio[i]?.risposte ?? []).filter((x) => !solo.includes(x.c.nome));
      risultati.push({ domanda, risposte: [...vecchie, ...risposte] });
    } else {
      risultati.push({ domanda, risposte });
    }
  }

  const righe: string[] = [
    '# Banco: quale modello risponde meglio alle domande di medicina',
    '',
    `Dieci domande di medicina **generale** (nessun paziente, nessun dato): ${risultati[0]?.risposte.length ?? 0} modelli, ${DOMANDE.length * (risultati[0]?.risposte.length ?? 0)} risposte.`,
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
  const presenti = CONCORRENTI.filter((c) => risultati[0]?.risposte.some((x) => x.c.nome === c.nome));
  for (const c of presenti) {
    if (!somma.has(c.nome)) {
      // viene dall'archivio: i tempi si ricalcolano dalle risposte salvate
      const tutte = risultati.flatMap((r) => r.risposte.filter((x) => x.c.nome === c.nome).map((x) => x.e));
      somma.set(c.nome, {
        ms: tutte.reduce((t, e) => t + e.ms, 0),
        tin: tutte.reduce((t, e) => t + e.tokenIn, 0),
        tout: tutte.reduce((t, e) => t + e.tokenOut, 0),
        pens: tutte.reduce((t, e) => t + (e.pensiero ?? 0), 0),
        errori: tutte.filter((e) => e.errore).length,
      });
    }
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
