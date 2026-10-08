// Prova end-to-end della pagina Pressione (7.10.2026) sul DB DEMO, con profili
// INVENTATI: caricare un profilo delle 24 ore, i conti, la terapia, la tabella
// dei farmaci che vale solo dopo la conferma del medico, le fasce scoperte, il
// prima e dopo, le proposte di orario (accese sul server di prova) e chi può
// fare che cosa. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-pressione.ts <base> <studio> <medico> <segretaria> <tecnico>
import { promises as fs } from 'fs';
import path from 'path';
import { query, pool } from '../../src/lib/db';
import { giroCartella } from '../../src/lib/pressione/cartella-server';

const [base, S, C_MED, C_SEG, C_TEC, CARTELLA] = process.argv.slice(2);
process.env.PRESSIONE_CARTELLA = CARTELLA;
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const url = `${base}/api/prototipo/pressione`;
const leggi = async (cookie: string, coda = '') => { const r = await fetch(`${url}${coda}`, { headers: cookie ? { cookie } : {} }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
const manda = async (cookie: string, corpo: unknown) => { const r = await fetch(url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };

const due = (n: number) => String(n).padStart(2, '0');
const notte = (h: number) => h >= 22 || h < 7;
// Un profilo sintetico: una misura ogni mezz'ora per 24 ore dalle 08:00 del giorno dato (marzo 2026).
function csv(giorno: number, sis: (h: number) => number, dia: (h: number) => number): string {
  let r = 'Datum;Uhrzeit;Sys;MAP;Dia;Puls\n';
  for (let k = 0; k < 48; k++) {
    const min = 8 * 60 + k * 30, g = min >= 1440 ? giorno + 1 : giorno, h = (min % 1440) / 60;
    r += `${due(g)}.03.2026;${due(Math.floor(h))}:${due((min % 1440) % 60)};${Math.round(sis(h))};${Math.round((sis(h) + 2 * dia(h)) / 3)};${Math.round(dia(h))};70\n`;
  }
  return r;
}

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const pazienti: string[] = [];
  try {
    await query(`delete from pa_farmaci where studio_id = $1`, [S]);
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provapressione', 'Carla', '1955-06-12') returning id`, [S]);
    pazienti.push(pa);

    // 1 — chi entra.
    const fuori = await leggi(''), tec = await leggi(C_TEC), seg0 = await leggi(C_SEG);
    verifica(fuori.stato === 401 && tec.stato === 403 && seg0.stato === 200, `senza sessione niente; il tecnico non vede i dati; la segreteria sì (${fuori.stato}, ${tec.stato}, ${seg0.stato})`);
    verifica(seg0.j.farmaci?.totale >= 40 && seg0.j.farmaci?.confermati === 0, `la tabella dei farmaci nasce in bozza: ${seg0.j.farmaci?.totale} principi, nessuno confermato`);

    // 2 — la segreteria carica il file dell'apparecchio (colonne in ordine qualunque, con una colonna in più).
    const alta = csv(1, (h) => (h >= 2 && h < 8 ? 146 : notte(h) ? 110 : 128), (h) => (h >= 2 && h < 8 ? 86 : notte(h) ? 62 : 74));
    const c1 = await manda(C_SEG, { azione: 'carica', patient_id: pa, testo: alta, apparecchio: 'Apparecchio di prova' });
    verifica(c1.stato === 200 && c1.j.misure === 48 && c1.j.scartate === 0, `profilo caricato: 48 misure (${c1.stato})`);
    const P1 = c1.j.id as string;
    const doppio = await manda(C_SEG, { azione: 'carica', patient_id: pa, testo: alta });
    const vuoto = await manda(C_SEG, { azione: 'carica', patient_id: pa, testo: 'ciao\nmondo\n' });
    const nessuno = await manda(C_SEG, { azione: 'carica', patient_id: '00000000-0000-4000-8000-000000000000', testo: alta });
    verifica(doppio.stato === 409 && vuoto.stato === 400 && nessuno.stato === 404, `lo stesso profilo due volte no; un file senza misure no; un paziente che non c'è no (${doppio.stato}, ${vuoto.stato}, ${nessuno.stato})`);

    // 3 — i conti.
    const d1 = (await leggi(C_MED, `/${P1}`)).j;
    verifica(d1.statistiche?.giorno?.sis === 130.4 || Math.abs((d1.statistiche?.giorno?.sis ?? 0) - 130) < 2, `media di giorno attorno a 130 (${d1.statistiche?.giorno?.sis})`);
    verifica(d1.statistiche?.qualita?.affidabile === true && d1.statistiche?.percento_valide === 100 && typeof d1.punteggio?.totale === 'number', `registrazione affidabile, punteggio calcolato (${d1.punteggio?.totale})`);
    const f1 = (d1.fasce ?? []).filter((f: any) => f.stato === 'alta');
    verifica(f1.length === 1 && f1[0].da === 2 && f1[0].a === 8 && f1[0].sis === 146, `una fascia sopra soglia, 02:00–08:00, media 146 (${f1.map((f: any) => `${f.da}-${f.a}`).join()})`);

    // 4 — la terapia: la scrive il medico, non la segreteria; ciò che non è in tabella si dice.
    const righe = [{ nome: 'Carvedilol Mepha 25', dose: '1 cpr', orari: '08:00' }, { nome: 'Aspirina Cardio 100', dose: '1 cpr', orari: '8' }];
    const tSeg = await manda(C_SEG, { azione: 'terapia', id: P1, righe });
    const tMale = await manda(C_MED, { azione: 'terapia', id: P1, righe: [{ nome: 'Carvedilol', orari: 'la sera' }] });
    const tMed = await manda(C_MED, { azione: 'terapia', id: P1, righe });
    verifica(tSeg.stato === 403 && tMale.stato === 400 && tMed.stato === 200 && tMed.j.non_riconosciuti === 1, `terapia: la segreteria no, un orario scritto a parole no, il medico sì; un farmaco fuori tabella segnalato (${tSeg.stato}, ${tMale.stato}, ${tMed.stato})`);
    const d2 = (await leggi(C_MED, `/${P1}`)).j;
    verifica((d2.copertura ?? []).length === 0 && d2.terapie?.[0]?.farmaci?.[0]?.principio === 'carvedilolo' && d2.terapie[0].farmaci[0].confermato === false,
      'riconosciuto il principio attivo, ma NESSUNA finestra d’azione finché i suoi numeri non sono confermati');

    // 5 — la tabella dei farmaci: la conferma il medico, coi numeri controllati; un numero cambiato toglie la conferma.
    const numeri = { principio: 'carvedilolo', inizio_h: 1, picco_h: 1.5, durata_h: 14, emivita_h: 4 };
    const fSeg = await manda(C_SEG, { azione: 'farmaco', ...numeri, conferma: true });
    const fMale = await manda(C_MED, { azione: 'farmaco', ...numeri, picco_h: 30, conferma: true });
    const fMed = await manda(C_MED, { azione: 'farmaco', ...numeri, conferma: true });
    verifica(fSeg.stato === 403 && fMale.stato === 400 && fMed.stato === 200, `conferma di un farmaco: la segreteria no, numeri incoerenti no, il medico sì (${fSeg.stato}, ${fMale.stato}, ${fMed.stato})`);
    const d3 = (await leggi(C_MED, `/${P1}`)).j;
    const fa = (d3.fasce ?? []).find((f: any) => f.stato === 'alta');
    verifica((d3.copertura ?? []).length === 1 && d3.copertura[0].livelli.length === 24 && fa?.scoperta === true && (fa?.al_minimo ?? []).includes('carvedilolo'),
      'dopo la conferma la finestra c’è, e la fascia sopra soglia risulta scoperta: il farmaco lì è sotto metà del suo effetto');
    await manda(C_MED, { azione: 'farmaco', ...numeri, durata_h: 16, conferma: false });
    const d4 = (await leggi(C_MED, `/${P1}`)).j;
    verifica((d4.copertura ?? []).length === 0, 'cambiare un numero toglie la conferma, e la finestra sparisce');
    await manda(C_MED, { azione: 'farmaco', ...numeri, conferma: true });

    // 6 — le proposte di orario (accese sul server di prova): le chiede e le decide il medico.
    const pSeg = await manda(C_SEG, { azione: 'proponi', id: P1 });
    const pMed = await manda(C_MED, { azione: 'proponi', id: P1 });
    verifica(pSeg.stato === 403 && pMed.stato === 200 && pMed.j.proposte === 1, `proposte: la segreteria no; al medico una proposta (${pSeg.stato}, ${pMed.j.proposte})`);
    const d5 = (await leggi(C_MED, `/${P1}`)).j;
    const pr = d5.proposte?.[0];
    verifica(d5.proposte_accese === true && pr?.stato === 'aperta' && pr.contenuto?.da === '08:00' && ['20:00', '22:00'].includes(pr.contenuto?.a) && (pr.contenuto?.perche ?? []).length === 3 && /ipotesi di lavoro/.test(pr.contenuto?.ipotesi ?? ''),
      `la proposta sposta il carvedilolo dalle 08:00 alla sera (${pr?.contenuto?.a}), coi numeri da cui nasce e l'ipotesi dichiarata`);
    const dMale = await manda(C_MED, { azione: 'decidi', id: pr?.id, stato: 'modificata' });
    const dSeg = await manda(C_SEG, { azione: 'decidi', id: pr?.id, stato: 'accettata' });
    const dMed = await manda(C_MED, { azione: 'decidi', id: pr?.id, stato: 'modificata', orario: '21:00' });
    const dBis = await manda(C_MED, { azione: 'decidi', id: pr?.id, stato: 'scartata' });
    verifica(dMale.stato === 400 && dSeg.stato === 403 && dMed.stato === 200 && dBis.stato === 404, `decidere: senza orario no, la segreteria no, il medico sceglie un altro orario, e una volta decisa non si ridecide (${dMale.stato}, ${dSeg.stato}, ${dMed.stato}, ${dBis.stato})`);
    const d6 = (await leggi(C_MED, `/${P1}`)).j;
    verifica(d6.proposte?.[0]?.stato === 'modificata' && d6.proposte[0].orario_scelto === '21:00' && !!d6.proposte[0].decisa_da, 'resta scritto che cosa ha deciso il medico, e chi');

    // 7 — il monitoraggio dopo: la terapia si riprende dal profilo precedente, e c'è il prima e dopo.
    const meglio = csv(20, (h) => (h >= 3 && h < 6 ? 124 : notte(h) ? 110 : 128), (h) => (notte(h) ? 62 : 74));
    const c2 = await manda(C_SEG, { azione: 'carica', patient_id: pa, testo: meglio });
    const P2 = c2.j.id as string;
    const d7 = (await leggi(C_MED, `/${P2}`)).j;
    verifica(c2.stato === 200 && d7.terapie?.length === 2 && d7.terapie[0].nome === 'Carvedilol Mepha 25', 'secondo profilo: la terapia è ripresa dal precedente, da controllare');
    verifica(d7.precedente?.id === P1 && d7.precedente.confronto?.punteggio > 0 && d7.precedente.confronto?.ore_in_bersaglio > 0, `prima e dopo: punteggio ${d7.precedente?.confronto?.punteggio > 0 ? '+' : ''}${d7.precedente?.confronto?.punteggio}, ore in bersaglio +${d7.precedente?.confronto?.ore_in_bersaglio}`);
    const el = (await leggi(C_MED, `?paziente=${pa}`)).j;
    verifica((el.profili ?? []).length === 2 && el.profili[0].id === P2 && el.profili[0].punteggio > el.profili[1].punteggio, 'elenco dei profili del paziente: dal più recente, col punteggio');

    // 8 — giorno, notte e soglie: le soglie le cambia il medico.
    const sSeg = await manda(C_SEG, { azione: 'impostazioni', id: P2, sveglia: '06:00' });
    const sMale = await manda(C_MED, { azione: 'impostazioni', id: P2, soglie: { giorno_sis: 80, giorno_dia: 85 } });
    const sMed = await manda(C_MED, { azione: 'impostazioni', id: P2, sveglia: '06:30', sonno: '23:00', soglie: { notte_sis: 125 } });
    const d8 = (await leggi(C_MED, `/${P2}`)).j;
    verifica(sSeg.stato === 403 && sMale.stato === 400 && sMed.stato === 200 && d8.impostazioni?.sveglia === '06:30' && d8.impostazioni?.soglie?.notte_sis === 125 && d8.impostazioni.soglie.giorno_sis === 135,
      `impostazioni: la segreteria no, soglie incoerenti no, il medico sì — e i conti le usano (${sSeg.stato}, ${sMale.stato}, ${sMed.stato})`);

    // 9 — il registro dice chi ha fatto che cosa, senza nessun valore di pressione né nome.
    const reg = await query<{ azione: string; dettaglio: Record<string, unknown> }>(`select azione, dettaglio from pa_registro where studio_id = $1`, [S]);
    const chiavi = new Set(reg.flatMap((r) => Object.keys(r.dettaglio)));
    verifica(reg.length >= 8 && ['profilo_caricato', 'terapia_salvata', 'farmaco_confermato', 'proposte_generate', 'proposta_modificata'].every((a) => reg.some((r) => r.azione === a))
      && [...chiavi].every((k) => ['misure', 'scartate', 'righe', 'principio', 'proposte', 'versione', 'soglie'].includes(k)), `registro: ${reg.length} righe, solo azioni e conteggi`);

    // 10 — eliminare un profilo: il medico sì, la segreteria no; con lui vanno via misure e terapia.
    const eSeg = await manda(C_SEG, { azione: 'elimina', id: P2 });
    const eMed = await manda(C_MED, { azione: 'elimina', id: P2 });
    const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from pa_misure where profilo_id = $1`, [P2]);
    verifica(eSeg.stato === 403 && eMed.stato === 200 && n === 0 && (await leggi(C_MED, `/${P2}`)).stato === 404, `eliminare: la segreteria no, il medico sì, e le misure non restano (${eSeg.stato}, ${eMed.stato})`);

    // 11 — la cartella condivisa: un file messo lì si legge da solo.
    await fs.rm(CARTELLA, { recursive: true, force: true }); await fs.mkdir(CARTELLA, { recursive: true });
    const esiste = async (...p: string[]) => fs.access(path.join(CARTELLA, ...p)).then(() => true, () => false);
    const giorno = (g: number) => csv(g, (h) => (notte(h) ? 112 : 130), (h) => (notte(h) ? 62 : 76));
    // a) il nome del file dice chi è: nome e data di nascita combaciano con una persona sola → profilo, da solo.
    await fs.writeFile(path.join(CARTELLA, 'Provapressione Carla 12.06.1955.csv'), giorno(24));
    const presto = await giroCartella();                                   // appena scritto: lo stanno forse ancora copiando
    const g1 = await giroCartella({ fermoDaMs: 0 });
    const [n1] = await query<{ n: number }>(`select count(*)::int as n from pa_profili where patient_id = $1 and inizio::date = '2026-03-24'`, [pa]);
    verifica(presto.visti === 0 && g1.profili === 1 && n1.n === 1 && await esiste('Letti', 'Provapressione Carla 12.06.1955.csv') && !(await esiste('Provapressione Carla 12.06.1955.csv')),
      `cartella: un file appena scritto si lascia stare; poi «Cognome Nome data di nascita» diventa un profilo da solo e passa in «Letti» (${g1.profili})`);
    // b) lo stesso file rimesso: non raddoppia.
    await fs.writeFile(path.join(CARTELLA, 'Provapressione Carla 12.06.1955.csv'), giorno(24));
    const g2 = await giroCartella({ fermoDaMs: 0 });
    verifica(g2.gia_caricati === 1 && g2.profili === 0, 'lo stesso profilo rimesso nella cartella non si carica due volte');
    // c) chi è scritto DENTRO il file, sopra la tabella, vale come il nome del file.
    await fs.writeFile(path.join(CARTELLA, 'export_0007.csv'), `Paziente: Provapressione Carla\nData di nascita: 12.06.1955\n\n${giorno(26)}`);
    const g3 = await giroCartella({ fermoDaMs: 0 });
    verifica(g3.profili === 1, 'nome e data di nascita nelle prime righe del file: profilo da solo anche con un nome di file qualunque');
    // d) niente che dica di chi è → «da assegnare»; un omonimo senza data di nascita pure.
    await fs.writeFile(path.join(CARTELLA, 'export_0042.csv'), giorno(28));
    await fs.writeFile(path.join(CARTELLA, 'Provapressione Carla.csv'), giorno(30));
    const g4 = await giroCartella({ fermoDaMs: 0 });
    const lista = (await leggi(C_SEG)).j;
    verifica(g4.in_attesa === 2 && g4.profili === 0 && (lista.arrivi ?? []).length === 2 && lista.arrivi.every((x: any) => x.misure === 48 && x.motivo === 'senza_dati'),
      `senza nome e data di nascita completi il file aspetta «da assegnare», non si indovina (${g4.in_attesa})`);
    const arrivo = lista.arrivi.find((x: any) => x.nome_file === 'export_0042.csv'), altro = lista.arrivi.find((x: any) => x.nome_file === 'Provapressione Carla.csv');
    const aTec = await manda(C_TEC, { azione: 'assegna', id: arrivo.id, patient_id: pa });
    const aSenza = await manda(C_SEG, { azione: 'assegna', id: arrivo.id });
    const aSeg = await manda(C_SEG, { azione: 'assegna', id: arrivo.id, patient_id: pa });
    const aBis = await manda(C_SEG, { azione: 'assegna', id: arrivo.id, patient_id: pa });
    verifica(aTec.stato === 403 && aSenza.stato === 400 && aSeg.stato === 200 && !!aSeg.j.id && aBis.stato === 404, `assegnare: il tecnico no, senza paziente no, la segreteria sì e nasce il profilo, due volte no (${aTec.stato}, ${aSenza.stato}, ${aSeg.stato}, ${aBis.stato})`);
    const sc = await manda(C_SEG, { azione: 'scarta_arrivo', id: altro.id });
    const [vuoti] = await query<{ n: number }>(`select count(*)::int as n from pa_arrivi where studio_id = $1 and stato <> 'in_attesa' and testo <> ''`, [S]);
    verifica(sc.stato === 200 && ((await leggi(C_SEG)).j.arrivi ?? []).length === 0 && vuoti.n === 0, 'scartare toglie il file dalla lista; assegnato o scartato, il testo del file non resta negli arrivi');
    // e) ciò che non si legge va in «Non letti», col perché scritto accanto.
    await fs.writeFile(path.join(CARTELLA, 'profilo.xlsx'), 'PK finto');
    await fs.writeFile(path.join(CARTELLA, 'appunti.csv'), 'ciao\nmondo\n');
    await fs.writeFile(path.join(CARTELLA, '.DS_Store'), 'x');
    const g5 = await giroCartella({ fermoDaMs: 0 });
    const perche = await fs.readFile(path.join(CARTELLA, 'Non letti', 'profilo.xlsx.perche.txt'), 'utf-8').catch(() => '');
    verifica(g5.non_letti === 2 && /salvalo come CSV/.test(perche) && await esiste('Non letti', 'appunti.csv') && await esiste('.DS_Store'), `un foglio Excel e un file senza misure vanno in «Non letti» col perché; i file di sistema non si toccano (${g5.non_letti})`);
    // f) la pagina sa dov'è la cartella e se è condivisa; il file per Windows esiste solo se lo è.
    const win = await fetch(`${url}?cartella=win`, { headers: { cookie: C_SEG } });
    verifica(lista.cartella?.nome === path.basename(CARTELLA) && lista.cartella?.condivisa === false && win.status === 409, `la pagina dice che la cartella non è ancora condivisa in rete, e non dà un collegamento che non funzionerebbe (${win.status})`);
  } finally {
    await query(`delete from pa_arrivi where studio_id = $1`, [S]).catch(() => null);
    await fs.rm(CARTELLA, { recursive: true, force: true }).catch(() => null);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]);
    await query(`delete from pa_registro where studio_id = $1`, [S]).catch(() => null);
    await query(`delete from pa_farmaci where studio_id = $1`, [S]).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
