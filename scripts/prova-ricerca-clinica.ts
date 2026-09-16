// Prova della ricerca clinica esterna protetta su un paziente VERO (16.9.2026).
//
// Gira sul Mac dello studio e stampa SOLO numeri, stati e booleani: nessun
// testo clinico, né la cartella, né il pacchetto, né la risposta. La regola
// dello studio è che da qui non si leggono testi clinici, e questa prova non
// fa eccezione: serve a sapere se la catena regge, non che cosa ha detto.
//
//   npx tsx --env-file=.env scripts/prova-ricerca-clinica.ts [patient_id]
//
// Attenzione: la chiamata al passo 5 è a PAGAMENTO (Infomaniak, frazione di
// centesimo). Non parte se il controllo locale non passa.

import { query } from '../src/lib/db';
import { briefingGrezzo } from '../src/lib/briefing';
import { generaOllamaEsito } from '../src/lib/ollama';
import { CONTESTO_PROMPT, controllaContesto, separaContesto, spieDiPaziente } from '../src/lib/contesto-clinico';
import { chiediFornitore, fornitoreEsterno } from '../src/lib/fornitore-esterno';
import {
  RICERCA_ESTERNA_PROMPT, RICOMBINA_PROMPT, SEZIONI_ESTERNE, SEZIONI_FINALI,
  leggiRisposta, puoUscire, ripuliEsterna,
} from '../src/lib/ricerca-clinica';

const LOCALE = process.env.CONTESTO_LLM || 'gemma3:12b';
const ESTERNO = process.env.RICERCA_CLINICA_MODELLO || 'google/gemma-4-31B-it';
const DOMANDA = process.argv[3] ||
  'Guardando tutta la cartella, ci sono interazioni o controindicazioni fra i farmaci in corso a cui fare attenzione?';

async function main() {
  const [studio] = await query<{ id: string }>(`select id from studios order by created_at limit 1`);
  if (!studio) throw new Error('nessuno studio');

  // Il paziente con la cartella più ricca: si contano le righe, non si legge niente.
  let patientId = process.argv[2] ?? '';
  if (!patientId) {
    const [p] = await query<{ id: string; quanti: string }>(
      `select p.id, count(r.id) as quanti from patients p
         join reports r on r.patient_id = p.id
        where p.studio_id = $1 group by p.id order by count(r.id) desc limit 1`, [studio.id]);
    if (!p) throw new Error('nessun paziente con referti');
    patientId = p.id;
    console.log(`paziente scelto: quello con più referti (${p.quanti})`);
  }

  const grezzo = await briefingGrezzo(studio.id, patientId);
  if (!grezzo) throw new Error('cartella non leggibile');
  console.log(`1-2. cartella assemblata: ${grezzo.testo.length} caratteri`);

  const t0 = Date.now();
  const e1 = await generaOllamaEsito(
    CONTESTO_PROMPT.replace('{cartella}', grezzo.testo).replace('{domanda}', DOMANDA),
    { modello: LOCALE, timeoutMs: 300_000, aPezzi: true });
  if (!e1.ok) throw new Error(`modello locale: ${e1.causa}`);
  const testo1 = e1.testo.includes('</think>') ? e1.testo.split('</think>').pop()!.trim() : e1.testo.trim();
  const pacchetto = separaContesto(testo1);
  console.log(`3. pacchetto minimo: contesto ${pacchetto.contesto.length} + domanda ${pacchetto.domanda.length} caratteri in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const [p] = await query<any>(
    `select cognome, nome, data_nascita::text, telefono, email, via, npa, localita, avs, n_assicurato
       from patients where id = $1 and studio_id = $2`, [patientId, studio.id]);
  const k = controllaContesto(pacchetto, spieDiPaziente(p));
  console.log(`4. controllo: fughe ${k.fughe.length}, deittici ${k.deittici.length}, età esatta ${k.etaEsatta ? 'SÌ' : 'no'}, vuoto ${k.vuoto ? 'SÌ' : 'no'} → ${k.ok ? 'PASSA' : 'BLOCCA'}`);
  if (!puoUscire(k)) { console.log('   non esce niente: fine della prova.'); return; }

  const f = fornitoreEsterno((m) => console.log(`   ${m}`));
  if (!f) { console.log('5. nessun fornitore autorizzato: non esce niente.'); return; }
  console.log(`5. esce verso ${f.url.replace(/^(https:\/\/[^/]+).*$/, '$1')} · ${ESTERNO}`);
  const est = await chiediFornitore(f, ESTERNO,
    RICERCA_ESTERNA_PROMPT.replace('{contesto}', pacchetto.contesto).replace('{domanda}', pacchetto.domanda),
    { maxToken: 1200, timeoutMs: 120_000 });
  if (!est.ok) { console.log(`   fallita: ${est.causa} (${est.dettaglio}) in ${est.ms} ms`); return; }
  const esterna = ripuliEsterna(est.testo);
  const le = leggiRisposta(esterna, SEZIONI_ESTERNE);
  console.log(`   tornata: ${esterna.length} caratteri in ${(est.ms / 1000).toFixed(1)} s · sezioni mancanti ${le.mancanti.length} (${le.mancanti.join(',') || 'nessuna'}) · fonti ${le.fonti.length} · link da verificare ${le.daVerificare.length} · certezza ${le.certezza || '—'}`);

  const t2 = Date.now();
  const e2 = await generaOllamaEsito(
    RICOMBINA_PROMPT.replace('{cartella}', grezzo.testo).replace('{domanda}', DOMANDA).replace('{esterna}', esterna),
    { modello: LOCALE, timeoutMs: 300_000, aPezzi: true });
  if (!e2.ok) { console.log(`6. ricombinazione fallita: ${e2.causa}`); return; }
  const testo2 = (e2.testo.includes('</think>') ? e2.testo.split('</think>').pop()! : e2.testo).trim();
  const lf = leggiRisposta(testo2, SEZIONI_FINALI);
  console.log(`6-7. risposta finale: ${testo2.length} caratteri in ${((Date.now() - t2) / 1000).toFixed(1)} s`);
  for (const s of SEZIONI_FINALI) {
    const v = (lf.sezioni[s.toLowerCase()] || '').length;
    console.log(`     ${s.padEnd(12)} ${v ? `${v} caratteri` : 'MANCA'}`);
  }
  console.log(`     fonti ${lf.fonti.length} · link da verificare ${lf.daVerificare.length} · certezza ${lf.certezza || '—'}`);
  console.log(`\nuscito da questo Mac: ${pacchetto.contesto.length + pacchetto.domanda.length} caratteri su ${grezzo.testo.length} di cartella (${((pacchetto.contesto.length + pacchetto.domanda.length) * 100 / grezzo.testo.length).toFixed(1)}%)`);
}

main().then(() => process.exit(0), (e) => { console.error(String(e?.message ?? e)); process.exit(1); });
