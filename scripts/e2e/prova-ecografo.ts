// Prova end-to-end dell'ecografo che manda gli esami direttamente al Mac
// (7.10.2026), sul DB DEMO: un ecografo FINTO (imaging/ecografo-finto.py,
// filmati sintetici compressi come li manda un ecografo) spedisce alla
// ricezione vera, in una cartella temporanea. L'esame arriva, RESTA (non è una
// copia temporanea), si aggancia al paziente, non si raddoppia se rimandato,
// si guarda, si trova con la ricerca; una copia presa dall'archivio diventa un
// esame che resta quando l'apparecchio ne manda le immagini. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-ecografo.ts <base> <cookie> <studio> <cartella conf> <python> <porta ricezione>
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';
import { svuotaSpool } from '../../src/lib/imaging-archivio';

const [base, cookie, S, CONF, PY, PORTA] = process.argv.slice(2);
process.env.REFERTI_IMAGING_BASE = CONF;
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const h = { cookie, 'Content-Type': 'application/json' };
const UID = `1.2.826.0.1.3680043.8.498.77.${Date.now()}`;

function manda(extra: string[] = []): Promise<any> {
  return new Promise((res) => execFile(PY, ['imaging/ecografo-finto.py', '--porta', PORTA, '--studio', UID, '--nome', 'PROVAECO^MARIA', '--nascita', '19480304', ...extra],
    { timeout: 60_000 }, (_e, out) => { try { res(JSON.parse(out || '{}')); } catch { res({ ok: false }); } }));
}
const cerca = async (q: string, senza = false) => {
  const r = await fetch(`${base}/api/prototipo/imaging`, { method: 'POST', headers: senza ? { 'Content-Type': 'application/json' } : h, body: JSON.stringify({ azione: 'cerca', q }) });
  return { http: r.status, ...(await r.json().catch(() => ({}))) };
};
const esame = async () => (await query<{ id: string; origine: string; scade_il: string | null; patient_id: string | null; stato: string; n_immagini: number; byte: string }>(
  `select id, origine, scade_il::text, patient_id, stato, n_immagini, byte::text from imaging_esami where studio_id = $1 and study_uid = $2`, [S, UID]))[0];
