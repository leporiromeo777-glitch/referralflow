// Banco dei modelli per il piano delle sale (15.9.2026).
//
// Stesso testo che riceve la catena in produzione, sui dati veri di oggi. Si
// misura quel che conta per QUESTO lavoro, non la simpatia della risposta:
//   - risponde? (un modello che torna vuoto non serve a niente)
//   - quanto ci mette, e quanto occupa in memoria;
//   - il FORMATO: quante righe «ASSEGNA sala -> persona» il lettore accetta
//     davvero, perché quelle sole diventano assegnazioni;
//   - le BUGIE: dice «(intestata a X)» dove la pagina dice un altro nome?
//   - la RESA: quante visite oggi senza sala verrebbero sistemate.
// Ogni modello viene scaricato dalla memoria appena finito.
import { readFileSync, writeFileSync } from 'node:fs';
import { query } from '@/lib/db';
import { applicaModifiche, assegnaVisite, daSistemarePerPrompt, escluso, fuoriDalPiano, leggiProposta, leggiSale, pianoDelGiorno, prestazioneEsclusa, prestazioniFuoriPiano, type ModificaSala, type RigaPiano } from '@/lib/sale';
import { PROMPT } from '@/lib/piano-sale';

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

async function chiedi(modello: string, testo: string): Promise<{ ok: boolean; risposta: string; ms: number; causa?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modello, prompt: testo, stream: true, options: { temperature: 0 } }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!r.ok) return { ok: false, risposta: '', ms: Date.now() - t0, causa: `HTTP ${r.status}` };
    const lettore = r.body!.getReader(); const dec = new TextDecoder();
    let resto = '', out = '', pensiero = '';
    for (;;) {
      const { value, done } = await lettore.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const righe = resto.split('\n'); resto = righe.pop() ?? '';
      for (const riga of righe) { if (!riga.trim()) continue; try { const p = JSON.parse(riga); out += String(p?.response ?? ''); pensiero += String(p?.thinking ?? ''); } catch { /* riga a metà */ } }
    }
    let testoFinale = (out || pensiero).trim();
    if (testoFinale.includes('</think>')) testoFinale = testoFinale.split('</think>').pop()!.trim();
    return { ok: !!testoFinale, risposta: testoFinale, ms: Date.now() - t0, causa: testoFinale ? undefined : 'risposta vuota' };
  } catch (e) { return { ok: false, risposta: '', ms: Date.now() - t0, causa: (e as Error).message.slice(0, 60) }; }
}
async function scarica(modello: string) {
  try { await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modello, keep_alive: 0 }) }); } catch { /* pazienza */ }
}

