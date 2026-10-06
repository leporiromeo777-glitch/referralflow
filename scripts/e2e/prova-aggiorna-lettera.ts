// Prova end-to-end dell'aggiornamento della lettera vecchia (28.9.2026) sul
// DB DEMO, con dati inventati: referto confermato del 14.3.2025 (la lettera
// vecchia), bozza nuova di «moccetti» che dice «riprendimi la lettera del
// 14.03.2025»; proposta, Applica, Annulla; una bozza senza richiesta non
// propone niente. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-aggiorna-lettera.ts <base> <cookie> <studio>
import { query, pool } from '../../src/lib/db';
import { togliAudit, ultimoTestoAI } from './pulizia-audit';
import { aggiornamentoAutomatico } from '../../src/lib/aggiorna-lettera-server';
import { deleteFile, putFile } from '../../src/lib/storage';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

// Una lettera di una pagina con etichette e una frase in grassetto, disegnata
// da ghostscript: la piattaforma la rilegge dall'immagine (6.10.2026).
function letteraPdf(dentroUnaCartella = false): Buffer {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-prova-forma-'));
  try {
    const n = '/Helvetica findfont 11 scalefont setfont', b = '/Helvetica-Bold findfont 11 scalefont setfont';
    const righe: [number, string][] = [
      [790, `${n} (Lugano, 10.02.2024) show`],
      [760, `${n} (${dentroUnaCartella ? 'Egregio collega,' : 'Caro Luca,'}) show`],
      [730, `${n} (rivedo in data 10.02.2024 il paziente a margine per il controllo annuale previsto presso il) show`],
      [714, `${n} (nostro studio e riferisce di stare bene.) show`],
      [684, `${b} (Diagnosi: ) show ${n} (cardiopatia ipertensiva con funzione sistolica conservata e stabile nel tempo.) show`],
      [668, `${b} (Fattori di rischio: ) show ${n} (ipertensione arteriosa trattata, dislipidemia, ex fumatore.) show`],
      [638, `${n} (Il paziente riferisce benessere, ) show ${b} (nessun dolore toracico) show ${n} ( sotto sforzo e nessuna dispnea da) show`],
      [622, `${n} (sforzo nelle attivita quotidiane svolte regolarmente a domicilio.) show`],
      [592, `${n} (Clinicamente peso 80 Kg, pressione arteriosa 125/80 mmHg, frequenza 64 battiti al minuto.) show`],
      [576, `${n} (Itto in sede, toni cardiaci validi, polmoni liberi, nessun edema declive agli arti inferiori.) show`],
      [546, `${b} (In conclusione) show ${n} ( il quadro rimane stabile e propongo un controllo fra dodici mesi.) show`],
      [516, `${n} (Cordiali saluti.) show`],
    ];
    const lettera = `${righe.map(([y, r]) => `72 ${y} moveto ${r}`).join('\n')}\nshowpage\n`;
    // Dentro una cartella scansionata: una pagina d'altro prima e una dopo.
    const altra = (t: string) => `72 760 moveto ${n} (${t}) show\n72 740 moveto ${n} (Valori nella norma senza variazioni rispetto al controllo precedente del paziente.) show\nshowpage\n`;
    writeFileSync(path.join(dir, 'l.ps'), `%!PS\n${dentroUnaCartella ? altra('Esami di laboratorio di prova') : ''}${lettera}${dentroUnaCartella ? altra('Tracciato di prova allegato') : ''}`);
    execFileSync(process.env.GS_BIN || '/opt/homebrew/bin/gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', `-sOutputFile=${path.join(dir, 'l.pdf')}`, path.join(dir, 'l.ps')], { stdio: 'ignore' });
    return readFileSync(path.join(dir, 'l.pdf'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

const VECCHIA = "Caro Luca,\n\nnon ritorno sull'anamnesi del paziente in quanto già presente nei miei incarti precedenti. Rivedo in data 14.03.2025 il paziente a margine nell'ambito di un controllo annuale. Egli riferisce di stare bene. FRCV: ipertensione arteriosa trattata, dislipidemia, ex fumatore. Comorbidità: ipotiroidismo. Clinicamente mi confronto con un paziente di 80 Kg per 175 cm, PA 130/80 mmHg. In conclusione, alla luce degli elementi di cui sopra, situazione stabile.";
const DETTATO = "Lettera al dottor Luca Prova. Riprendimi la lettera del 14.03.2025. Caro Luca, rivedo in data odierna il paziente a margine. FRCV: ipertensione arteriosa trattata, dislipidemia, ex fumatore. Comorbidità: ipotiroidismo. Da maggio diabete mellito tipo 2 in terapia con metformina. Clinicamente mi confronto con un paziente di 82 Kg per 175 cm, PA 125/78 mmHg. All'ecocardiogramma FE 60%. Dal canto mio un prossimo controllo non prima di sei mesi. Cordiali saluti.";

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  // Le prove scritte prima del 6.10.2026 valgono per la lettera più recente
  // usata SOLO COME AIUTO: quel modo resta (ripiego e scelta a mano), e qui
  // lo si tiene acceso finché non si provano, in fondo, i casi di serie.
  process.env.REFERTI_AGGIORNA_DALLA_RECENTE = 'mai';
  const ids: string[] = [];
  const pazienti: string[] = [], chiavi: string[] = [];
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
    const fz = await fetch(`${base}/api/prototipo/referti/${senza}/aggiornamento`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'stampella' }) });
    const sf = await (await fetch(`${base}/api/prototipo/referti/${senza}/aggiornamento`, { headers: h })).json();
    const gl = await fetch(`${base}/api/prototipo/referti/${senza}/aggiornamento?lettera=${vecchia}`, { headers: h });
    const gj = await gl.json().catch(() => ({}));
    const gn = await fetch(`${base}/api/prototipo/referti/${senza}/aggiornamento?lettera=${senza}`, { headers: h });
    verifica(gl.status === 200 && gj.testo === VECCHIA && gn.status === 404, '«Guarda»: il testo della lettera vecchia confermata; una bozza non confermata no (404)');
    verifica(fz.status === 200 && sf.applicato?.stampella === true && /non dice quale lettera/.test(sf.applicato?.avviso ?? '') && sf.applicato?.fonte?.id === vecchia, 'senza richiesta: «Usa la più recente solo come aiuto» a mano');
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
    // Sempre come aiuto (5.10.2026): anche se il medico non chiede nessuna
    // lettera, all'arrivo la più recente dà ortografia e impaginazione.
    const [{ id: muta }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
      [S, JSON.stringify({ testo_corretto: 'Caro Luca, rivedo il paziente. FRCV: ipertensione arteriosa trattata. Comorbidità: ipotirodismo. Clinicamente PA 118/70 mmHg. Cordiali saluti.', medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Aggiornaprova Paziente' } })]);
    ids.push(muta);
    const eMuta = await aggiornamentoAutomatico(S, muta);
    const sMuta = await (await fetch(`${base}/api/prototipo/referti/${muta}/aggiornamento`, { headers: h })).json();
    const [tMuta] = await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [muta]);
    verifica(eMuta === 'stampella' && sMuta.applicato?.stampella === true && sMuta.applicato?.automatico === true && /ipotiroidismo/.test(tMuta.t ?? '') && /PA 118\/70 mmHg/.test(tMuta.t ?? '') && !/80 Kg/.test(tMuta.t ?? ''), `senza richiesta nel dettato: la più recente usata da sola come aiuto (${eMuta})`);
    const [{ id: sola }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
      [S, JSON.stringify({ testo_corretto: 'Caro Luca, rivedo il paziente. Bene.', medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Nessunalettera Prova' } })]);
    ids.push(sola);
    verifica((await aggiornamentoAutomatico(S, sola)) === 'niente', 'paziente senza lettere vecchie: niente, la bozza resta com\'è');

    // Grassetto e a capo come nella lettera vecchia (6.10.2026): la lettera è
    // un PDF in cartella, riletto dall'immagine.
    const [{ id: pf }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Formaprova', 'Paziente', '1955-05-05') returning id`, [S]);
    pazienti.push(pf);
    const chiave = await putFile(letteraPdf(), 'application/pdf', '.pdf');
    chiavi.push(chiave);
    await query(`insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota) values ($1, $2, 'Lettera Formaprova.pdf', $3, 'lettera', 'lettera del 10.02.2024')`, [S, pf, chiave]);
    const [{ id: bf }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo, patient_id) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto', $3) returning id`,
      [S, JSON.stringify({ testo_corretto: 'Caro Luca, rivedo il paziente a margine. Diagnosi: cardiopatia ipertensiva stabile. Riferisce nessun dolore toracico sotto sforzo. Clinicamente peso 81 Kg. In conclusione quadro stabile. Cordiali saluti.', medico, dettato_il: '2026-10-06T09:00:00Z', campi_estratti: { nome_paziente: 'Formaprova Paziente' } }), pf]);
    ids.push(bf);
    const urlF = `${base}/api/prototipo/referti/${bf}/aggiornamento`;
    const eF = await aggiornamentoAutomatico(S, bf);
    const sF = await (await fetch(urlF, { headers: h })).json();
    const [tF] = await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [bf]);
    const pres: string[] = sF.forma?.presenti ?? [];
    verifica(eF === 'stampella' && sF.applicato?.fonte?.tipo === 'documento' && /a margine\.\nDiagnosi: cardiopatia/.test(tF.t ?? ''), `lettera in PDF: l'etichetta «Diagnosi:» va a capo come nella lettera vecchia (${eF})`);
    verifica(pres.includes('Diagnosi:') && pres.includes('nessun dolore toracico') && pres.includes('In conclusione') && !pres.some((x) => /Fattori/.test(x)) && pres.length === 3, `grassetto letto dall'immagine: solo le tre frasi che ricompaiono nel testo (${JSON.stringify(pres)})`);
    const fortiNelWord = async () => {
      const xml = await (await JSZip.loadAsync(Buffer.from(await (await fetch(`${base}/api/referti/docx/${bf}`, { headers: h })).arrayBuffer()))).files['word/document.xml'].async('string');
      return [...xml.matchAll(/<w:r[\s>](?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((m) => m[0]).filter((r) => /<w:b\/>/.test(r)).map((r) => /<w:t[^>]*>([^<]*)</.exec(r)?.[1] ?? '');
    };
    const w1 = await fortiNelWord();
    verifica(w1.includes('Diagnosi:') && w1.includes('nessun dolore toracico') && w1.includes('In conclusione'), `Word: le tre frasi escono in grassetto (${JSON.stringify(w1.filter((x) => /Diagnosi|dolore|conclusione/i.test(x)))})`);
    const tg = await fetch(urlF, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'forma', togli: 'In conclusione' }) });
    const w2 = await fortiNelWord();
    verifica(tg.status === 200 && !w2.includes('In conclusione') && w2.includes('Diagnosi:'), 'togliere una frase: nel Word non è più in grassetto, le altre sì');
    const sp = await fetch(urlF, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'forma', spento: true }) });
    const w3 = await fortiNelWord();
    verifica(sp.status === 200 && !w3.includes('Diagnosi:') && !w3.includes('nessun dolore toracico'), '«Togli il grassetto»: il Word esce senza');
    const anF = await fetch(urlF, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'annulla' }) });
    const sF2 = await (await fetch(urlF, { headers: h })).json();
    verifica(anF.status === 200 && sF2.forma == null && sF2.applicato == null, 'Annulla: via anche il grassetto');

    // Le CATEGORIE (6.10.2026): il dettato scrive «FRCV:», le lettere del
    // paziente hanno in grassetto «Fattori di rischio:» → stessa categoria.
    const [{ id: bc }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo, patient_id) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto', $3) returning id`,
      [S, JSON.stringify({ testo_corretto: 'Caro Luca, rivedo il paziente a margine. FRCV: ipertensione arteriosa trattata. Clinicamente peso 81 Kg. Cordiali saluti.', medico, dettato_il: '2026-10-06T10:00:00Z', campi_estratti: { nome_paziente: 'Formaprova Paziente' } }), pf]);
    ids.push(bc);
    const eC = await aggiornamentoAutomatico(S, bc);
    const sC = await (await fetch(`${base}/api/prototipo/referti/${bc}/aggiornamento`, { headers: h })).json();
    const [tC] = await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [bc]);
    const gC = (sC.forma?.grassetti ?? []).find((g: any) => /Fattori di rischio/.test(g.testo));
    verifica(eC === 'stampella' && /a margine\.\nFRCV: ipertensione/.test(tC.t ?? '') && (sC.forma?.presenti ?? []).some((x: string) => /Fattori di rischio/.test(x)) && typeof gC?.modello === 'string',
      `categorie: «FRCV:» del dettato va a capo e in grassetto come «Fattori di rischio:» delle lettere (${eC}, ${JSON.stringify(sC.forma?.presenti)})`);

    // Di serie dal 6.10.2026 (decisione dello studio): la lettera si AGGIORNA
    // dalla più recente — anamnesi e categorie riprese, sotto la visita dettata.
    delete process.env.REFERTI_AGGIORNA_DALLA_RECENTE;
    const nuovaBozza = async (testo: string) => {
      const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto') returning id`,
        [S, JSON.stringify({ testo_corretto: testo, medico, dettato_il: '2026-09-28T09:00:00Z', campi_estratti: { nome_paziente: 'Aggiornaprova Paziente' } })]);
      ids.push(id);
      return id;
    };
    const statoDi = async (id: string) => (await fetch(`${base}/api/prototipo/referti/${id}/aggiornamento`, { headers: h })).json();
    const testoDi = async (id: string) => (await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [id]))[0].t ?? '';
    const r1 = await nuovaBozza(DETTATO.replace('14.03.2025', '01.01.2020'));
    const er1 = await aggiornamentoAutomatico(S, r1);
    const sr1 = await statoDi(r1), tr1 = await testoDi(r1);
    verifica(er1 === 'applicato' && sr1.applicato?.stampella === false && sr1.applicato?.fonte?.id === vecchia && /non la trovo/.test(sr1.applicato?.avviso ?? '') && /più recente/.test(sr1.applicato?.avviso ?? ''),
      `lettera chiesta assente: aggiornata dalla più recente, con l'avviso (${er1}, ${JSON.stringify(sr1.applicato?.avviso ?? null)})`);
    verifica(tr1.includes('Rivedo in data 28.09.2026') && tr1.includes('non ritorno sull\'anamnesi') && tr1.includes('82 Kg') && !tr1.includes('80 Kg') && (sr1.applicato?.novita ?? []).length === 1,
      'dalla più recente: anamnesi e fattori di rischio ripresi, data portata a oggi, visita di oggi sotto, la frase nuova da spuntare');
    const anr1 = await fetch(`${base}/api/prototipo/referti/${r1}/aggiornamento`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'annulla' }) });
    const sr1b = await statoDi(r1);
    verifica(anr1.status === 200 && (await testoDi(r1)) === '' && sr1b.dalla_recente === true && !!sr1b.proposta && !!sr1b.stampella && /non la trovo/.test(sr1b.avviso ?? ''), 'Annulla torna al dettato; la revisione ripropone la più recente (Applica, o «Solo come aiuto»)');

    const r2 = await nuovaBozza(DETTATO.replace('Riprendimi la lettera del 14.03.2025. ', ''));
    const er2 = await aggiornamentoAutomatico(S, r2);
    const sr2 = await statoDi(r2);
    verifica(er2 === 'applicato' && /non dice quale lettera/.test(sr2.applicato?.avviso ?? '') && (await testoDi(r2)).includes('non ritorno sull\'anamnesi'), `nessuna lettera chiesta: aggiornata lo stesso dalla più recente, e lo si dice (${er2})`);

    const r3 = await nuovaBozza('Caro Luca, il paziente mi ha telefonato per un consiglio. Comorbidità: ipotirodismo. Nessuna novità di rilievo. Cordiali saluti.');
    const er3 = await aggiornamentoAutomatico(S, r3);
    const sr3 = await statoDi(r3), tr3 = await testoDi(r3);
    verifica(er3 === 'stampella' && sr3.applicato?.stampella === true && /ipotiroidismo/.test(tr3) && !tr3.includes('non ritorno sull\'anamnesi'), `dettato senza una visita (non si sa dove attaccarla): la più recente resta un aiuto, il contenuto è il dettato (${er3})`);

    const r4 = await nuovaBozza(DETTATO.replace('Riprendimi la lettera del 14.03.2025. ', ''));
    const s4 = await statoDi(r4);
    const ap4 = await fetch(`${base}/api/prototipo/referti/${r4}/aggiornamento`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'applica', recente: true, novita: [] }) });
    const sr4 = await statoDi(r4);
    verifica(s4.proposta == null && s4.applicato == null && ap4.status === 200 && sr4.applicato?.automatico === false && /non dice quale lettera/.test(sr4.applicato?.avviso ?? ''), `tasto «Aggiorna dalla più recente» nella revisione (${ap4.status})`);

    // Dall'aiuto all'aggiornamento con un tasto («Aggiorna da questa lettera»).
    const sost = (id: string) => fetch(`${base}/api/prototipo/referti/${id}/aggiornamento`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'applica', recente: true, sostituisci: true, novita: [] }) });
    const no3 = await sost(r3);
    const sr3b = await statoDi(r3);
    verifica(no3.status === 409 && /visita/.test((await no3.json()).errore ?? '') && sr3b.applicato?.stampella === true && /ipotiroidismo/.test(await testoDi(r3)), `«Aggiorna da questa lettera» dove non si può: dice perché, e l'aiuto resta com'era (${no3.status})`);
    process.env.REFERTI_AGGIORNA_DALLA_RECENTE = 'mai';
    const r5 = await nuovaBozza(DETTATO.replace('Riprendimi la lettera del 14.03.2025. ', '').replace('ipotiroidismo', 'ipotirodismo'));
    const er5 = await aggiornamentoAutomatico(S, r5);
    delete process.env.REFERTI_AGGIORNA_DALLA_RECENTE;
    const si5 = await sost(r5);
    const sr5 = await statoDi(r5);
    verifica(er5 === 'stampella' && si5.status === 200 && sr5.applicato?.stampella === false && (await testoDi(r5)).includes('non ritorno sull\'anamnesi'), `«Aggiorna da questa lettera» dove si può: dall'aiuto alla lettera aggiornata (${er5}, ${si5.status})`);

    // La lettera è DENTRO una cartella scansionata (tre pagine): la si sceglie
    // a mano e si aggiorna da lì — le categorie arrivano copiate, col grassetto.
    const [{ id: ps }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Formascan', 'Paziente', '1956-06-06') returning id`, [S]);
    pazienti.push(ps);
    const chiave2 = await putFile(letteraPdf(true), 'application/pdf', '.pdf');
    chiavi.push(chiave2);
    const [{ id: docS }] = await query<{ id: string }>(`insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota) values ($1, $2, 'Cartella Formascan.pdf', $3, 'altro', 'cartella scansionata') returning id`, [S, ps, chiave2]);
    const [{ id: bs }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo, patient_id) values ($1, 'prova-agg-' || gen_random_uuid(), $2, 'referto', $3) returning id`,
      [S, JSON.stringify({ testo_corretto: 'Lettera al dottor Luca Prova. Caro Luca, rivedo in data odierna il paziente a margine per il controllo annuale e riferisce di stare bene. Clinicamente peso 82 Kg, pressione arteriosa 120/75 mmHg. Propongo un controllo fra 6 mesi. Cordiali saluti.', medico, dettato_il: '2026-10-06T11:00:00Z', campi_estratti: { nome_paziente: 'Formascan Paziente' } }), ps]);
    ids.push(bs);
    const urlS = `${base}/api/prototipo/referti/${bs}/aggiornamento`;
    const posta = (corpo: unknown) => fetch(urlS, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const s0 = await (await fetch(urlS, { headers: h })).json();
    const voce = (s0.scelte ?? []).find((f: any) => f.tipo === 'pagine' && f.id === docS);
    verifica(!!voce && voce.da === 2 && voce.a === 2 && voce.data === '10.02.2024', `fra le lettere da scegliere c'è quella dentro la cartella scansionata, alla sua pagina (${JSON.stringify(voce ?? null)})`);
    const sc = await posta({ azione: 'scegli', fonte: { tipo: 'pagine', id: docS, da: voce?.da, a: voce?.a } });
    const s1 = await (await fetch(urlS, { headers: h })).json();
    const apS = await posta({ azione: 'applica', novita: [] });
    const [tS] = await query<{ t: string | null }>('select testo_finale as t from referti_bozze where id = $1', [bs]);
    const sS = await (await fetch(urlS, { headers: h })).json();
    verifica(sc.status === 200 && s1.fonte?.tipo === 'pagine' && !!s1.proposta && apS.status === 200 && /\nDiagnosi: cardiopatia ipertensiva[^\n]*\nFattori di rischio: ipertensione/.test(tS.t ?? '') && /82 Kg/.test(tS.t ?? '') && !/80 Kg/.test(tS.t ?? ''),
      `aggiornata dalla lettera scansionata: le categorie arrivano copiate, ognuna sulla sua riga, e sotto la visita di oggi (${sc.status}, ${apS.status})`);
    const xmlS = await (await JSZip.loadAsync(Buffer.from(await (await fetch(`${base}/api/referti/docx/${bs}`, { headers: h })).arrayBuffer()))).files['word/document.xml'].async('string');
    const fortiS = [...xmlS.matchAll(/<w:r[\s>](?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((m) => m[0]).filter((r) => /<w:b\/>/.test(r)).map((r) => /<w:t[^>]*>([^<]*)</.exec(r)?.[1] ?? '');
    verifica(fortiS.includes('Diagnosi:') && fortiS.includes('Fattori di rischio:') && (sS.forma?.presenti ?? []).length >= 2, `Word: «Diagnosi:» e «Fattori di rischio:» in grassetto come nella lettera vecchia (${JSON.stringify(fortiS.filter((x) => /:/.test(x)))})`);
  } finally {
    for (const k of chiavi) await deleteFile(k).catch(() => null);
    await query('delete from patient_documents where patient_id = any($1::uuid[])', [pazienti]).catch(() => null);
    // Lo scaricamento del Word lascia una misura del lavoro: via prima dell'audit.
    await query('delete from audit.misure_lavoro where bozza_id = any($1::uuid[])', [ids]).catch(() => null);
    await togliAudit(ids);
    await query('delete from referti_eventi where bozza_id = any($1::uuid[])', [ids]);
    await query('delete from referti_bozze where id = any($1::uuid[])', [ids]);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
