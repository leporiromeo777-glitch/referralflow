// Simulazione della cartella comune (22.10.2026): quante cartelle di pazienti si abbinerebbero da sole, senza scrivere
// niente. Legge fino a 4 lettere per cartella. Stampa SOLO conteggi: mai un nome, mai un testo.
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/comune-simula.ts [radice]
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { query, pool } from '../src/lib/db';
import { slugNome } from '../src/lib/imaging-ordina';
import { abbinaCartella, dateNelTesto, MAX_LETTERE_PAZIENTE, nomeDaCartella } from '../src/lib/comune/regole';
import { cartellePazienti, lettereSulDisco } from '../src/lib/comune/scopri';
import { testoDi } from '../src/lib/comune/testo';

const RADICE = process.argv[2] || process.env.COMUNE_LETTERE || '/Volumes/comune/CentroCardio/Pazienti';
(async () => {
  const t0 = Date.now();
  const [s] = await query<{ id: string }>(`select id from studios where attivo order by created_at limit 1`);
  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [s.id]);
  const nomi = new Set(pazienti.map((p) => slugNome(`${p.cognome} ${p.nome}`)));
  const { trovate, sciolte } = await cartellePazienti(RADICE, nomi);
  const conti: Record<string, [number, number]> = {}; const perMedico: Record<string, Record<string, number>> = {};
  const add = (k: string, n: number, m: string) => { const c = conti[k] ?? [0, 0]; c[0]++; c[1] += n; conti[k] = c; (perMedico[m] ??= {})[k] = (perMedico[m][k] ?? 0) + 1; };
  for (const t of trovate) {
    const tutti = await lettereSulDisco(RADICE, t.rel);
    if (tutti.length > MAX_LETTERE_PAZIENTE && !nomi.has(slugNome(nomeDaCartella(t.nome).nome))) { add('archivio', tutti.length, t.medico); continue; }
    const word = tutti.filter((f) => f.formato !== 'pdf').sort((a, b) => b.modificato.getTime() - a.modificato.getTime()).slice(0, 4);
    const date = new Set<string>();
    for (const f of word.length ? word : tutti.slice(0, 2)) {
      const b = await fs.readFile(path.join(RADICE, f.rel)).catch(() => null);
      if (b) for (const d of dateNelTesto(await testoDi(b, f.formato))) date.add(d);
    }
    add(abbinaCartella(t.nome, date, pazienti).motivo, tutti.length, t.medico);
  }
  for (const [m, c] of Object.entries(perMedico)) console.log(`cartella ${m}:`, c);
  console.log('esito → [cartelle, lettere]:', conti);
  console.log(`lettere sciolte fuori da una cartella di paziente: ${sciolte} · ${Math.round((Date.now() - t0) / 1000)} s`);
  await pool.end();
})().catch(async (e) => { console.error('errore', e?.code ?? e?.name ?? 'sconosciuto'); await pool.end(); process.exit(1); });
