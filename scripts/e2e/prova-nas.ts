// Prova end-to-end del catalogo degli esami sul NAS (8.10.2026) sul DB DEMO,
// con un NAS FINTO: una cartella temporanea fatta come quella vera (anno /
// codice esame / codice / file .dcm), piena di ecocardiogrammi sintetici.
// Si cataloga senza copiare, si guarda, si stacca e si riattacca la cartella.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-nas.ts <base> <cookie> <studio> <cartella conf> <python> <nas finto>
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { query, pool } from '../../src/lib/db';
import { catalogaTutto, riabbinaEsami } from '../../src/lib/imaging-catalogo';
import { scadutiVia } from '../../src/lib/imaging-archivio';

const [base, cookie, S, CONF, PY, NAS] = process.argv.slice(2);
process.env.REFERTI_IMAGING_BASE = CONF;
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const T = Date.now();
const UID_A = `1.2.826.0.1.3680043.8.498.88.${T}.1`, UID_B = `1.2.826.0.1.3680043.8.498.88.${T}.2`;
const scrivi = (dove: string, uid: string, nome: string, nascita: string) => new Promise<void>((res) =>
  execFile(PY, ['imaging/ecografo-finto.py', '--scrivi', dove, '--studio', uid, '--nome', nome, '--nascita', nascita, '--data', '20240115'], { timeout: 60_000 }, () => res()));