const sulDisco = async () => { try { return (await fs.readdir(path.join(process.cwd(), 'uploads', 'imaging', S, UID))).length; } catch { return 0; } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const pazienti: string[] = [];
  try {
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provaeco', 'Maria', '1948-03-04') returning id`, [S]);
    pazienti.push(pa);

    // 1 — l'ecografo manda tre delle quattro immagini (due filmati e… il terzo): arrivano e restano.
    const m1 = await manda(['--fino', '3']);
    const g1 = await svuotaSpool();
    const e1 = await esame();
    verifica(m1.ok === true && m1.accettate === 3 && g1.file === 3 && g1.nuovi === 1 && g1.immagini === 3, `l'ecografo manda tre filmati: accettati e messi in archivio (${m1.accettate}, ${g1.immagini})`);
    verifica(!!e1 && e1.origine === 'rete' && e1.scade_il === null, `l'esame arrivato dall'apparecchio RESTA: non è una copia temporanea (${e1?.origine}, scadenza ${e1?.scade_il})`);
    verifica(e1?.patient_id === pa && e1.stato === 'disponibile', 'nome e data di nascita combaciano: è agganciato alla cartella');
    verifica(e1?.n_immagini === 3 && Number(e1.byte) > 0 && (await sulDisco()) === 3, `tre immagini in tabella e tre file sul disco (${await sulDisco()})`);

    // 2 — l'ecografo rimanda TUTTO l'esame (succede: esame riaperto, rinvio a mano): entra solo ciò che mancava.
    const m2 = await manda();
    const g2 = await svuotaSpool();
    const e2 = await esame();
    verifica(m2.accettate === 4 && g2.nuovi === 0 && g2.immagini === 1 && e2.n_immagini === 4, `rinvio dell'esame intero: entra solo l'immagine che mancava (${g2.immagini})`);
    verifica((await sulDisco()) === 4, `i doppioni non restano sul disco: quattro file, non sette (${await sulDisco()})`);
    const spool = (await fs.readdir(path.join(CONF, 'ingresso'))).filter((n) => n.endsWith('.dcm')).length;
    verifica(spool === 0, 'lo spool è vuoto');

    // 3 — si guarda: l'elenco delle immagini e un fotogramma di un filmato compresso.
    const d = await (await fetch(`${base}/api/prototipo/imaging/${e2.id}`, { headers: { cookie } })).json();
    const imgs: any[] = (d.serie ?? []).flatMap((s: any) => s.immagini ?? []);
    const filmato = imgs.find((i) => i.frame > 1);
    verifica(imgs.length === 4 && !!filmato && filmato.frame === 12, `l'esame si apre: quattro immagini, i filmati hanno 12 fotogrammi (${filmato?.frame})`);
    const png = await fetch(`${base}/api/prototipo/imaging/immagine/${filmato?.id}?lato=512&frame=7`, { headers: { cookie } });
    const corpo = Buffer.from(await png.arrayBuffer());
    verifica(png.status === 200 && (png.headers.get('content-type') ?? '').includes('image/png') && corpo.subarray(1, 4).toString() === 'PNG', `il fotogramma 8 di un filmato JPEG a colori si disegna (${png.status})`);
    // Il filmato intero, per farlo andare da solo (9.10.2026): un file con l'intestazione e i 12 fotogrammi in JPEG.
    const fl = await fetch(`${base}/api/prototipo/imaging/immagine/${filmato?.id}/filmato?lato=512`, { headers: { cookie } });
    const bin = Buffer.from(await fl.arrayBuffer());
    const lt = bin.length > 12 ? bin.readUInt32LE(8) : 0;
    let testa: any = {}; try { testa = JSON.parse(bin.subarray(12, 12 + lt).toString('utf-8')); } catch { /* non è il file atteso */ }
    const somma = (testa.lunghezze ?? []).reduce((z: number, n: number) => z + n, 0);
    verifica(fl.status === 200 && bin.subarray(0, 8).toString() === 'RFCINE1\n' && testa.n === 12 && testa.ms === 40 && 12 + lt + somma === bin.length && bin.subarray(12 + lt, 12 + lt + 2).toString('hex') === 'ffd8',
      `il filmato si prepara intero: 12 fotogrammi JPEG, 25 al secondo come dice il file (${fl.status}, ${testa.n}, ${testa.ms})`);
    const fermoImg = imgs.find((x: any) => x.frame <= 1);
    const flFermo = await fetch(`${base}/api/prototipo/imaging/immagine/${fermoImg?.id}/filmato`, { headers: { cookie } });
    const flFuori = await fetch(`${base}/api/prototipo/imaging/immagine/${filmato?.id}/filmato`);
    const fl2 = await fetch(`${base}/api/prototipo/imaging/immagine/${filmato?.id}/filmato?lato=512`, { headers: { cookie } });
    verifica(flFermo.status === 415 && flFuori.status === 401 && fl2.status === 200 && Number(fl2.headers.get('content-length')) === bin.length,
      `un'immagine ferma non è un filmato; senza sessione niente; la seconda richiesta dà lo stesso file (${flFermo.status}, ${flFuori.status}, ${fl2.status})`);

    // 4 — si trova: per cognome, per data di nascita, per data dell'esame, per anno; e non si trova ciò che non c'è.
    const c1 = await cerca('provaeco'), c2 = await cerca('4.3.1948'), c3 = await cerca('01.03.2026 provaeco'), c4 = await cerca('Maria 2026'), c5 = await cerca('provaeco 2019'), c6 = await cerca('zzzqqq');
    const ha = (c: any) => (c.esami ?? []).some((x: any) => x.id === e2.id);
    verifica(ha(c1) && ha(c2) && ha(c3) && ha(c4), 'ricerca: per cognome, per data di nascita, per data dell’esame, per nome e anno');
    verifica(c5.http === 200 && !ha(c5) && c6.http === 200 && (c6.esami ?? []).length === 0, 'ricerca: un altro anno o un nome che non c’è non trovano niente');
    const vuota = await cerca('  '), fuori = await cerca('provaeco', true);
    verifica(vuota.http === 400 && fuori.http === 401, 'ricerca vuota rifiutata; senza sessione niente');
    const el = await (await fetch(`${base}/api/prototipo/imaging`, { headers: { cookie } })).json();
    verifica(el.conta?.totale >= 1 && Number(el.conta?.byte) >= Number(e2.byte), `l'elenco dice quanti esami ci sono in tutto e quanto pesano (${el.conta?.totale})`);
    // L'elenco di serie mostra solo i recenti (9.10.2026): un esame appena mandato dall'apparecchio c'è anche se è datato mesi fa;
    // invecchiato l'arrivo esce dall'elenco, e si ritrova col filtro.
    const dentro = (el.esami ?? []).some((x: any) => x.id === e2.id);
    await query(`update imaging_esami set created_at = now() - interval '90 days' where id = $1`, [e2.id]);
    const elDopo = await (await fetch(`${base}/api/prototipo/imaging`, { headers: { cookie } })).json();
    const colFiltro = await fetch(`${base}/api/prototipo/imaging`, { method: 'POST', headers: h, body: JSON.stringify({ azione: 'cerca', origine: 'rete', anno: 2026 }) }).then((r) => r.json());
    const perPaz = await (await fetch(`${base}/api/prototipo/imaging?paziente=${pa}`, { headers: { cookie } })).json();
    await query(`update imaging_esami set created_at = now() where id = $1`, [e2.id]);
    verifica(dentro && el.recenti_giorni === 30 && !(elDopo.esami ?? []).some((x: any) => x.id === e2.id) && (colFiltro.esami ?? []).some((x: any) => x.id === e2.id) && (perPaz.esami ?? []).some((x: any) => x.id === e2.id),
      'di serie solo gli esami recenti: appena arrivato c’è; dopo 90 giorni esce dall’elenco, si ritrova col filtro e resta nella cartella del paziente');

    // 5 — una copia presa dall'archivio diventa un esame che resta quando l'apparecchio ne manda le immagini…
    await query(`update imaging_esami set origine = 'archivio', scade_il = now() + interval '7 days' where id = $1`, [e2.id]);
    await query(`delete from imaging_immagini where sop_uid = $1`, [`${UID}.1.4`]);
    await manda(['--da', '3']);
    await svuotaSpool();
    const e5 = await esame();
    verifica(e5.origine === 'rete' && e5.scade_il === null, `copia temporanea + immagini mandate dall'apparecchio = l'esame resta (${e5.origine})`);
    // …ma non se le immagini arrivano perché qualcuno le ha appena chieste all'archivio.
    await query(`update imaging_esami set origine = 'archivio', scade_il = now() + interval '7 days' where id = $1`, [e2.id]);
    await query(`delete from imaging_immagini where sop_uid = $1`, [`${UID}.1.4`]);
    await query(`insert into imaging_richieste (studio_id, study_uid, abbina, stato) values ($1, $2, false, 'in_corso')`, [S, UID]);
    await manda(['--da', '3']);
    await svuotaSpool();
    const e6 = await esame();
    verifica(e6.origine === 'archivio' && e6.scade_il !== null, `chiesto all'archivio poco fa: resta una copia temporanea (${e6.origine})`);

    // 6 — chi non è in elenco non manda: la ricezione di prova ammette solo 127.0.0.1, e l'AE resta scritto nel suo registro.
    const [reg] = await query<{ n: number }>(`select count(*)::int as n from imaging_accessi where studio_id = $1 and esame_id = $2 and azione = 'ricevuto'`, [S, e2.id]);
    verifica(reg.n >= 2, `ogni arrivo è nel registro degli accessi dell'esame (${reg.n})`);
  } finally {
    for (const e of await query<{ id: string }>(`select id from imaging_esami where studio_id = $1 and study_uid = $2`, [S, UID])) {
      for (const f of await query<{ storage_key: string }>(`select i.storage_key from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1`, [e.id])) await deleteFile(f.storage_key).catch(() => null);
      await query('delete from imaging_accessi where esame_id = $1', [e.id]).catch(() => null);
      await query('delete from imaging_esami where id = $1', [e.id]);
    }
    await fs.rm(path.join(process.cwd(), 'uploads', 'imaging', S, UID), { recursive: true, force: true }).catch(() => null);
    await query(`delete from imaging_richieste where studio_id = $1 and study_uid = $2`, [S, UID]).catch(() => null);
    await query(`delete from imaging_accessi where studio_id = $1 and esame_id is null and azione = 'elenco_cerca' and created_at > now() - interval '1 hour'`, [S]).catch(() => null);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
