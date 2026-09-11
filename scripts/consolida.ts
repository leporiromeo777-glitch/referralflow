// Consolidatore notturno (11.9.2026): legge correzioni ed esiti e SCRIVE
// PROPOSTE nella wiki (docs/wiki/Proposte/<data>.md + Ultime.md), mai nel
// codice, mai nei prompt. Le approva una persona: dizionario nel cruscotto,
// frasi fisse e attenzioni nelle pagine Agenti/, tappe da guardare nelle
// decisioni. Contenuto: solo parole, frasi generiche senza nomi, numeri.
// Uso: npm run consolida   (launchd ch.referralflow.consolidatore alle 03:30)
import fs from 'fs';
import path from 'path';
import { query } from '../src/lib/db';
import { proposteDizionario } from '../src/lib/audit/dizionario';
import { frasiCandidate } from '../src/lib/audit/frasi';
import { attribuisci, riepilogo, NOMI_TAPPE, type Passo } from '../src/lib/audit/attribuzione';
import { statistiche } from '../src/lib/audit/metriche';

const oggi = new Date().toISOString().slice(0, 10);
const radice = process.cwd();
const cartella = path.join(radice, 'docs', 'wiki', 'Proposte');

function frasiGia(medicoId: string): string[] {
  try {
    const pagina = fs.readFileSync(path.join(radice, 'docs', 'wiki', 'Agenti', `${medicoId[0].toUpperCase()}${medicoId.slice(1)}.md`), 'utf8');
    const sez = pagina.split(/^## /m).find((s) => s.toLowerCase().startsWith('frasi fisse')) ?? '';
    return sez.split('\n').filter((r) => r.trim().startsWith('-')).map((r) => r.replace(/^\s*-\s*/, '').trim());
  } catch { return []; }
}

async function main() {
  const studi = await query<{ id: string; nome: string }>(`select id, nome from studios where attivo = true order by nome`);
  const righe: string[] = ['---', 'tipo: proposte', `aggiornata: ${oggi}`, '---', `# Proposte del ${oggi}`, '',
    'Scritte dal consolidatore notturno. Niente entra da solo: ogni voce va confermata da una persona (dizionario nel cruscotto Qualità AI, frasi fisse e attenzioni nelle pagine [[Agenti/Come funziona|Agenti/]], decisioni nel [[Decisioni/Registro]]).', ''];
  for (const st of studi) {
    righe.push(`## ${st.nome}`, '');
    // 1. Quanto corregge la segretaria, ultimi 30 giorni contro i 30 prima.
    const edits = await query<{ edit_count: number; created_at: string; medico: string | null }>(
      `select edit_count, created_at::text, medico from audit.human_edits where studio_id = $1 and editor_role = 'SECRETARY' and created_at > now() - interval '60 days' order by created_at`, [st.id]);
    const ora = Date.now();
    const rec = edits.filter((e) => ora - new Date(e.created_at).getTime() < 30 * 86400000).map((e) => e.edit_count);
    const prec = edits.filter((e) => ora - new Date(e.created_at).getTime() >= 30 * 86400000).map((e) => e.edit_count);
    const sr = statistiche(rec), sp = statistiche(prec);
    righe.push('### Andamento', '', `- Referti confermati dalla segretaria negli ultimi 30 giorni: ${rec.length} (mediana correzioni ${sr.mediana ?? '—'}, media ${sr.media === null || sr.media === undefined ? '—' : Math.round(sr.media * 10) / 10}); nei 30 prima: ${prec.length} (mediana ${sp.mediana ?? '—'}).`, '');

    // 2. Quale tappa aiuta davvero.
    const bozze = await query<{ bozza_id: string }>(`select distinct bozza_id::text from audit.human_edits where studio_id = $1 and editor_role = 'SECRETARY'`, [st.id]);
    const ids = bozze.map((b) => b.bozza_id);
    const perReferto: Passo[][] = [];
    if (ids.length) {
      const versioni = await query<{ bozza_id: string; label: string; version_no: number; producer_type: string; content_text: string | null }>(
        `select bozza_id::text, label, version_no, producer_type, content_text from audit.artifacts where studio_id = $1 and kind = 'text' and content_text is not null and bozza_id = any($2::uuid[]) order by bozza_id, version_no`, [st.id, ids]);
      const finali = await query<{ bozza_id: string; testo: string }>(
        `select h.bozza_id::text, a.content_text as testo from audit.human_edits h join audit.artifacts a on a.id = h.to_artifact_id where h.studio_id = $1 and h.editor_role = 'SECRETARY' and h.bozza_id = any($2::uuid[])`, [st.id, ids]);
      const perBozza = new Map<string, typeof versioni>();
      for (const v of versioni) perBozza.set(v.bozza_id, [...(perBozza.get(v.bozza_id) ?? []), v]);
      for (const f of finali) {
        const vs = perBozza.get(f.bozza_id);
        if (vs && f.testo) perReferto.push(attribuisci(vs.map((v) => ({ label: v.label, version_no: v.version_no, testo: v.content_text ?? '', producer_type: v.producer_type })), f.testo));
      }
    }
    const tappe = riepilogo(perReferto);
    if (tappe.length) {
      righe.push('### Quale tappa aiuta davvero', '', '| tappa | referti | avvicina | allontana | delta medio |', '|---|---|---|---|---|');
      for (const t of tappe) righe.push(`| ${NOMI_TAPPE[t.label] ?? t.label} | ${t.referti} | ${t.avvicina} | ${t.allontana} | ${t.delta_medio > 0 ? '+' : ''}${t.delta_medio} |`);
      const sospette = tappe.filter((t) => t.referti >= 3 && t.allontana > t.avvicina);
      righe.push('', sospette.length ? `Da guardare: ${sospette.map((t) => NOMI_TAPPE[t.label] ?? t.label).join(', ')} (allontana più spesso di quanto avvicini).` : 'Nessuna tappa allontana più spesso di quanto avvicini.', '');
    }

    // 3. Dizionario dalle correzioni (non ancora decise).
    const modifiche = await query<{ medico: string | null; bozza_id: string; created_at: string; diff: unknown }>(
      `select medico, bozza_id::text, created_at::text, diff from audit.human_edits where studio_id = $1 and editor_role = 'SECRETARY' and created_at > now() - interval '180 days' and medico is not null`, [st.id]);
    const decise = await query<{ medico: string; da: string }>(`select medico, da from referti_dizionario where studio_id = $1`, [st.id]);
    const prop = proposteDizionario(modifiche).filter((p) => !decise.some((d) => d.medico === p.medico && d.da.toLowerCase() === p.da.toLowerCase()));
    const ricorrenti = prop.filter((p) => p.occorrenze >= 2);
    righe.push('### Dizionario: voci ricorrenti non ancora decise', '');
    if (ricorrenti.length) for (const p of ricorrenti.slice(0, 20)) righe.push(`- ${p.medico}: \`${p.da}\` → \`${p.a}\` (${p.occorrenze} volte in ${p.bozze} referti) — decidere nel cruscotto`);
    else righe.push(`- nessuna voce ricorrente (${prop.length} viste una volta sola)`);
    righe.push('');

    // 4. Frasi che il medico ripete (non ancora nella pagina Agenti).
    const lettere = await query<{ medico: string; id: string; testo: string; nome: string | null }>(
      `select payload->'medico'->>'id' as medico, id::text, testo_finale as testo, coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente') as nome
         from referti_bozze where studio_id = $1 and stato = 'confermata' and tipo = 'referto' and testo_finale is not null
           and coalesce((payload->>'ombra')::boolean, false) = false and payload->'medico'->>'id' is not null order by reviewed_at desc limit 300`, [st.id]);
    righe.push('### Frasi fisse da copiare nelle pagine Agenti/<medico>', '');
    let almenoUna = false;
    for (const medicoId of new Set(lettere.map((l) => l.medico))) {
      const mie = lettere.filter((l) => l.medico === medicoId).map((l) => ({ id: l.id, testo: l.testo, nomi: l.nome ? [l.nome] : [] }));
      const cand = frasiCandidate(mie, frasiGia(medicoId));
      for (const c of cand.slice(0, 10)) { righe.push(`- ${medicoId}: «${c.frase}» (in ${c.lettere} lettere)`); almenoUna = true; }
    }
    if (!almenoUna) righe.push('- nessuna frase nuova ripetuta in almeno tre lettere');
    righe.push('');
  }
  fs.mkdirSync(cartella, { recursive: true });
  const testo = righe.join('\n') + '\n';
  fs.writeFileSync(path.join(cartella, `${oggi}.md`), testo, 'utf8');
  fs.writeFileSync(path.join(cartella, 'Ultime.md'), testo.replace(`# Proposte del ${oggi}`, `# Ultime proposte (${oggi})`), 'utf8');
  console.log(`consolidatore: scritto docs/wiki/Proposte/${oggi}.md (${righe.length} righe, ${studi.length} studi)`);
}

main().then(() => process.exit(0), (e) => { console.error('consolidatore: errore', e instanceof Error ? e.message : String(e)); process.exit(1); });
