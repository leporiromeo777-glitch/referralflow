// Prova end-to-end dell'aggiornamento della lettera vecchia (28.9.2026) sul
// DB DEMO, con dati inventati: referto confermato del 14.3.2025 (la lettera
// vecchia), bozza nuova di «moccetti» che dice «riprendimi la lettera del
// 14.03.2025»; proposta, Applica, Annulla; una bozza senza richiesta non
// propone niente. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-aggiorna-lettera.ts <base> <cookie> <studio>
import { query, pool } from '../../src/lib/db';
import { togliAudit, ultimoTestoAI } from './pulizia-audit';
import { aggiornamentoAutomatico } from '../../src/lib/aggiorna-lettera-server';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

const VECCHIA = "Caro Luca,\n\nnon ritorno sull'anamnesi del paziente in quanto già presente nei miei incarti precedenti. Rivedo in data 14.03.2025 il paziente a margine nell'ambito di un controllo annuale. Egli riferisce di stare bene. FRCV: ipertensione arteriosa trattata, dislipidemia, ex fumatore. Comorbidità: ipotiroidismo. Clinicamente mi confronto con un paziente di 80 Kg per 175 cm, PA 130/80 mmHg. In conclusione, alla luce degli elementi di cui sopra, situazione stabile.";
const DETTATO = "Lettera al dottor Luca Prova. Riprendimi la lettera del 14.03.2025. Caro Luca, rivedo in data odierna il paziente a margine. FRCV: ipertensione arteriosa trattata, dislipidemia, ex fumatore. Comorbidità: ipotiroidismo. Da maggio diabete mellito tipo 2 in terapia con metformina. Clinicamente mi confronto con un paziente di 82 Kg per 175 cm, PA 125/78 mmHg. All'ecocardiogramma FE 60%. Dal canto mio un prossimo controllo non prima di sei mesi. Cordiali saluti.";

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const ids: string[] = [];
  const h = { cookie };
  const medico = { id: 'moccetti', nome: 'Dr. med. Prova Moccetti', formato: 'lettera' };
  try {
    const [{ id: vecchia }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo, stato, testo_finale, campi_confermati, reviewed_at) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto', 'confermata', $3, $4, now()) returning id`,
      [S, JSON.stringify({ testo_corretto: VECCHIA, medico, dettato_il: '2025-03-14T09:00:00Z' }), VECCHIA, JSON.stringify({ nome_paziente: 'Aggiornaprova, Paziente' })]);
    ids.push(vecchia);
    const [{ id: boz }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
      [S, JSON.stringify({ testo_corretto: DETTATO, medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Aggiornaprova Paziente' } })]);
    ids.push(boz);
    const url = `${base}/api/prototipo/referti/${boz}/aggiornamento`;
    const s = await (await fetch(url, { headers: h })).json();
    verifica(s.abilitato === true && s.richiesta?.dal_dettato === true && s.richiesta?.data === '14.3.2025', `richiesta letta dal dettato (${JSON.stringify(s.richiesta)})`);
    verifica(s.fonte?.tipo === 'referto' && s.fonte?.id === vecchia, 'lettera vecchia: il referto confermato del 14.3.2025 (nome con la virgola compreso)');
    verifica(s.proposta?.mesi === 6 && s.proposta?.novita?.length === 1 && /diabete/.test(s.proposta.novita[0]), 'proposta: 6 mesi dal dettato, una frase nuova (il diabete)');
    const ap = await fetch(url, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'applica', novita: [0] }) });
    const [dopo] = await query<{ t: string }>('select testo_finale as t from referti_bozze where id = $1', [boz]);
    verifica(ap.status === 200 && dopo.t.includes('Rivedo in data 28.09.2026') && dopo.t.includes('diabete mellito') && dopo.t.includes('82 Kg') && !dopo.t.includes('80 Kg') && dopo.t.endsWith('rivalutazione anticipata.'), 'applica: parte vecchia con la data di oggi, frase nuova aggiunta, visita di oggi, frase finale');
    verifica((await ultimoTestoAI(boz)) === dopo.t, 'applica: la lettera aggiornata è la base della misura delle correzioni (non conta come correzione umana)');
    const s2 = await (await fetch(url, { headers: h })).json();
    verifica(!!s2.applicato && s2.applicato.novita_aggiunte === 1, `dopo Applica: segnato come applicato (${JSON.stringify(s2).slice(0, 300)})`);
    const an = await fetch(url, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'annulla' }) });
    const [annullato] = await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [boz]);
    verifica(an.status === 200 && annullato.t == null, `annulla: torna il testo di prima (${an.status} ${annullato.t == null})`);
    const [dett] = await query<{ t: string }>(`select payload->>'testo_corretto' as t from referti_bozze where id = $1`, [boz]);
    verifica((await ultimoTestoAI(boz)) === dett.t, 'annulla: la base della misura torna il dettato');
    // Dentro la catena: appena arriva la bozza, la lettera aggiornata è già il
    // suo testo (senza la frase nuova, che resta da spuntare).
    const [{ id: auto }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
      [S, JSON.stringify({ testo_corretto: DETTATO, medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Aggiornaprova Paziente' } })]);
    ids.push(auto);
    const esito = await aggiornamentoAutomatico(S, auto);
    const [ta] = await query<{ t: string }>('select testo_finale as t from referti_bozze where id = $1', [auto]);
    verifica(esito === 'applicato' && ta.t.includes('Rivedo in data 28.09.2026') && !ta.t.includes('diabete') && ta.t.endsWith('rivalutazione anticipata.'), `automatico: lettera aggiornata applicata all'arrivo, frase nuova non aggiunta (${esito})`);
    const sa = await (await fetch(`${base}/api/prototipo/referti/${auto}/aggiornamento`, { headers: h })).json();
    verifica(sa.applicato?.automatico === true && sa.applicato?.novita?.length === 1, 'automatico: segnato come fatto dalla catena, la frase nuova resta da spuntare');
    const ag = await fetch(`${base}/api/prototipo/referti/${auto}/aggiornamento`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'aggiungi', novita: [0] }) });
    const [tb] = await query<{ t: string }>('select testo_finale as t from referti_bozze where id = $1', [auto]);
    verifica(ag.status === 200 && /ipotiroidismo\. Da maggio diabete mellito/.test(tb.t), 'aggiungi: la frase nuova entra in fondo all\'anamnesi ripresa');
    const [{ id: senza }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
      [S, JSON.stringify({ testo_corretto: 'Caro Luca, rivedo il paziente. Clinicamente bene.', medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Aggiornaprova Paziente' } })]);
    ids.push(senza);
    const s3 = await (await fetch(`${base}/api/prototipo/referti/${senza}/aggiornamento`, { headers: h })).json();
    verifica(s3.richiesta == null && s3.proposta == null && (s3.scelte ?? []).some((f: any) => f.id === vecchia), 'senza richiesta nel dettato: nessuna proposta, la lettera c\'è tra le scelte a mano');
    // Lettera chiesta che non c'è (1.10.2026): si usa la più recente come
    // aiuto (ortografia e impaginazione), il contenuto resta il dettato e
    // l'avviso resta.
    const DETTATO_ASSENTE = "Lettera al dottor Luca Prova. Riprendimi la lettera del 3 febbraio 2026. Caro Luca, rivedo il paziente. FRCV: ipertensione arteriosa trattata. Comorbidità: ipotirodismo. Clinicamente PA 120/75 mmHg. Cordiali saluti.";
    const [{ id: manca }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
      [S, JSON.stringify({ testo_corretto: DETTATO_ASSENTE, medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Aggiornaprova Paziente' } })]);
    ids.push(manca);
    const em = await aggiornamentoAutomatico(S, manca);
    const [tm] = await query<{ t: string }>('select testo_finale as t from referti_bozze where id = $1', [manca]);
    verifica(em === 'stampella' && /ipotiroidismo/.test(tm.t) && !/ipotirodismo/.test(tm.t) && /PA 120\/75 mmHg/.test(tm.t) && !/14\.03\.2025|80 Kg/.test(tm.t), `lettera chiesta assente: la più recente come aiuto, ortografia corretta, contenuto dettato (${em})`);
    const sm = await (await fetch(`${base}/api/prototipo/referti/${manca}/aggiornamento`, { headers: h })).json();
    verifica(sm.applicato?.stampella === true && /non la trovo/.test(sm.applicato?.avviso ?? '') && sm.applicato?.fonte?.id === vecchia && (sm.applicato?.correzioni ?? []).some((c: any) => c.a === 'ipotiroidismo'), 'lettera chiesta assente: l\'avviso resta, fonte e correzioni visibili');
    const am = await fetch(`${base}/api/prototipo/referti/${manca}/aggiornamento`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'annulla' }) });
    const [tn] = await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [manca]);
    verifica(am.status === 200 && tn.t == null, 'lettera chiesta assente: Annulla torna al dettato');
  } finally {
    await togliAudit(ids);
    await query('delete from referti_eventi where bozza_id = any($1::uuid[])', [ids]);
    await query('delete from referti_bozze where id = any($1::uuid[])', [ids]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
