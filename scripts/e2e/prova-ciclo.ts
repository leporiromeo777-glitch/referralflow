// Prova end-to-end dei referti della ciclo (9.10.2026) sul DB DEMO, con referti INVENTATI
// (PDF fatti qui con ghostscript): il PDF messo nella cartella diventa un documento «Ciclo»
// del paziente quando nome e data di nascita combaciano; se no aspetta «da assegnare»;
// lo stesso referto non entra due volte; chi può fare che cosa. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-ciclo.ts <base> <studio> <segretaria> <tecnico> <cartella>
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';

const [base, S, C_SEG, C_TEC, CARTELLA] = process.argv.slice(2);
process.env.CICLO_CARTELLA = CARTELLA;
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const url = `${base}/api/prototipo/ciclo`;
const leggi = async (cookie: string) => { const r = await fetch(url, { headers: cookie ? { cookie } : {} }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };
const manda = async (cookie: string, corpo: unknown) => { const r = await fetch(url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, j: await r.json().catch(() => ({})) as any }; };

// Un referto finto, fatto come quello della ciclo: testata, paziente, esame.
async function referto(nomeFile: string, chi: string, nascita: string, esame: string, altro = ''): Promise<void> {
  const righe: string[] = []; let y = 770;
  const riga = (x: string) => { righe.push(`50 ${y} moveto (${x.replace(/[()\\]/g, '')}) show`); y -= 16; };
  ['Studio di Prova', 'Paziente', 'ID : 77 ID secondario : --', `Nome : ${chi}`, 'Etnia : Sesso : femmina', `Data di nascita : ${nascita}${nascita ? ' ' : ''}Eta : 71 anni`,
    'Esame Stress', `Data Esame: ${esame} Durata esame: 9:24 min`, 'Protocollo: manuale Potenza max: 25 Watt', 'Conclusioni', `Test ${altro}`].forEach(riga);
  const ps = path.join(CARTELLA, '.r.ps');
  await fs.writeFile(ps, `%!PS\n/Helvetica findfont 11 scalefont setfont\n${righe.join('\n')}\nshowpage\n`);
  execFileSync(process.env.GS_BIN || '/opt/homebrew/bin/gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', `-sOutputFile=${path.join(CARTELLA, nomeFile)}`, ps], { stdio: 'ignore' });
  await fs.rm(ps, { force: true });
}
const esiste = (n: string) => fs.access(path.join(CARTELLA, n)).then(() => true, () => false);

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const { giroCiclo } = await import('../../src/lib/ciclo/cartella-server');
  await fs.mkdir(CARTELLA, { recursive: true });
  const pulisci = async () => {
    const chiavi = await query<{ storage_key: string }>(
      `select d.storage_key from patient_documents d join patients p on p.id = d.patient_id where p.studio_id = $1 and p.cognome like 'Provaciclo%'
       union select storage_key from ciclo_arrivi where studio_id = $1 and storage_key is not null`, [S]);
    await query(`delete from ciclo_arrivi where studio_id = $1`, [S]);
    await query(`delete from document_access_log where document_id in (select d.id from patient_documents d join patients p on p.id = d.patient_id where p.studio_id = $1 and p.cognome like 'Provaciclo%')`, [S]).catch(() => null);
    await query(`delete from patients where studio_id = $1 and cognome like 'Provaciclo%'`, [S]);
    for (const c of chiavi) await deleteFile(c.storage_key).catch(() => null);
  };
  try {
    await pulisci();
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provaciclo', 'Carla', '1955-06-12') returning id`, [S]);
    const docDi = async (pid: string) => query<{ filename: string; categoria: string; nota: string | null }>(`select filename, categoria, nota from patient_documents where patient_id = $1 order by uploaded_at`, [pid]);

    // 1 — nome e data di nascita combaciano: il referto va da solo nella cartella, fra i documenti «Ciclo».
    const A = 'STX_77_Carla_Provaciclo_femmina__20260307150253__20260307151427__0.pdf';
    await referto(A, 'Provaciclo, Carla', '12/06/1955', '07/03/2026 - 15:02');
    const presto = await giroCiclo();                       // appena scritto: forse lo stanno ancora copiando
    const g1 = await giroCiclo({ fermoDaMs: 0 });
    const d1 = await docDi(pa);
    verifica(presto.visti === 0 && g1.documenti === 1 && d1.length === 1 && d1[0].categoria === 'ciclo' && d1[0].filename === 'Prova da sforzo 07.03.2026.pdf' && await esiste(A),
      `un referto appena scritto si lascia stare; poi va da solo nella cartella del paziente come documento «Ciclo», e il file resta dov'è (${g1.documenti}, ${d1[0]?.filename})`);

    // 2 — lo stesso referto non entra due volte, nemmeno se il programma lo rifà (stesso nome, altro contenuto).
    const g2 = await giroCiclo({ fermoDaMs: 0 });
    await referto(A, 'Provaciclo, Carla', '12/06/1955', '07/03/2026 - 15:02', 'rifatto');
    const g3 = await giroCiclo({ fermoDaMs: 0 });
    verifica(g2.gia_visti === 1 && g2.documenti === 0 && g3.documenti === 0 && (await docDi(pa)).length === 1, `lo stesso referto non entra due volte, neanche rifatto dal programma (${(await docDi(pa)).length} documento)`);

    // 3 — senza data di nascita non si indovina: aspetta «da assegnare», col PDF da guardare.
    const B = 'STX_77_Carla_Provaciclo_femmina__20260309100000__20260309101500__0.pdf';
    await referto(B, 'Provaciclo, Carla', '', '09/03/2026 - 10:00');
    const g4 = await giroCiclo({ fermoDaMs: 0 });
    const el = await leggi(C_SEG);
    const b = (el.j.arrivi ?? []).find((x: any) => x.esame_il === '2026-03-09T10:00');
    const pdf = await fetch(`${url}/${b?.id}`, { headers: { cookie: C_SEG } });
    const pdfTec = await fetch(`${url}/${b?.id}`, { headers: { cookie: C_TEC } });
    const pdfFuori = await fetch(`${url}/${b?.id}`);
    verifica(g4.in_attesa === 1 && g4.documenti === 0 && !!b && b.motivo === 'senza_nascita' && b.proposta?.cognome === 'Provaciclo' && el.j.conta?.totale === 2 && el.j.conta?.in_cartella === 1,
      `senza data di nascita il referto aspetta «da assegnare» e dice perché (${b?.motivo}); la pagina sa quanti ne sono arrivati (${el.j.conta?.totale})`);
    verifica(pdf.status === 200 && (pdf.headers.get('content-type') ?? '').includes('pdf') && Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString() === '%PDF-' && pdfTec.status === 403 && pdfFuori.status === 401 && (await leggi(C_TEC)).stato === 403,
      `il PDF in attesa si apre per guardarlo; il tecnico no, senza sessione no (${pdf.status}, ${pdfTec.status}, ${pdfFuori.status})`);

    // 4 — assegnare: senza paziente no, la segreteria sì, due volte no; dopo il PDF sta nella cartella e non più fra gli arrivi.
    const aSenza = await manda(C_SEG, { azione: 'assegna', id: b.id }), aTec = await manda(C_TEC, { azione: 'assegna', id: b.id, patient_id: pa });
    const aSeg = await manda(C_SEG, { azione: 'assegna', id: b.id, patient_id: pa }), aBis = await manda(C_SEG, { azione: 'assegna', id: b.id, patient_id: pa });
    const dopo = await fetch(`${url}/${b.id}`, { headers: { cookie: C_SEG } });
    verifica(aSenza.stato === 400 && aTec.stato === 403 && aSeg.stato === 200 && aBis.stato === 404 && (await docDi(pa)).length === 2 && dopo.status === 404,
      `assegnare: senza paziente no, il tecnico no, la segreteria sì e il referto entra in cartella, due volte no (${aSenza.stato}, ${aTec.stato}, ${aSeg.stato}, ${aBis.stato})`);

    // 5 — la persona non ha ancora la cartella: nasce da qui, coi dati confermati.
    const C = 'STX_81_Dario_Provaciclonuovo_maschio__20260310090000__20260310091000__0.pdf';
    await referto(C, 'Provaciclonuovo, Dario', '03/04/1961', '10/03/2026 - 09:00');
    const g5 = await giroCiclo({ fermoDaMs: 0 });
    const c = ((await leggi(C_SEG)).j.arrivi ?? [])[0];
    const cSenza = await manda(C_SEG, { azione: 'crea_cartella', id: c?.id, cognome: 'Provaciclonuovo', nome: 'Dario' });
    const cSeg = await manda(C_SEG, { azione: 'crea_cartella', id: c?.id, cognome: 'Provaciclonuovo', nome: 'Dario', data_nascita: '03.04.1961' });
    const [nn] = await query<{ n: number; d: number }>(`select count(*)::int as n, (select count(*) from patient_documents x where x.patient_id = any(array_agg(p.id)))::int as d from patients p where studio_id = $1 and cognome = 'Provaciclonuovo'`, [S]);
    verifica(g5.in_attesa === 1 && c?.motivo === 'nessuno' && cSenza.stato === 400 && cSeg.stato === 200 && cSeg.j.nuova === true && nn.n === 1 && nn.d === 1,
      `chi non ha la cartella: senza data di nascita no; poi nascono cartella e documento insieme (${cSenza.stato}, ${cSeg.stato}, cartelle ${nn.n})`);
    const C2 = 'STX_81_Dario_Provaciclonuovo_maschio__20260312090000__20260312091000__0.pdf';
    await referto(C2, 'Provaciclonuovo, Dario', '03/04/1961', '12/03/2026 - 09:00');
    const g6 = await giroCiclo({ fermoDaMs: 0 });
    verifica(g6.documenti === 1 && g6.in_attesa === 0, `nata la cartella, il referto successivo della stessa persona va a posto da solo (${g6.documenti})`);

    // 6 — un PDF che non è un referto della ciclo non entra da nessuna parte e non si rilegge a ogni giro.
    await fs.writeFile(path.join(CARTELLA, 'lettera.pdf'), '%PDF-1.4 non un referto');
    const g7 = await giroCiclo({ fermoDaMs: 0 }), g8 = await giroCiclo({ fermoDaMs: 0 });
    verifica(g7.non_letti === 1 && g8.non_letti === 0 && g8.visti === 0, `un altro PDF finito lì si segna una volta sola come non letto (${g7.non_letti}, poi ${g8.visti} visti)`);

    // 7 — scartare; e i file già letti si tolgono quando sono vecchi (qui: subito, con zero giorni).
    const D = 'STX_90_Ugo_Provacicloignoto_maschio__20260313090000__20260313091000__0.pdf';
    await referto(D, 'Provacicloignoto, Ugo', '', '13/03/2026 - 09:00');
    await giroCiclo({ fermoDaMs: 0 });
    const d = ((await leggi(C_SEG)).j.arrivi ?? [])[0];
    const sc = await manda(C_SEG, { azione: 'scarta', id: d?.id });
    const [chiave] = await query<{ n: number }>(`select count(*)::int as n from ciclo_arrivi where studio_id = $1 and stato <> 'in_attesa' and storage_key is not null`, [S]);
    verifica(sc.stato === 200 && ((await leggi(C_SEG)).j.arrivi ?? []).length === 0 && chiave.n === 0, 'scartare toglie il referto dalla lista; assegnato o scartato, il PDF non resta fra gli arrivi');
    await giroCiclo({ fermoDaMs: 0, giorniTenuti: 0 });
    verifica(!(await esiste(A)) && !(await esiste(B)) && !(await esiste('lettera.pdf')), 'i file già letti si tolgono dalla cartella quando sono vecchi');
  } finally {
    await pulisci().catch(() => null);
    await fs.rm(CARTELLA, { recursive: true, force: true }).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
