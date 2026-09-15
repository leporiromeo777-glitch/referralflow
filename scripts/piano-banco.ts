// Banco visivo delle sale: prende il piano di oggi dal database, ci applica le
// correzioni e le visite come fa l'endpoint, e stampa il JSON per la prova.
import { writeFileSync } from 'node:fs';
import { query } from '../src/lib/db';
import { applicaModifiche, assegnaVisite } from '../src/lib/sale';

const fuori = process.argv[2] ?? 'piano.json';

async function via() {
  const [p] = await query<any>(`select studio_id, righe, da_decidere, proposta, proposta_da, accettata_at::text, modifiche from piano_sale where giorno = current_date`);
  if (!p) { console.error('nessun piano per oggi'); process.exit(1); }
  const righe = applicaModifiche(p.righe ?? [], p.modifiche ?? []);
  const app = await query<{ id: string; chi: string | null; start: string; dur: number }>(
    `select a.id, pr.nome as chi, to_char(a.starts_at, 'HH24:MI') as start,
            greatest(5, round(extract(epoch from (coalesce(a.ends_at, a.starts_at + interval '30 min') - a.starts_at)) / 60))::int as dur
       from appointments a left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.starts_at::date = current_date
        and coalesce(a.stato_medionline, '') not in ('annullato', 'scusato')`, [p.studio_id]);
  const visite = assegnaVisite(righe, app.map((a) => ({ id: a.id, chi: a.chi ?? '', start: a.start, dur: a.dur, etichetta: '' })));
  // Nel banco visivo i pazienti NON servono e non si guardano: nomi finti.
  let k = 0;
  for (const lista of Object.values(visite)) for (const v of lista) {
    const a = app.find((x) => x.id === v.id);
    Object.assign(v, { paziente: `Paziente ${++k}`, medico: a?.chi ?? '', stato: 'fissato', motivo: 'Visita di controllo', tipo: 'visita' });
  }
  const presenti = [...new Set(app.map((a) => a.chi).filter(Boolean))];
  const messe = new Set(Object.values(visite).flat().map((v) => v.id));
  const conta = new Map<string, number>();
  for (const a of app) if (!messe.has(a.id)) conta.set(a.chi ?? 'senza medico in agenda', (conta.get(a.chi ?? 'senza medico in agenda') ?? 0) + 1);
  const senzaSala = [...conta].map(([chi, n]) => ({ chi, n })).sort((x, y) => y.n - x.n);
  writeFileSync(fuori, JSON.stringify({ righe, da_decidere: p.da_decidere, proposta: p.proposta, proposta_da: p.proposta_da, accettata_at: p.accettata_at, modifiche: p.modifiche, presenti, visite, senzaSala }));
  console.log(`${righe.length} stanze, ${app.length} appuntamenti, ${Object.values(visite).flat().length} visite assegnate`);
  process.exit(0);

}
void via();