const elencoFile = async (d: string): Promise<string[]> => { const f: string[] = []; for (const e of await fs.readdir(d, { withFileTypes: true, recursive: true } as any) as any[]) if (e.isFile()) f.push(path.join(e.parentPath ?? e.path, e.name)); return f.sort(); };
const impronta = async (d: string) => (await Promise.all((await elencoFile(d)).map(async (f) => { const s = await fs.stat(f); return `${path.relative(d, f)}:${s.size}:${Math.round(s.mtimeMs)}`; }))).join('|');
const esame = async (uid: string) => (await query<{ id: string; origine: string; stato: string; patient_id: string | null; n_immagini: number; scade_il: string | null; byte: string }>(
  `select id, origine, stato, patient_id, n_immagini, scade_il::text, byte::text from imaging_esami where studio_id = $1 and study_uid = $2`, [S, uid]))[0];

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const pazienti: string[] = [];
  const ANNO = path.join(NAS, '2024');
  try {
    await fs.rm(NAS, { recursive: true, force: true });
    await scrivi(path.join(ANNO, 'aaaa1111bbbb2222cccc3333', 'dddd4444eeee5555ffff6666'), UID_A, 'PROVANAS^LUISA', '19500202');
    await scrivi(path.join(ANNO, 'bbbb1111cccc2222dddd3333', 'eeee4444ffff5555aaaa6666'), UID_B, 'ALTRONAS^PIERO', '19610303');
    await fs.mkdir(path.join(ANNO, 'cccc0000cccc0000cccc0000'), { recursive: true });                                  // una cartella vuota
    await fs.writeFile(path.join(ANNO, 'aaaa1111bbbb2222cccc3333', 'dddd4444eeee5555ffff6666', 'volume.cdo'), 'xx');   // un file proprio di Philips
    await fs.writeFile(path.join(ANNO, 'aaaa1111bbbb2222cccc3333', 'dddd4444eeee5555ffff6666', 'rotto.dcm'), 'non è un dicom');
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provanas', 'Luisa', '1950-02-02') returning id`, [S]);
    pazienti.push(pa);
    const prima = await impronta(NAS);

    // 1 — la prova a vuoto conta e non scrive niente.
    const p0 = await catalogaTutto(S, NAS, '2024', { prova: true });
    const [{ n: n0 }] = await query<{ n: number }>(`select count(*)::int as n from imaging_esami where studio_id = $1 and study_uid = any($2)`, [S, [UID_A, UID_B]]);
    verifica(p0.cartelle === 3 && p0.esami === 2 && p0.immagini === 8 && p0.abbinati === 1 && p0.vuote === 1 && p0.non_dicom === 1 && n0 === 0, `prova a vuoto: 3 cartelle, 2 esami, 8 immagini, 1 abbinato, 1 vuota, 1 file rotto — e niente nel database (${n0})`);

    // 2 — il catalogo vero.
    const r1 = await catalogaTutto(S, NAS, '2024');
    const a = await esame(UID_A), b = await esame(UID_B);
    verifica(r1.fatte === 2 && r1.vuote === 1 && r1.nuovi === 2 && r1.errori === 0, `catalogo: 2 cartelle fatte, 1 vuota, 2 esami nuovi (${r1.fatte}, ${r1.vuote}, ${r1.nuovi})`);
    verifica(a?.origine === 'nas' && a.scade_il === null && a.n_immagini === 4 && Number(a.byte) > 0, `l'esame è «dal NAS», non scade, quattro immagini (${a?.origine}, ${a?.n_immagini})`);
    verifica(a?.patient_id === pa && a.stato === 'disponibile', 'nome e data di nascita combaciano: agganciato alla cartella della paziente');
    verifica(b?.patient_id === null && b.stato === 'disponibile', `l'esame di chi non è in cartella resta senza paziente, ma NON riempie i «da verificare» (${b?.stato})`);
    const chiavi = await query<{ storage_key: string }>(`select i.storage_key from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1`, [a.id]);
    verifica(chiavi.length === 4 && chiavi.every((k) => /^nas:2024\/aaaa1111bbbb2222cccc3333\/dddd4444eeee5555ffff6666\/.+_image\.dcm$/.test(k.storage_key)), 'ogni immagine punta al suo file sul NAS («nas:…»)');
    let copiati = 0; try { copiati = (await fs.readdir(path.join(process.cwd(), 'uploads', 'imaging', S, UID_A))).length; } catch { /* non esiste: giusto */ }
    verifica(copiati === 0 && (await impronta(NAS)) === prima, 'niente è stato copiato sul disco del server, e sul NAS non è cambiato nemmeno un file');

    // 3 — rilanciarlo non rifà e non raddoppia.
    const r2 = await catalogaTutto(S, NAS, '2024');
    const [{ n: n2 }] = await query<{ n: number }>(`select count(*)::int as n from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = any($1)`, [[a.id, b.id]]);
    verifica(r2.gia_fatte === 3 && r2.nuovi === 0 && n2 === 8, `secondo giro: tutto già fatto, nessun doppione (${r2.gia_fatte}, ${n2} immagini)`);

    // 4 — si guarda: elenco, esame, e un fotogramma di un filmato letto dal NAS.
    const el = await (await fetch(`${base}/api/prototipo/imaging`, { headers: { cookie } })).json();
    verifica(el.nas?.configurato === true && el.nas?.collegato === true && !(el.esami ?? []).some((x: any) => x.id === a.id || x.id === b.id) && (el.origini ?? []).some((o: any) => o.origine === 'nas' && o.n >= 2) && (el.anni ?? []).some((y: any) => y.anno === 2024 && y.n >= 2),
      'la pagina Immagini sa che il NAS è collegato; gli esami d’archivio (del 2024) NON stanno fra i recenti, ma l’elenco dice quanti sono per anno e per provenienza');
    const filtra = async (corpo: Record<string, unknown>) => { const r = await fetch(`${base}/api/prototipo/imaging`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'cerca', ...corpo }) }); return { http: r.status, ...(await r.json().catch(() => ({}))) }; };
    const fNas = await filtra({ origine: 'nas' }), fAnno = await filtra({ anno: 2024, origine: 'nas' }), fAltro = await filtra({ anno: 1999, origine: 'nas' }), fRete = await filtra({ origine: 'rete', anno: 2024 }), fFinta = await filtra({ origine: 'altrove' });
    const cè = (r: any, id: string) => (r.esami ?? []).some((x: any) => x.id === id);
    verifica(fNas.http === 200 && cè(fNas, a.id) && cè(fNas, b.id) && cè(fAnno, a.id) && fAltro.http === 200 && !cè(fAltro, a.id) && !cè(fRete, a.id) && fFinta.http === 400,
      `col filtro si trovano: per provenienza, per anno e provenienza; un altro anno o un'altra provenienza no; una provenienza inventata non è un filtro (${fNas.http}, ${fFinta.http})`);
    const d = await (await fetch(`${base}/api/prototipo/imaging/${a.id}`, { headers: { cookie } })).json();
    const imgs: any[] = (d.serie ?? []).flatMap((s: any) => s.immagini ?? []);
    const filmato = imgs.find((i) => i.frame > 1), secondo = imgs.filter((i) => i.frame > 1)[1];
    const png = await fetch(`${base}/api/prototipo/imaging/immagine/${filmato?.id}?lato=256&frame=6`, { headers: { cookie } });
    verifica(png.status === 200 && Buffer.from(await png.arrayBuffer()).subarray(1, 4).toString() === 'PNG', `un fotogramma di un filmato si disegna leggendo il file dal NAS (${png.status})`);

    // 5 — la cartella del NAS si stacca: lo si dice, non si rompe niente, e al ritorno si riparte.
    await fs.rename(NAS, `${NAS}-via`);
    const el2 = await (await fetch(`${base}/api/prototipo/imaging`, { headers: { cookie } })).json();
    const png2 = await fetch(`${base}/api/prototipo/imaging/immagine/${secondo?.id}?lato=256&frame=2`, { headers: { cookie } });
    const r3 = await catalogaTutto(S, NAS, '2024', { rifai: true });
    verifica(el2.nas?.collegato === false && png2.status === 503 && png2.headers.get('x-rf-motivo') === 'archivio_non_collegato', `NAS staccato: la pagina lo dice e l'immagine risponde «archivio non collegato», non «file rotto» (${png2.status})`);
    verifica(r3.interrotto === 'archivio_non_collegato' && !!(await esame(UID_A)), 'il catalogo si ferma dicendo perché, e gli esami già catalogati restano');
    await fs.rename(`${NAS}-via`, NAS);
    const png3 = await fetch(`${base}/api/prototipo/imaging/immagine/${secondo?.id}?lato=256&frame=2`, { headers: { cookie } });
    verifica(png3.status === 200, `NAS di nuovo collegato: la stessa immagine si apre (${png3.status})`);

    // 5b — la cartella del secondo paziente nasce DOPO: al giro successivo l'esame la trova da solo.
    const [{ id: pb }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Altronas', 'Piero', '1961-03-03') returning id`, [S]);
    pazienti.push(pb);
    const ri = await riabbinaEsami(S);
    const b2 = await esame(UID_B);
    verifica(ri >= 1 && b2.patient_id === pb && (await riabbinaEsami(S)) === 0, `cartella nata dopo il catalogo: l'esame la trova da solo, con la stessa regola severa (${ri})`);
    // Le ecografie tengono la calibrazione, non la geometria completa (un kilobyte a immagine su più di un milione).
    const [{ n: conGeo }] = await query<{ n: number }>(`select count(*) filter (where i.geometria is not null)::int as n from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1`, [a.id]);
    verifica(conGeo === 0, 'ecografie del NAS: in tabella senza la geometria completa');

    // 6 — la pulizia delle copie temporanee non tocca gli esami del NAS, né i loro file.
    await scadutiVia();
    verifica(!!(await esame(UID_A)) && !!(await esame(UID_B)) && (await impronta(NAS)) === prima, 'la scadenza delle copie temporanee non riguarda gli esami del NAS; i file sono ancora tutti lì, intatti');
    const [reg] = await query<{ n: number }>(`select count(*)::int as n from imaging_accessi where esame_id = any($1) and azione = 'catalogato'`, [[a.id, b.id]]);
    const cat = await query<{ stato: string }>(`select stato from imaging_catalogo where studio_id = $1 and cartella like '2024/%'`, [S]);
    verifica(reg.n === 2 && cat.length === 3 && cat.filter((c) => c.stato === 'fatto').length === 2, `registro: due esami catalogati, tre cartelle annotate (${reg.n}, ${cat.length})`);
  } finally {
    await fs.rename(`${NAS}-via`, NAS).catch(() => null);
    for (const e of await query<{ id: string }>(`select id from imaging_esami where studio_id = $1 and study_uid = any($2)`, [S, [UID_A, UID_B]])) {
      await query('delete from imaging_accessi where esame_id = $1', [e.id]).catch(() => null);
      await query('delete from imaging_esami where id = $1', [e.id]);
    }
    await query(`delete from imaging_catalogo where studio_id = $1 and cartella like '2024/%'`, [S]).catch(() => null);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]);
    await fs.rm(NAS, { recursive: true, force: true }).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
