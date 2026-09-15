// Quale modello di ripiego: stesso testo, stessa domanda, risposte a confronto.
import { readFileSync } from 'node:fs';
import { query } from '@/lib/db';
import { generaOllamaEsito } from '@/lib/ollama';
import { applicaModifiche, assegnaVisite, daSistemarePerPrompt, escluso, fuoriDalPiano, leggiSale, pianoDelGiorno, prestazioniFuoriPiano } from '@/lib/sale';
import { PROMPT } from '@/lib/piano-sale';

async function via() {
  const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const md = readFileSync('docs/wiki/Medici/Sale.md', 'utf-8');
  const regole = leggiSale(md), fuori = fuoriDalPiano(md), fuoriP = prestazioniFuoriPiano(md);
  const [st] = await query<{ id: string }>('select id from studios');
  const presenti = (await query<{ nome: string }>(
    `select distinct pr.nome from appointments a join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.starts_at::date = current_date and pr.attivo order by 1`, [st.id])).map(r => r.nome);
  const piano = pianoDelGiorno(regole, presenti, GG[new Date().getDay()]);
  const app = await query<any>(
    `select a.id, pr.nome as chi, to_char(a.starts_at,'HH24:MI') as start,
            greatest(5, round(extract(epoch from (coalesce(a.ends_at, a.starts_at + interval '30 min') - a.starts_at))/60))::int as dur,
            c.nome as prestazione
       from appointments a left join providers pr on pr.id = a.provider_id
       left join prestazioni_catalogo c on c.studio_id = a.studio_id and c.attivo and lower(c.colore) = lower(a.colore)
      where a.studio_id = $1 and a.starts_at::date = current_date
        and coalesce(a.stato_medionline,'') not in ('annullato','scusato')`, [st.id]);
  const [v] = await query<any>('select modifiche from piano_sale where studio_id = $1 and giorno = current_date', [st.id]);
  const righe = applicaModifiche(piano.righe, v?.modifiche ?? []);
  const utili = app.filter((a: any) => !escluso(a.chi ?? '', fuori) && !(a.prestazione && escluso(a.prestazione, fuoriP)));
  const visite = assegnaVisite(righe, utili.map((a: any) => ({ id: a.id, chi: a.chi ?? '', start: a.start, dur: a.dur })));
  const libere = righe.filter(r => !(visite[r.stanza] ?? []).length).map(r => ({ stanza: r.stanza, di: r.segmenti.find(x => x.chi)?.chi ?? '' }));
  const messe = new Set(Object.values(visite).flat().map(x => x.id));
  const conta = new Map<string, number>();
  for (const a of utili) if (!messe.has(a.id)) conta.set(a.chi || 'appuntamenti senza medico in agenda', (conta.get(a.chi || 'appuntamenti senza medico in agenda') ?? 0) + 1);
  const testo = PROMPT.replace('{testo}', daSistemarePerPrompt(piano, presenti, libere, [...conta].map(([chi, n]) => ({ chi, n }))));
  for (const m of (process.argv[2] ?? 'qwen3:14b').split(',')) {
    const e = await generaOllamaEsito(testo, { modello: m, timeoutMs: 600_000, aPezzi: true });
    console.log(`\n===== ${m} =====`);
    console.log(e.ok ? (e.testo.includes('</think>') ? e.testo.split('</think>').pop()!.trim() : e.testo) : `FALLITO: ${e.causa}`);
    console.log(`(${e.ms} ms)`);
  }
  process.exit(0);
}
void via();
