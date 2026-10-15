// Solo NUMERI (15.10.2026): nelle lettere vere, dove stanno i fattori di rischio e le comorbidità quando non hanno
// un'etichetta riconosciuta — per decidere fin dove arriva «riprendimi la lettera fino a…». Mai testo, mai nomi.
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/misura-fino.ts [quanti pazienti]
import { query, pool } from '../src/lib/db';
import { lettereDelPazienteScelto } from '../src/lib/aggiorna-lettera-server';
import { corpoDellaLettera, partiDellaLettera, salutoDellaLettera } from '../src/lib/dittafono-comandi';
const PAROLE: Record<string, RegExp> = {
  frcv: /fattor[ei] di rischio(?:\s+cardio[\s-]?vascolar[ei])?|\bf\.?\s?r\.?\s?c\.?\s?v\b/gi,
  comorbidita: /\b(?:co|com)?-?morbi[dl]it[aàá]/gi,
};
(async () => {
  const quanti = Number(process.argv[2]) || 30;
  const paz = await query<{ id: string; studio_id: string; cognome: string; nome: string }>(
    `select p.id, p.studio_id, p.cognome, p.nome from patients p join (
       select patient_id, max(q) q from (
         select patient_id, uploaded_at q from patient_documents where categoria = 'lettera' or cartella like '01\\_%'
         union all select patient_id, reviewed_at q from referti_bozze where stato = 'confermata' and patient_id is not null) u
       group by 1 order by 2 desc nulls last limit $1) x on x.patient_id = p.id`, [quanti]);
  const c: Record<string, number> = {};
  const piu = (k: string) => { c[k] = (c[k] ?? 0) + 1; };
  // anche tutte le lettere dettate e confermate in piattaforma (quelle che il dittafono riprende per prime)
  const referti = await query<{ testo: string }>(`select testo_finale as testo from referti_bozze where stato = 'confermata' and coalesce(testo_finale, '') <> ''`);
  const tutte: { testo: string }[][] = [referti];
  for (const p of paz) tutte.push(await lettereDelPazienteScelto(p.studio_id, p.id, `${p.cognome} ${p.nome}`.trim()).catch(() => []));
  for (const [n, lettere] of tutte.entries()) {
    for (const l of n === 0 ? lettere : lettere.slice(0, 2)) {
      if (n === 0) piu('(di cui referti confermati)');
      piu('lettere');
      piu(`saluto in testa trovato: ${salutoDellaLettera(l.testo) ? 'sì' : 'no'}`);
      if (!salutoDellaLettera(l.testo)) {
        const testa = l.testo.slice(0, 2500), w = /(^|\n)[ \t]*(caro|cara|cari|care|gentile|gentili|egregio|egregia|egregi|stimato|stimata|spettabile|lieber|liebe|sehr geehrte|geschätzte|cher|chère|chers|dear)\b([^\n]{0,60})/i.exec(testa);
        piu(`  senza saluto: ${w ? `parola di saluto a inizio riga (${w[2].toLowerCase()}), ${/,\s*$/.test(w[3]) ? 'con' : 'senza'} virgola in fondo` : /\b(caro|gentile|egregio|stimato|lieber|cher|dear)\b/i.test(testa) ? 'parola di saluto dentro una riga' : 'nessuna parola di saluto'}`);
      }
      const corpo = corpoDellaLettera(l.testo), parti = partiDellaLettera(l.testo), paragrafi = corpo.split(/\n[ \t]*\n/);
      for (const [k, rx] of Object.entries(PAROLE)) {
        if (parti[k as 'frcv']) { piu(`${k}: con etichetta`); continue; }
        const visti = [...corpo.matchAll(rx)];
        if (!visti.length) { piu(`${k}: mai nominati`); continue; }
        piu(`${k}: nominati senza etichetta`);
        const m = visti[0], i = m.index ?? 0, dopo = corpo.slice(i + m[0].length, i + m[0].length + 3);
        const par = corpo.slice(0, i).split(/\n[ \t]*\n/).length;
        const inizioRiga = /(^|\n)[ \t•\-–]*$/.test(corpo.slice(Math.max(0, i - 4), i)), inizioFrase = /(^|[.!?]\s+|\n\s*)$/.test(corpo.slice(Math.max(0, i - 6), i));
        piu(`${k}: primo nel paragrafo ${par > 3 ? '4+' : par} di ${paragrafi.length > 3 ? '4+' : paragrafi.length}`);
        piu(`${k}: ${inizioRiga ? 'a inizio riga' : inizioFrase ? 'a inizio frase' : 'dentro una frase'}${/^\s*[:(]/.test(dopo) ? ' seguito da «:» o «(»' : ''}`);
        piu(`${k}: nominati ${visti.length > 2 ? '3+' : visti.length} volte`);
      }
    }
  }
  for (const k of Object.keys(c).sort()) console.log(`${k}: ${c[k]}`);
  await pool.end();
})();