async function via() {
  const modelli = (process.argv[2] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  // Il giorno: «oggi» oppure una data ISO. Serve per provare un mercoledì, che
  // è quando le regole lasciano davvero una casella aperta.
  const giornoArg = process.argv[3] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[3]) ? process.argv[3] : new Date().toISOString().slice(0, 10);
  const soloConti = modelli.length === 0;
  const md = readFileSync('docs/wiki/Medici/Sale.md', 'utf-8');
  const regole = leggiSale(md), fuori = fuoriDalPiano(md), fuoriP = prestazioniFuoriPiano(md);
  const [st] = await query<{ id: string }>('select id from studios');
  const presenti = (await query<{ nome: string }>(
    `select distinct pr.nome from appointments a join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.starts_at::date = $2::date and pr.attivo order by 1`, [st.id, giornoArg])).map((r) => r.nome);
  const piano = pianoDelGiorno(regole, presenti, GG[new Date(`${giornoArg}T12:00:00`).getDay()]);
  const app = await query<{ id: string; chi: string | null; start: string; dur: number; prestazione: string | null }>(
    `select a.id, pr.nome as chi, to_char(a.starts_at,'HH24:MI') as start,
            greatest(5, round(extract(epoch from (coalesce(a.ends_at, a.starts_at + interval '30 min') - a.starts_at))/60))::int as dur,
            c.nome as prestazione
       from appointments a left join providers pr on pr.id = a.provider_id
       left join prestazioni_catalogo c on c.studio_id = a.studio_id and c.attivo and lower(c.colore) = lower(a.colore)
      where a.studio_id = $1 and a.starts_at::date = $2::date
        and coalesce(a.stato_medionline,'') not in ('annullato','scusato')`, [st.id, giornoArg]);
  const [vecchio] = await query<{ modifiche: ModificaSala[] }>('select modifiche from piano_sale where studio_id = $1 and giorno = $2::date', [st.id, giornoArg]);
  const righe: RigaPiano[] = applicaModifiche(piano.righe, vecchio?.modifiche ?? []);
  const utili = app.filter((a) => !escluso(a.chi ?? '', fuori) && !prestazioneEsclusa(a.prestazione ?? '', a.chi ?? '', fuoriP));
  const visite = assegnaVisite(righe, utili.map((a) => ({ id: a.id, chi: a.chi ?? '', start: a.start, dur: a.dur })));
  const libere = righe.filter((r) => !(visite[r.stanza] ?? []).length).map((r) => ({ stanza: r.stanza, di: r.segmenti.find((x) => x.chi)?.chi ?? '' }));
  const messe = new Set(Object.values(visite).flat().map((v) => v.id));
  const conta = new Map<string, number>();
  for (const a of utili) if (!messe.has(a.id)) conta.set(a.chi || 'appuntamenti senza medico in agenda', (conta.get(a.chi || 'appuntamenti senza medico in agenda') ?? 0) + 1);
  const senzaSala = [...conta].map(([chi, n]) => ({ chi, n })).sort((x, y) => y.n - x.n);
  const testo = PROMPT.replace('{testo}', daSistemarePerPrompt(piano, presenti, libere, senzaSala));

  // Chi è il titolare vero di ogni stanza: serve per smascherare le bugie.
  const titolareDi = new Map(righe.map((r) => [r.stanza.toLowerCase(), r.segmenti.find((x) => x.chi)?.chi ?? '']));
  const senzaSalaPer = new Map(senzaSala.map((x) => [x.chi, x.n]));

  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  console.log(`Banco piano sale · ${GIORNI[new Date(`${giornoArg}T12:00:00`).getDay()]} ${giornoArg} · ${righe.length} stanze, ${libere.length} vuote, ${senzaSala.reduce((t, x) => t + x.n, 0)} visite senza sala, ${piano.daDecidere.length} caselle aperte`);
  if (piano.daDecidere.length) for (const d of piano.daDecidere) console.log(`  casella aperta: ${d.stanza} ${d.dalle}-${d.alle} · ${d.perche}`);
  console.log(`  in studio: ${presenti.length} · stanze vuote: ${libere.map((x) => x.stanza).join(', ') || 'nessuna'}`);
  for (const s of senzaSala) console.log(`  senza sala: ${s.chi} · ${s.n}`);
  console.log('');
  if (soloConti) { console.log('(nessun modello chiesto: solo i conti)'); process.exit(0); }
  const esiti: string[] = [];
  for (const m of modelli) {
    const e = await chiedi(m, testo);
    if (!e.ok) {
      console.log(`${m.padEnd(22)} FALLITO — ${e.causa} (${(e.ms / 1000).toFixed(1)} s)\n`);
      esiti.push(`| ${m} | — | fallito: ${e.causa} | — | — | — |`);
      await scarica(m);
      continue;
    }
    const l = leggiProposta(e.risposta, righe, presenti);
    // Bugie: «(intestata a X)» dove la pagina dice un altro nome.
    let bugie = 0;
    for (const riga of e.risposta.split('\n')) {
      const mm = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:assegna\s+)?(.+?)\s*\(\s*intestata a\s+([^)]+)\)/i.exec(riga);
      if (!mm) continue;
      const vero = titolareDi.get(mm[1].trim().toLowerCase());
      if (vero !== undefined && vero && !escluso(mm[2].trim(), [vero])) bugie++;
    }
    const risolte = l.applicabili.reduce((t, a) => t + (senzaSalaPer.get(a.chi) ?? 0), 0);
    console.log(`===== ${m} =====\n${e.risposta}\n→ ${(e.ms / 1000).toFixed(1)} s · ${l.applicabili.length} assegnazioni leggibili · ${l.saltate.length} scartate · ${bugie} affermazioni false · ${risolte} visite sistemate\n`);
    esiti.push(`| ${m} | ${(e.ms / 1000).toFixed(1)} s | ${l.applicabili.length} | ${l.saltate.length} | ${bugie} | ${risolte} |`);
    await scarica(m);
  }
  const tabella = ['| modello | tempo | assegnazioni leggibili | righe scartate | affermazioni false | visite sistemate |', '| --- | --- | --- | --- | --- | --- |', ...esiti].join('\n');
  writeFileSync('/tmp/banco-sale.md', tabella + '\n');
  console.log(tabella);
  process.exit(0);
}
void via();
