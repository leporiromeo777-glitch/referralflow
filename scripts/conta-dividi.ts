// Solo NUMERI sulla proposta di una cartella vera (mai testo, mai titoli, mai date): per sezione, quante pagine, quanti documenti
// senza e col modello, quanti di una pagina, senza data, «da guardare». È il modo di guardare una cartella dello studio senza leggerla.
//   DATABASE_URL=… NODE_OPTIONS=--conditions=react-server npx tsx scripts/conta-dividi.ts <inizio dell'id del documento>
import { query, pool } from '../src/lib/db';
import { getFile } from '../src/lib/storage';
import { leggiPagine } from '../src/lib/dividi/pagine';
import { componi, pagineDaChiedere } from '../src/lib/dividi/sezioni';
(async () => {
  const [d] = await query<any>(`select d.storage_key, a.esito, a.stato, a.fatte, a.pagine, a.ms from patient_documents d join dividi_analisi a on a.documento_id = d.id where d.id::text like $1`, [`${process.argv[2]}%`]);
  const letto = (await leggiPagine((await getFile(d.storage_key)).body))!;
  const sep = d.esito.separatori ?? [], ris = d.esito.risposte ?? {};
  const conta = (pezzi: any[]) => { const m = new Map<string, number[]>(); for (const x of pezzi) { if (x.foglio || x.escluso) continue; const k = x.cartella ?? '(senza sezione)'; const v = m.get(k) ?? [0, 0, 0, 0, 0]; v[0]++; if (!x.data) v[1]++; if (x.sicurezza === 'media') v[2]++; v[3] += x.a - x.da + 1; if (x.a === x.da) v[4]++; m.set(k, v); } return m; };
  const regole = conta(componi(letto.testi, sep, {}, 'X Y', letto.forme)), modello = conta(componi(letto.testi, sep, ris, 'X Y', letto.forme));
  console.log(`forme: titolo ${letto.forme.filter((f) => f.titolo).length}, blocco a destra ${letto.forme.filter((f) => f.destra >= 2).length}, chiuse ${letto.forme.filter((f) => f.chiusa).length} su ${letto.forme.length} pagine · pagine da chiedere al modello: ${pagineDaChiedere(letto.testi, sep, letto.forme).length}`);
  console.log('sezione · pagine · documenti senza modello → col modello · di una pagina · senza data · da guardare');
  let tot = [0, 0, 0, 0];
  for (const [k, v] of modello) { console.log(`${k} · ${v[3]} · ${regole.get(k)?.[0] ?? 0} → ${v[0]} · ${v[4]} · ${v[1]} · ${v[2]}`); tot = [tot[0] + v[0], tot[1] + v[1], tot[2] + v[2], tot[3] + (regole.get(k)?.[0] ?? 0)]; }
  console.log(`totale: ${tot[3]} → ${tot[0]} documenti, ${tot[1]} senza data, ${tot[2]} da guardare`);
  await pool.end();
})();
