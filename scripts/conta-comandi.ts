// Solo NUMERI e nomi di categoria su come i comandi a voce del dittafono leggono le lettere VERE (mai testo, mai nomi):
// per paziente (solo un numero d'ordine), quante lettere si trovano, e della più recente: tipo di fonte, lunghezza,
// saluto e saluti finali trovati sì/no, lunghezza del corpo, quali parti si riconoscono e quanto sono lunghe.
//   DATABASE_URL=… NODE_OPTIONS=--conditions=react-server npx tsx scripts/conta-comandi.ts [quanti pazienti]
import { query, pool } from '../src/lib/db';
import { lettereDelPazienteScelto } from '../src/lib/aggiorna-lettera-server';
import { corpoDellaLettera, partiDellaLettera } from '../src/lib/dittafono-comandi';
(async () => {
  const quanti = Number(process.argv[2]) || 12;
  // prima i pazienti per cui un comando ha letto un documento nelle ultime ore, poi quelli con lettere in cartella
  const paz = await query<{ id: string; studio_id: string; cognome: string; nome: string; chi: string }>(
    `with usati as (select distinct d.patient_id as id, 'comando' as chi from document_access_log l join patient_documents d on d.id = l.document_id where l.dettaglio = 'dittafono, comando a voce' and l.at > now() - interval '12 hours'),
          altri as (select patient_id as id, 'cartella' as chi, max(uploaded_at) as quando from patient_documents where categoria = 'lettera' or cartella like '01\\_%' group by 1 order by 3 desc limit $1)
     select p.id, p.studio_id, p.cognome, p.nome, x.chi from (select id, chi from usati union all select id, chi from altri where id not in (select id from usati)) x join patients p on p.id = x.id limit $1`, [quanti]);
  const tot: Record<string, number> = {}; let conLettere = 0;
  for (const [i, p] of paz.entries()) {
    const lettere = await lettereDelPazienteScelto(p.studio_id, p.id, `${p.cognome} ${p.nome}`.trim()).catch(() => []);
    if (!lettere.length) { console.log(`#${i + 1} (${p.chi}) · nessuna lettera trovata`); continue; }
    conLettere++;
    const righe: string[] = [];
    for (const l of lettere.slice(0, 2)) {
      const t = l.testo, corpo = corpoDellaLettera(t), parti = partiDellaLettera(t);
      const saluto = /^[ \t]*(?:caro|cara|cari|gentile|gentili|egregio|egregia|stimato|stimata)\b[^\n,]{0,80},/im.test(t.slice(0, 2500));
      const righeN = t.split('\n').length, paragrafi = t.split(/\n[ \t]*\n/).length, etichette = (t.match(/(^|[.!?]\s+|\n)[^\n:.!?;]{2,45}:/g) ?? []).length;
      for (const k of Object.keys(parti)) tot[k] = (tot[k] ?? 0) + 1;
      righe.push(`${l.fonte.tipo} ${t.length} car, ${righeN} righe, ${paragrafi} paragrafi, ${etichette} etichette «…:» · saluto ${saluto ? 'sì' : 'NO'} · corpo ${corpo.length} (${corpo.length === t.trim().length ? 'INTERO, niente tolto' : 'tagliato'}) · parti: ${Object.entries(parti).map(([k, v]) => `${k} ${v!.length}`).join(', ') || 'NESSUNA'}`);
    }
    console.log(`#${i + 1} (${p.chi}) · ${lettere.length} lettere · ${righe.join('\n      poi: ')}`);
  }
  console.log(`\npazienti con lettere: ${conLettere} su ${paz.length}; in quante lettere guardate c'è ogni parte: ${Object.entries(tot).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  await pool.end();
})();
