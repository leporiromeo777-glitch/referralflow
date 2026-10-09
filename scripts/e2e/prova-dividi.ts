// Prova end-to-end di «Dividi cartella» (9.10.2026) sul DB DEMO, con una cartella INVENTATA
// (un PDF di otto pagine fatto qui con ghostscript: una lettera di due pagine col retro bianco,
// un laboratorio, un ecocardiogramma, una lettera di dimissione di due pagine col retro).
// La proposta, la conferma con una correzione, i documenti creati, lo zip, i permessi. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-dividi.ts <base> <studio> <segretaria> <tecnico> <cartella tmp>
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';

const [base, S, C_SEG, C_TEC, TMP] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const url = `${base}/api/prototipo/dividi`;
const leggi = async (cookie: string, coda: string) => { const r = await fetch(`${url}${coda}`, { headers: cookie ? { cookie } : {} }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
const manda = async (cookie: string, corpo: unknown) => fetch(url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

const PAGINE: string[][] = [
  ['Studio di Prova', 'Via Inventata 1 - 6900 Lugano', 'Lugano, 12 marzo 2019', 'Concerne: Signora Provadividi Anna, nata il 03.04.1950', 'Egregio collega,',
    'ho rivisto la paziente a margine per il controllo annuale. Riferisce di stare bene.', 'Pagina 1 di 2'],
  ['prosegue la terapia in corso senza modifiche e la rivedro fra dodici mesi.', 'Con i migliori saluti', 'Dr. med. Inventato', 'Pagina 2 di 2'],
  [],
  ['Laboratorio di Prova SA', 'Risultati di laboratorio', 'Prelievo del 02.02.2019', 'Paziente: Provadividi Anna, nata il 03.04.1950', 'Emoglobina 13,9 g/dl', 'Creatinina 71 umol/l'],
  ['Ecocardiogramma transtoracico', 'Data: 15.05.2020', 'Ventricolo sinistro di dimensioni normali con funzione sistolica conservata.', 'Non valvulopatie di rilievo.'],
  ['Ospedale di Prova', 'Bellinzona, 3.11.2021', 'Lettera di dimissione', 'Gentile collega,', 'la paziente e stata ricoverata presso il nostro reparto per accertamenti.', 'Distinti saluti'],
  ['e pertanto si consiglia un controllo ambulatoriale presso il curante entro quattro settimane.', 'Terapia alla dimissione invariata.'],
  [],
];
async function cartella(file: string): Promise<void> {
  const ps = PAGINE.map((righe) => { let y = 770; return `${righe.map((x) => { const r = `50 ${y} moveto (${x.replace(/[()\\]/g, '')}) show`; y -= 18; return r; }).join('\n')}\nshowpage`; }).join('\n');
  const src = `${file}.ps`;
  await fs.writeFile(src, `%!PS\n/Helvetica findfont 11 scalefont setfont\n${ps}\n`);
  execFileSync(process.env.GS_BIN || '/opt/homebrew/bin/gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', `-sOutputFile=${file}`, src], { stdio: 'ignore' });
  await fs.rm(src, { force: true });
}

// Una cartella cartacea coi fogli separatori: il codice a barre (Code 39) lo si disegna qui, barra per barra.
const C39: Record<string, string> = { '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001', '5': '100110000', '7': '000100101', P: '001010010', Z: '011010000', '*': '010010100' };
function barre(codice: string, x0: number, y: number): string {
  let x = x0; const ps: string[] = [];
  for (const c of `*${codice}*`) {
    [...C39[c]].forEach((largo, k) => { const w = largo === '1' ? 5 : 2; if (k % 2 === 0) ps.push(`${x} ${y} ${w} 50 rectfill`); x += w; });
    x += 2;
  }
  return `${ps.join(' ')} 50 ${y - 20} moveto (*${codice}*) show`;
}
const lettera = (giorno: string, n: string) => [`50 770 moveto (Studio di Prova) show 50 752 moveto (Lugano, ${giorno}) show 50 734 moveto (Concerne: Signora Provadividi Anna, nata il 03.04.1950) show 50 716 moveto (Egregio collega,) show 50 698 moveto (ho rivisto la paziente per il controllo ${n}. Riferisce di stare bene e non lamenta disturbi.) show 50 680 moveto (Pagina 1 di 2) show`,
  `50 770 moveto (prosegue la terapia in corso senza modifiche e la rivedro fra dodici mesi.) show 50 752 moveto (Con i migliori saluti) show 50 734 moveto (Dr. med. Inventato) show 50 716 moveto (Pagina 2 di 2) show`];
const PAGINE_BARRE: string[] = [
  `${barre('PZ00012345', 150, 600)} 50 500 moveto (N. Paziente 12345) show 50 482 moveto (Cognome: Provadividi) show 50 464 moveto (Nome: Anna) show`,      // 1 copertina
  `${barre('770000', 180, 600)} 50 500 moveto (RAPPORTI) show`,                                                                                             // 2 separatore: 01_Rapporti
  ...lettera('12 marzo 2019', 'annuale'), ...lettera('15 maggio 2020', 'successivo'),                                                                     // 3-4, 5-6
  `${barre('770004', 180, 600)} 50 500 moveto (APPARECCHI) show`,                                                                                           // 7 separatore: 05_Apparecchi
  '',                                                                                                                                                       // 8 il retro del separatore
  `50 770 moveto (Holter ECG 24 ore) show 50 752 moveto (Registrazione del 18.10.2023) show 50 734 moveto (FC media 68/min, minima 49/min, massima 121/min, rare extrasistoli) show`,   // 9
];
async function cartellaBarre(file: string): Promise<void> {
  const src = `${file}.ps`;
  await fs.writeFile(src, `%!PS\n/Helvetica findfont 11 scalefont setfont\n${PAGINE_BARRE.map((x) => `${x}\nshowpage`).join('\n')}\n`);
  execFileSync(process.env.GS_BIN || '/opt/homebrew/bin/gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', `-sOutputFile=${file}`, src], { stdio: 'ignore' });
  await fs.rm(src, { force: true });
}

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  await fs.mkdir(TMP, { recursive: true });
  const pulisci = async () => {
    const chiavi = await query<{ storage_key: string }>(`select d.storage_key from patient_documents d join patients p on p.id = d.patient_id where p.studio_id = $1 and p.cognome = 'Provadividi'`, [S]);
    await query(`delete from document_access_log where document_id in (select d.id from patient_documents d join patients p on p.id = d.patient_id where p.studio_id = $1 and p.cognome = 'Provadividi')`, [S]).catch(() => null);
    await query(`delete from patients where studio_id = $1 and cognome = 'Provadividi'`, [S]);
    for (const c of chiavi) await deleteFile(c.storage_key).catch(() => null);
  };
  try {
    await pulisci();
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provadividi', 'Anna', '1950-04-03') returning id`, [S]);
    const file = path.join(TMP, 'cartella.pdf');
    await cartella(file);
    const fd = new FormData();
    fd.append('file', new Blob([await fs.readFile(file)], { type: 'application/pdf' }), 'Cartella completa.pdf'); fd.append('categoria', 'altro'); fd.append('nota', 'cartella completa, da dividere');
    const su = await fetch(`${base}/api/prototipo/pazienti/${pa}/documenti`, { method: 'POST', headers: { cookie: C_SEG }, body: fd });
    const doc = (await su.json().catch(() => ({})) as any).id as string;

    // 1 — l'elenco dei PDF del paziente e la proposta.
    const el = await leggi(C_SEG, `?paziente=${pa}`);
    const pr = await leggi(C_SEG, `?documento=${doc}`);
    const pezzi: any[] = pr.j.pezzi ?? [];
    verifica(su.status === 201 && el.stato === 200 && (el.j.documenti ?? []).some((x: any) => x.id === doc) && pr.stato === 200 && pr.j.pagine === 8 && pr.j.con_testo === 6,
      `la cartella caricata compare fra i PDF del paziente e si legge: 8 pagine, 6 con testo (${pr.j.pagine}, ${pr.j.con_testo})`);
    verifica(JSON.stringify(pezzi.map((x) => [x.da, x.a, x.categoria, x.data])) === JSON.stringify([[1, 3, 'lettera', '2019-03-12'], [4, 4, 'laboratorio', '2019-02-02'], [5, 5, 'ett', '2020-05-15'], [6, 8, 'dimissione', '2021-11-03']]),
      `la proposta: lettera (col suo retro bianco), laboratorio, ecocardiogramma, lettera di dimissione — tipi e date giusti (${pezzi.length} pezzi)`);

    const sto0 = await leggi(C_SEG, `?recenti=1`);
    const riga0 = (sto0.j.cartelle ?? []).find((x: any) => x.id === doc);
    // 2 — chi può: chi ha la sezione (il tecnico vede tutto, come per i Documenti); senza sessione no; un documento che non c'è, un intervallo sbagliato.
    const tec = await leggi(C_TEC, `?paziente=${pa}`), fuori = await leggi('', `?documento=${doc}`);
    const finto = await leggi(C_SEG, `?documento=00000000-0000-4000-8000-000000000000`);
    const sovra = await manda(C_SEG, { azione: 'crea', documento_id: doc, pezzi: [{ da: 1, a: 3 }, { da: 3, a: 4 }] });
    const oltre = await manda(C_SEG, { azione: 'crea', documento_id: doc, pezzi: [{ da: 7, a: 9 }] });
    const fuoriCrea = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'crea', documento_id: doc, pezzi: [{ da: 1, a: 2 }] }) });
    verifica(tec.stato === 200 && fuori.stato === 401 && fuoriCrea.status === 401 && finto.stato === 404 && sovra.status === 400 && oltre.status === 400,
      `senza sessione niente, né leggere né creare; documento inesistente no; intervalli sovrapposti o oltre l'ultima pagina rifiutati (${tec.stato}, ${fuori.stato}, ${fuoriCrea.status}, ${finto.stato}, ${sovra.status}, ${oltre.status})`);
    const [prima] = await query<{ n: number }>(`select count(*)::int as n from patient_documents where patient_id = $1`, [pa]);

    // 3 — la conferma, con una correzione della persona: il retro bianco della lettera resta fuori.
    const scelti = [{ da: 1, a: 2, categoria: 'lettera', titolo: 'Lettera 12.03.2019', data: '12.03.2019' }, { da: 4, a: 4, categoria: 'laboratorio', titolo: 'Laboratorio 02.02.2019', data: '02.02.2019' },
      { da: 5, a: 5, categoria: 'ett', titolo: 'Ecocardiogramma 15.05.2020', data: '15.05.2020' }, { da: 6, a: 7, categoria: 'dimissione', titolo: 'Dimissione: ospedale/prova', data: '3.11.2021' }];
    const cr = await manda(C_SEG, { azione: 'crea', documento_id: doc, pezzi: scelti, proposti: pezzi.map((x) => [x.da, x.a]) });
    const creati: any[] = (await cr.json().catch(() => ({})) as any).creati ?? [];
    const righe = await query<{ id: string; filename: string; categoria: string; nota: string | null; storage_key: string }>(`select id, filename, categoria, nota, storage_key from patient_documents where patient_id = $1 and id <> $2 order by uploaded_at, filename`, [pa, doc]);
    verifica(cr.status === 201 && creati.length === 4 && righe.length === 4 && prima.n === 1 && JSON.stringify(creati.map((x) => x.pagine)) === '[2,1,1,2]'
      && righe.some((x) => x.filename === 'Lettera 12.03.2019.pdf' && x.categoria === 'lettera' && /pagine 1–2/.test(x.nota ?? '')) && righe.some((x) => x.filename === 'Dimissione ospedale prova.pdf' && x.categoria === 'dimissione'),
      `quattro documenti nuovi nella cartella, col tipo, il nome (ripulito) e le pagine di provenienza; prima della conferma non era nato niente (${creati.length}, pagine ${creati.map((x) => x.pagine).join(' ')})`);
    // Ogni pezzo è un PDF vero con le sue pagine, e l'originale è rimasto intero.
    const QPDF = process.env.QPDF_BIN || '/opt/homebrew/bin/qpdf';
    const pagineDi = async (id: string) => { const r = await fetch(`${base}/api/documents/${id}`, { headers: { cookie: C_SEG } }); const f = path.join(TMP, `${id}.pdf`); await fs.writeFile(f, Buffer.from(await r.arrayBuffer())); return Number(execFileSync(QPDF, ['--show-npages', f]).toString().trim()); };
    const np = [];
    for (const c of creati) np.push(await pagineDi(c.id));
    const [reg] = await query<{ n: number }>(`select count(*)::int as n from document_access_log where document_id = $1 and dettaglio like 'divisione: 4 documenti, proposti 4, uguali 2'`, [doc]);
    verifica(JSON.stringify(np) === '[2,1,1,2]' && (await pagineDi(doc)) === 8 && reg.n === 1, `ogni pezzo è un PDF con le sue pagine; l'originale resta di 8; nel registro quanti tagli proposti sono rimasti uguali (2 su 4), senza titoli né testo`);

    // 3b — un PDF trascinato prima di scegliere il paziente: dal testo delle prime pagine si propone di chi è.
    const testi = PAGINE.map((r) => r.join('\n'));
    const chi = await (await manda(C_SEG, { azione: 'chi', testi })).json() as any;
    const ignoto = await (await manda(C_SEG, { azione: 'chi', testi: ['Concerne: Signor Provadividi Sconosciuto, nato il 01.01.1940\nEgregio collega'] })).json() as any;
    const vuoto = await (await manda(C_SEG, { azione: 'chi', testi: ['', ' '] })).json() as any;
    const chiFuori = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'chi', testi }) });
    const [quanti] = await query<{ n: number }>(`select count(*)::int as n from patients where studio_id = $1 and cognome = 'Provadividi'`, [S]);
    verifica(chi.letto?.cognome === 'Provadividi' && chi.letto?.nome === 'Anna' && chi.letto?.nascita === '1950-04-03' && chi.trovato?.id === pa
      && ignoto.letto?.nome === 'Sconosciuto' && ignoto.trovato === null && vuoto.letto === null && chiFuori.status === 401 && quanti.n === 1,
      `di chi è il PDF: nome e data di nascita letti dalle pagine e cartella trovata se c'è; chi non c'è resta da creare (e chiedere non crea niente); senza testo nessuna proposta; senza sessione no (${chiFuori.status})`);

    // 3c — una scansione che il Mac sta leggendo: la pagina chiede a che punto è, senza aprire il file né scrivere nel registro.
    const [regPrima] = await query<{ n: number }>(`select count(*)::int as n from document_access_log where document_id = $1`, [doc]);
    const st0 = await leggi(C_SEG, `?stato=${doc}`);
    await query(`update patient_documents set ocr_stato = 'da_fare' where id = $1`, [doc]);
    const st1 = await leggi(C_SEG, `?stato=${doc}`), pr1 = await leggi(C_SEG, `?documento=${doc}`);
    await query(`update patient_documents set ocr_stato = null where id = $1`, [doc]);
    const stFuori = await leggi('', `?stato=${doc}`), stFinto = await leggi(C_SEG, `?stato=00000000-0000-4000-8000-000000000000`);
    const [regDopo] = await query<{ n: number }>(`select count(*)::int as n from document_access_log where document_id = $1`, [doc]);
    verifica(st0.stato === 200 && st0.j.ocr === null && st1.j.ocr === 'da_fare' && pr1.j.ocr === 'da_fare' && stFuori.stato === 401 && stFinto.stato === 404 && regDopo.n === regPrima.n + 1,
      `lettura di una scansione: lo stato si chiede a parte (${st0.j.ocr} → ${st1.j.ocr}) e chiederlo non scrive nel registro; senza sessione o su un documento che non c'è no (${stFuori.stato}, ${stFinto.stato})`);

    // 3d — lo storico: la cartella caricata resta in elenco, prima «da dividere» e poi «divisa in 4 documenti»; i pezzi non ci entrano.
    const sto1 = await leggi(C_SEG, `?recenti=1`), stoFuori = await leggi('', `?recenti=1`);
    const mie = (sto1.j.cartelle ?? []).filter((x: any) => x.patient_id === pa);
    verifica(sto0.stato === 200 && riga0 && riga0.divisa_il === null && riga0.paziente === 'Provadividi Anna' && mie.length === 1 && mie[0].id === doc && mie[0].documenti === 4 && !!mie[0].divisa_il && stoFuori.stato === 401,
      `lo storico: la cartella caricata c'è, prima da dividere e dopo «divisa in ${mie[0]?.documenti} documenti»; i pezzi creati non ci entrano; senza sessione no (${stoFuori.stato})`);

    // 4 — tutti insieme in uno zip; e solo documenti dello studio.
    const z = await manda(C_SEG, { azione: 'zip', ids: creati.map((x) => x.id) });
    const zb = Buffer.from(await z.arrayBuffer());
    const zNo = await manda(C_SEG, { azione: 'zip', ids: ['00000000-0000-4000-8000-000000000000'] }), zVuoto = await manda(C_SEG, { azione: 'zip', ids: [] });
    verifica(z.status === 200 && zb.subarray(0, 2).toString() === 'PK' && zb.length > 1000 && zNo.status === 404 && zVuoto.status === 400, `lo zip coi quattro PDF si scarica; un documento che non c'è o un elenco vuoto no (${z.status}, ${zNo.status}, ${zVuoto.status})`);

    // 5 — la cartella coi fogli separatori: il Mac li trova in sottofondo, e la proposta diventa sezioni e nomi.
    const fileB = path.join(TMP, 'barre.pdf');
    await cartellaBarre(fileB);
    const fb = new FormData();
    fb.append('file', new Blob([await fs.readFile(fileB)], { type: 'application/pdf' }), 'Cartella coi separatori.pdf'); fb.append('categoria', 'altro'); fb.append('nota', 'cartella completa, da dividere');
    const docB = (await (await fetch(`${base}/api/prototipo/pazienti/${pa}/documenti`, { method: 'POST', headers: { cookie: C_SEG }, body: fb })).json() as any).id as string;
    const primaB = await leggi(C_SEG, `?documento=${docB}`);
    let statoB: any = null;
    for (let k = 0; k < 60 && statoB?.analisi?.stato !== 'fatta'; k++) { await new Promise((r) => setTimeout(r, 1000)); statoB = (await leggi(C_SEG, `?stato=${docB}`)).j; }
    const dopoB = await leggi(C_SEG, `?documento=${docB}`);
    const pb: any[] = dopoB.j.pezzi ?? [];
    verifica(primaB.stato === 200 && statoB?.analisi?.stato === 'fatta' && dopoB.j.analisi?.stato === 'fatta'
      && JSON.stringify(pb.map((x) => [x.da, x.a, x.foglio, x.cartella, x.escluso])) === JSON.stringify([[1, 1, 'copertina', null, true], [2, 2, 'separatore', '01_Rapporti', true], [3, 4, null, '01_Rapporti', false], [5, 6, null, '01_Rapporti', false],
        [7, 7, 'separatore', '05_Apparecchi', true], [8, 8, null, '05_Apparecchi', true], [9, 9, null, '05_Apparecchi', false]]),
      `i codici a barre si leggono (copertina e due separatori): due sezioni, i fogli e il retro bianco restano fuori, tre documenti (analisi ${statoB?.analisi?.stato}, ${pb.length} pezzi)`);
    verifica(pb[2]?.titolo === '2019.03.12 Provadividi Anna Lettera' && pb[3]?.titolo === '2020.05.15 Provadividi Anna Lettera' && pb[6]?.titolo === '2023.10.18 Provadividi Anna Holter' && pb[6]?.categoria === 'holter',
      `i nomi proposti: data, paziente, tipo di documento (${pb[6]?.titolo})`);
    const sceltiB = pb.filter((x) => !x.escluso).map((x) => ({ da: x.da, a: x.a, categoria: x.categoria, titolo: x.titolo, data: x.data, cartella: x.cartella }));
    const crB = await manda(C_SEG, { azione: 'crea', documento_id: docB, pezzi: sceltiB, proposti: sceltiB.map((x) => [x.da, x.a]) });
    const creatiB: any[] = (await crB.json().catch(() => ({})) as any).creati ?? [];
    const righeB = await query<{ filename: string; cartella: string | null }>(`select filename, cartella from patient_documents where id = any($1::uuid[]) order by cartella, filename`, [creatiB.map((x) => x.id)]);
    const zB = await manda(C_SEG, { azione: 'zip', ids: creatiB.map((x) => x.id) });
    const fz = path.join(TMP, 'b.zip'); await fs.writeFile(fz, Buffer.from(await zB.arrayBuffer()));
    const dentro = execFileSync('/usr/bin/unzip', ['-Z1', fz]).toString().trim().split('\n').sort();
    verifica(crB.status === 201 && JSON.stringify(righeB.map((x) => [x.cartella, x.filename])) === JSON.stringify([['01_Rapporti', '2019.03.12 Provadividi Anna Lettera.pdf'], ['01_Rapporti', '2020.05.15 Provadividi Anna Lettera.pdf'], ['05_Apparecchi', '2023.10.18 Provadividi Anna Holter.pdf']])
      && JSON.stringify(dentro) === JSON.stringify(['01_Rapporti/2019.03.12 Provadividi Anna Lettera.pdf', '01_Rapporti/2020.05.15 Provadividi Anna Lettera.pdf', '05_Apparecchi/2023.10.18 Provadividi Anna Holter.pdf']),
      `i documenti nascono nella loro sottocartella, e lo zip ha le stesse sottocartelle (${dentro.length} file)`);

  } finally {
    await pulisci().catch(() => null);
    await fs.rm(TMP, { recursive: true, force: true }).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
