// Prova end-to-end delle lettere della cartella comune (22.10.2026) sul DB DEMO, con una cartella comune FINTA e
// pazienti e lettere INVENTATI: cartelle di paziente a livelli diversi, regola severa (nome della cartella e data di
// nascita nelle lettere), Word vecchio convertito, il PDF del Word saltato, i file di Word aperti ignorati, l'archivio
// lasciato fuori, nessun doppione al secondo controllo, la lettera cambiata sostituita, la cartella da assegnare (crea
// il paziente), il permesso. Poi toglie tutto.
// Anche le cartelle cartacee scansionate (DocuWare): una col nome intero, una col solo cognome (nascita nel testo).
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-comune.ts <base> <studio> <segretaria> <radice finta> <scansioni finte>
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';

const [base, S, C_SEG, RADICE, SCANSIONI] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const URL = `${base}/api/prototipo/comune`;
const manda = async (corpo: unknown, cookie = C_SEG) => { const r = await fetch(URL, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
const leggi = async (cookie = C_SEG) => { const r = await fetch(URL, { headers: { cookie } }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Un Word (o un Word vecchio) col testo dato, fatto da textutil.
async function word(file: string, testo: string, formato: 'docx' | 'doc' = 'docx') {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const txt = `${file}.txt`;
  await fs.writeFile(txt, testo);
  execFileSync('/usr/bin/textutil', ['-convert', formato, '-output', file, txt]);
  await fs.rm(txt);
}
// Un PDF con lo strato di testo (come una scansione già passata dall'OCR), fatto da cupsfilter.
async function pdf(file: string, testo: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const txt = `${file}.txt`;
  await fs.writeFile(txt, testo);
  await fs.writeFile(file, execFileSync('/usr/sbin/cupsfilter', ['-m', 'application/pdf', txt], { stdio: ['ignore', 'pipe', 'ignore'] }));
  await fs.rm(txt);
}
const lettera = (nome: string, nascita: string, extra = '') => `Studio di prova\nLugano, 12.05.2024\n\nPaziente\n${nome} – ${nascita}\n\nEgregio collega,\nvisita di controllo inventata per la prova. ${extra}\n${'Testo di riempimento della lettera di prova. '.repeat(12)}\nCordiali saluti`;

const pazienti: string[] = [];
(async () => {
  try {
    await fs.rm(RADICE, { recursive: true, force: true });
    await fs.rm(SCANSIONI, { recursive: true, force: true });
    await pdf(path.join(SCANSIONI, 'Lotto 1', '123456_Provacom_Alda.pdf'), `Cartella clinica\nProvacom Alda, nata il 12.03.1950\n${'Testo inventato. '.repeat(30)}`);
    await pdf(path.join(SCANSIONI, 'Lotto 1', '654321_Provacom.pdf'), `Cartella clinica\nProvacom, nata il 12.03.1950\n${'Testo inventato. '.repeat(30)}`);
    await pdf(path.join(SCANSIONI, 'Lotto 2', '222222_Numerocom_Ada.pdf'), `Cartella clinica\nNumerocom Ada\n${'Testo inventato senza date. '.repeat(30)}`);
    await pdf(path.join(SCANSIONI, 'Lotto 2', '111111_Scancom.pdf'), `Cartella clinica\nScancom Ugo, nato il 01.02.1945\n${'Testo inventato. '.repeat(30)}`);
    const R = (...p: string[]) => path.join(RADICE, ...p);
    // Conosciuta: cartella sotto il medico, la data di nascita nella lettera.
    await word(R('Rapporti_Prova', 'Provacom Alda', '24 05 12 Provacom Alda.docx'), lettera('Provacom Alda', '12.03.1950'));
    await fs.writeFile(R('Rapporti_Prova', 'Provacom Alda', '24 05 12 Provacom Alda.pdf'), '%PDF-1.4\n%prova\n');       // il PDF del Word
    await word(R('Rapporti_Prova', 'Provacom Alda', 'L0001.doc'), lettera('Provacom Alda', '12.03.1950', 'Lettera vecchia.'), 'doc');
    await fs.writeFile(R('Rapporti_Prova', 'Provacom Alda', '~$ provacom.docx'), 'blocco di Word');
    // Lettere sciolte, fuori da una cartella di paziente: una col nome (e una parola in più), una col codice.
    await word(R('Rapporti_Prova', '24 03 01 Provacom Alda ecocardio.docx'), lettera('Provacom Alda', '12.03.1950', 'Lettera sciolta.'));
    await word(R('Rapporti_Prova', 'L9999.doc'), lettera('Provacom Alda', '12.03.1950', 'Codice.'), 'doc');
    // Più in profondità, la data di nascita nel nome della cartella: un referto d'esame.
    await word(R('Esami_Prova', 'Esami 2015', 'Provacom Alda (12.03.1950)', 'eco.docx'), lettera('Provacom Alda', '', 'Esame di secondo livello.'));
    // Sconosciuta con la data di nascita accanto a «nato il»: il paziente nasce da solo.
    await word(R('Rapporti_Prova', 'Ignotocom Bruno', '23 01 02 Ignotocom Bruno.docx'), `Lugano, 02.01.2023\nConcerne: Ignotocom Bruno, nato il 04.07.1955\n${'Testo di prova inventato. '.repeat(20)}`);
    // Un nome in più e la stessa nascita: la scheda che c'è, non una nuova.
    await word(R('Rapporti_Prova', 'Provacom Alda Maria', 'x2.docx'), lettera('Provacom Alda Maria', '12.03.1950'));
    // Un nome in più ma un'altra nascita: un'altra persona, nasce.
    await word(R('Rapporti_Prova', 'Provacom Alda Seconda', 'x.docx'), lettera('Provacom Alda Seconda', '01.01.1990'));
    // Sconosciuta senza nessuna data: aspetta.
    await word(R('Rapporti_Prova', 'Senzadata Carlo', 's.docx'), `Egregio collega,\n${'Testo di prova inventato senza date. '.repeat(20)}`);
    // Archivio: una cartella con centinaia di lettere nominate con un codice.
    await fs.mkdir(R('Rapporti_Prova', 'Vecchie', 'Lettere varie'), { recursive: true });
    for (let i = 0; i < 260; i++) await fs.writeFile(R('Rapporti_Prova', 'Vecchie', 'Lettere varie', `L${1000 + i}.doc`), 'x');

    const [p] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provacom', 'Alda', '1950-03-12') returning id`, [S]);
    pazienti.push(p.id);
    const [pn] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, numero) values ($1, 'Numerocom', 'Ada', '222222') returning id`, [S]);
    pazienti.push(pn.id);

    const non = await fetch(URL); verifica(non.status === 401, `senza sessione: 401 (${non.status})`);
    const g1 = await manda({ azione: 'controlla' });
    verifica(g1.j.scansioni === 3, `tre scansioni caricate (una dal numero di MediOnline, senza data) (${g1.j.scansioni})`);
    verifica(g1.stato === 200 && g1.j.caricati === 10, `primo controllo: 10 caricate (7 lettere, una sciolta; 3 scansioni) (${g1.stato} ${JSON.stringify({ c: g1.j.caricati, d: g1.j.doppioni, a: g1.j.in_attesa, n: g1.j.nuovi, cr: g1.j.creati })})`);
    verifica(g1.j.doppioni === 1, `il PDF del Word saltato come doppione (${g1.j.doppioni})`);
    verifica(g1.j.in_attesa === 1 && g1.j.scartate === 1, `una lettera senza data aspetta; la scansione col solo cognome è scartata (${g1.j.in_attesa}, ${g1.j.scartate})`);
    verifica(g1.j.creati === 2, `due pazienti creati dalla cartella (${g1.j.creati})`);
    const nati = await query<{ cognome: string; nome: string; nascita: string }>(`select cognome, nome, data_nascita::text as nascita from patients where studio_id = $1 and (cognome = 'Ignotocom' or (cognome = 'Provacom' and nome <> 'Alda')) order by cognome`, [S]);
    verifica(nati.length === 2 && nati[0].nome === 'Bruno' && nati[0].nascita === '1955-07-04' && nati[1].nome === 'Alda Seconda' && nati[1].nascita === '1990-01-01', `i pazienti nuovi con cognome, nome e nascita giusti (${nati.map((x) => `${x.nome} ${x.nascita}`).join(', ')})`);
    const docs = await query<{ id: string; filename: string; categoria: string; giorno: string; nota: string; cartella: string | null }>(
      `select id, filename, categoria, to_char(uploaded_at, 'YYYY-MM-DD') as giorno, nota, cartella from patient_documents where patient_id = $1 order by filename`, [p.id]);
    verifica(docs.length === 7, `sette documenti nella cartella del paziente: anche la cartella col nome quasi uguale, la lettera sciolta e due scansioni (${docs.length})`);
    verifica(docs.some((d) => d.filename === '24 03 01 Provacom Alda ecocardio.docx' && d.cartella === '01_Rapporti') && !docs.some((d) => d.filename.startsWith('L9999')), 'la lettera sciolta col nome entra, quella col codice no');
    const [{ n: nNum }] = await query<{ n: number }>(`select count(*)::int as n from patient_documents where patient_id = $1`, [pn.id]);
    verifica(nNum === 1, `la scansione col numero di MediOnline nella cartella giusta (${nNum})`);
    const scans = docs.filter((d) => d.nota === 'cartella cartacea scansionata (DocuWare)');
    verifica(scans.length === 2 && scans.every((d) => d.categoria === 'altro'), `le scansioni come documento, nota DocuWare (${scans.length})`);
    verifica(docs.some((d) => d.filename === 'x2.docx'), 'la cartella «Provacom Alda Maria» nella scheda di Provacom Alda');
    const d1 = docs.find((d) => d.filename === '24 05 12 Provacom Alda.docx');
    verifica(!!d1 && d1.cartella === '01_Rapporti' && docs.filter((d) => d.nota === 'cartella cartacea scansionata (DocuWare)').every((d) => d.cartella === 'Cartella cartacea scansionata'), `sottocartelle: la lettera in 01_Rapporti, le scansioni a parte (${d1?.cartella})`);
    verifica(!!d1 && d1.categoria === 'lettera' && d1.giorno === '2024-05-12' && /Rapporti Prova/.test(d1.nota), `lettera con la data del nome del file e la nota (${d1?.categoria} ${d1?.giorno})`);
    verifica(docs.some((d) => d.filename === 'L0001.docx' && d.categoria === 'lettera'), 'il Word vecchio convertito in .docx');
    verifica(docs.some((d) => d.filename === 'eco.docx' && d.categoria === 'referto'), 'l’esame più in profondità, riconosciuto dalla data nel nome della cartella, come referto');
    verifica(!docs.some((d) => d.filename.startsWith('~$')), 'il file di blocco di Word ignorato');

    const st = await leggi();
    const attesa = st.j.attesa || [];
    const ign = attesa.find((x: any) => x.nome_letto === 'Senzadata Carlo');
    const [sca] = await query<{ stato: string; motivo: string }>(`select stato, motivo from comune_cartelle where studio_id = $1 and nome_letto = 'Scancom'`, [S]);
    verifica(!attesa.some((x: any) => x.nome_letto === 'Scancom') && sca?.stato === 'scartata' && sca?.motivo === 'un_nome_solo', `un nome solo: scartata, non da assegnare (${sca?.stato} ${sca?.motivo})`);
    verifica(st.stato === 200 && !!ign && ign.motivo === 'nessuno' && !ign.nascita_proposta && attesa.length === 1, `senza una data di nascita la cartella aspetta (${ign?.motivo}, ${attesa.length})`);
    verifica(st.j.conti?.creati === 2 && st.j.conti?.quasi === 2, `conteggi: 2 creati, 2 col nome quasi uguale (la cartella e la lettera sciolta) (${st.j.conti?.creati}, ${st.j.conti?.quasi})`);
    verifica((st.j.non_pazienti || []).some((x: any) => /Vecchie/.test(x.percorso)), 'l’archivio lasciato fuori');
    verifica(st.j.recenti?.length === 10 && st.j.conti?.caricati === 10, `ultimi sette giorni: 10 (${st.j.recenti?.length})`);

    const g2 = await manda({ azione: 'controlla' });
    verifica(g2.j.nuovi === 0 && g2.j.caricati === 0, `secondo controllo: niente di nuovo, niente doppioni (${g2.j.nuovi})`);

    // La lettera cambiata sulla cartella comune: stesso documento, file nuovo.
    const [prima] = await query<{ storage_key: string }>(`select storage_key from patient_documents where id = $1`, [d1!.id]);
    await word(R('Rapporti_Prova', 'Provacom Alda', '24 05 12 Provacom Alda.docx'), lettera('Provacom Alda', '12.03.1950', 'Corretta il giorno dopo.'));
    const g3 = await manda({ azione: 'controlla' });
    const [dopo] = await query<{ storage_key: string; n: number }>(`select storage_key, (select count(*)::int from patient_documents where patient_id = $2) as n from patient_documents where id = $1`, [d1!.id, p.id]);
    verifica(g3.j.caricati === 1 && dopo.n === 7 && dopo.storage_key !== prima.storage_key, `lettera cambiata: lo stesso documento col file nuovo (${g3.j.caricati}, ${dopo.n})`);

    // Crea il paziente dalla cartella che aspetta: le sue lettere entrano.
    const cr = await manda({ azione: 'crea_cartella', id: ign.id, cognome: 'Senzadata', nome: 'Carlo', data_nascita: '04.07.1956' });
    verifica(cr.stato === 200 && cr.j.nuova === true, `crea il paziente (${cr.stato})`);
    if (cr.j.patient_id) pazienti.push(cr.j.patient_id);
    let n = 0;
    for (let i = 0; i < 20 && !n; i++) { await attendi(500); [{ n }] = await query<{ n: number }>(`select count(*)::int as n from patient_documents where patient_id = $1`, [cr.j.patient_id]); }
    verifica(n === 1, `le lettere della cartella assegnata entrano subito (${n})`);
    const sc = await manda({ azione: 'scarta', id: ign.id });
    verifica(sc.stato === 404, `una cartella già assegnata non si scarta (${sc.stato})`);
  } catch (e: any) { no++; console.log(`NO eccezione: ${e?.message ?? e}`); }
  finally {
    pazienti.push(...(await query<{ id: string }>(`select id from patients where studio_id = $1 and cognome in ('Provacom', 'Ignotocom', 'Senzadata') and not (id = any($2::uuid[]))`, [S, pazienti])).map((x) => x.id));
    const chiavi = await query<{ k: string }>(`select storage_key as k from patient_documents where patient_id = any($1::uuid[])`, [pazienti]);
    for (const { k } of chiavi) await deleteFile(k).catch(() => null);
    await query(`delete from comune_giri where studio_id = $1`, [S]);
    await query(`delete from comune_cartelle where studio_id = $1`, [S]);
    await query(`delete from patient_documents where patient_id = any($1::uuid[])`, [pazienti]);
    await query(`delete from patients where id = any($1::uuid[])`, [pazienti]);
    await fs.rm(RADICE, { recursive: true, force: true });
    await fs.rm(SCANSIONI, { recursive: true, force: true });
    console.log(`${ok} ok, ${no} no`);
    await pool.end();
    process.exit(no ? 1 : 0);
  }
})();
