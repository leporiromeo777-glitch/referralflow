// Prova end-to-end dell'archivio dello studio (6.10.2026) sul DB DEMO: un
// archivio DICOM FINTO (imaging/archivio-finto.py, cinque esami inventati) e
// la ricezione vera in una cartella temporanea. Cercare gli esami di un
// paziente, prenderne uno, copia temporanea agganciata alla cartella,
// scadenza, archivio che non conosce il Mac. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-archivio.ts <base> <cookie> <studio> <cartella conf>
import { promises as fs } from 'fs';
import path from 'path';
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';
import { scadutiVia } from '../../src/lib/imaging-archivio';

const [base, cookie, S, CONF] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const url = `${base}/api/prototipo/imaging/archivio`;
const h = { cookie, 'Content-Type': 'application/json' };
const leggi = async (q: string) => (await fetch(`${url}?${q}`, { headers: { cookie } })).json();
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prendi(study_uid: string, patient_id: string | null, archivio?: string): Promise<any> {
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ azione: 'recupera', study_uid, patient_id, archivio }) });
  const j = await r.json();
  if (!r.ok || j.esame_id) return { ...j, http: r.status };
  for (let i = 0; i < 40; i++) {
    await pausa(500);
    const s = await leggi(`richiesta=${j.richiesta}`);
    if (s.stato !== 'in_corso') return s;
  }
  return { stato: 'mai_finito' };
}

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const pazienti: string[] = [];
  const mieiEsami = () => query<{ id: string; study_uid: string }>(`select id, study_uid from imaging_esami where studio_id = $1 and (paziente_dicom ilike 'PROVARCHIV%' or paziente_dicom ilike 'ALTRAPROVA%' or paziente_dicom ilike 'TERZAPROVA%')`, [S]);
  try {
    const [{ id: pa }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Provarchivio', 'Anna', '1950-01-01') returning id`, [S]);
    const [{ id: pl }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome) values ($1, 'Altraprova', 'Luca') returning id`, [S]);
    pazienti.push(pa, pl);

    const st = await leggi('prova=1');
    verifica(st.configurato === true && st.risponde === true && st.ricezione === true && st.aperta === true && (st.archivi ?? []).length === 2 && st.archivi.every((x: any) => x.risponde), `stato: due archivi configurati, rispondono, ricezione accesa e aperta a tutti e due (${JSON.stringify(st)})`);

    const r1 = await leggi(`paziente=${pa}`);
    const tutti1: any[] = r1.esami ?? [];
    // Il primo archivio (lo studio) e il secondo (il centro radiologico): si cerca su tutti e due.
    const e1 = tutti1.filter((e) => e.archivio === 'principale'), eRx = tutti1.filter((e) => e.archivio === 'radiologia');
    verifica(e1.length === 3 && e1.every((e) => e.certezza === 'sicuro' && e.nascita === '1950-01-01' && !e.esame_id), `esami della paziente nell'archivio dello studio: tre, tutti sicuri — anche quello col cognome battuto male; né l'omonima né l'altro nato lo stesso giorno (${e1.length})`);
    verifica(e1[0]?.data === '2026-03-01' && e1[0]?.modalita === 'US' && e1[0]?.immagini === 2 && e1[2]?.data === '2024-05-05', 'dal più recente, con modalità e numero di immagini');
    verifica(tutti1.length === 4 && tutti1[0].archivio === 'radiologia' && eRx.length === 1 && eRx[0].archivio_nome === 'Radiologia di prova' && eRx[0].modalita === 'CT' && eRx[0].certezza === 'sicuro', `in più la TAC che sta solo nel secondo archivio, col nome dell'archivio; l'esame dell'altra persona no (${tutti1.length})`);
    const aRx = await prendi(eRx[0].study_uid, pa, 'radiologia');
    const [xRx] = await query<{ origine: string; patient_id: string | null }>(`select origine, patient_id from imaging_esami where studio_id = $1 and study_uid = $2`, [S, eRx[0].study_uid]);
    verifica(aRx.stato === 'arrivato' && xRx?.origine === 'archivio' && xRx.patient_id === pa, `«Prendi e apri» dal secondo archivio: arriva, copia temporanea, agganciata (${aRx.stato})`);
    const fileRx = path.join(CONF, 'archivio-radiologia.conf');
    const confRx = await fs.readFile(fileRx, 'utf-8');
    await fs.writeFile(fileRx, confRx.replace('PORTA=11151', 'PORTA=11199'));
    const zitto = await leggi(`paziente=${pa}`);
    await fs.writeFile(fileRx, confRx);
    verifica((zitto.esami ?? []).filter((e: any) => e.archivio === 'principale').length === 3 && /Radiologia di prova non risponde/.test(zitto.messaggio ?? ''), 'un archivio che non risponde non ferma l\'altro: i suoi esami mancano e lo si dice');

    const lib = await leggi('q=provarchivio');
    const nasc = await leggi('q=01.01.1950');
    const poco = await leggi('q=ab');
    verifica((lib.esami ?? []).length === 4 && (lib.esami ?? []).every((e: any) => e.certezza == null) && (nasc.esami ?? []).length === 5 && poco.errore === 'cosa_cercare', `ricerca libera sui due archivi: per cognome 4, per data di nascita 5, due lettere non si cercano (${(lib.esami ?? []).length}, ${(nasc.esami ?? []).length}, ${poco.errore})`);

    const eco = e1[0];
    const a1 = await prendi(eco.study_uid, pa);
    const [x1] = await query<{ id: string; origine: string; giorni: number; patient_id: string | null; stato: string; n: number }>(
      `select id, origine, extract(epoch from (scade_il - now())) / 86400 as giorni, patient_id, stato, n_immagini as n from imaging_esami where studio_id = $1 and study_uid = $2`, [S, eco.study_uid]);
    verifica(a1.stato === 'arrivato' && !!x1 && a1.esame_id === x1.id && x1.n === 2, `«Prendi e apri»: l'archivio manda, la ricezione riceve, l'esame entra (${a1.stato}, ${x1?.n} immagini)`);
    verifica(x1?.origine === 'archivio' && x1.giorni > 6.9 && x1.giorni < 7.1, `è una copia temporanea: scade fra 7 giorni (${x1?.origine}, ${x1 ? Math.round(x1.giorni * 10) / 10 : '-'})`);
    verifica(x1?.patient_id === pa && x1.stato === 'disponibile', 'chiesto dalla cartella, nome e nascita corrispondono: agganciato alla paziente');

    const r2 = await leggi(`paziente=${pa}`);
    const a2 = await prendi(eco.study_uid, pa);
    verifica((r2.esami ?? []).find((e: any) => e.study_uid === eco.study_uid)?.esame_id === x1?.id && a2.esame_id === x1?.id && a2.http === 200, 'la seconda volta è «già qui»: si apre senza richiederlo');

    // Paziente senza data di nascita in cartella: si trova, ma non si aggancia da solo.
    const r3 = await leggi(`paziente=${pl}`);
    const e3: any[] = r3.esami ?? [];
    const a3 = e3[0] ? await prendi(e3[0].study_uid, pl) : {};
    const [x3] = e3[0] ? await query<{ patient_id: string | null; stato: string }>(`select patient_id, stato from imaging_esami where studio_id = $1 and study_uid = $2`, [S, e3[0].study_uid]) : [];
    verifica(e3.length === 1 && e3[0].certezza === 'da_controllare' && a3.stato === 'arrivato' && !!x3 && x3.patient_id == null && x3.stato === 'da_verificare', `senza data di nascita in cartella: «da controllare», arriva ma resta da verificare (${e3.length}, ${a3.stato}, ${x3?.stato})`);

    // Ogni apertura allunga la vita della copia.
    await query(`update imaging_esami set scade_il = now() + interval '1 hour' where id = $1`, [x1.id]);
    const ap = await fetch(`${base}/api/prototipo/imaging/${x1.id}`, { headers: { cookie } });
    const [dopo] = await query<{ giorni: number }>(`select extract(epoch from (scade_il - now())) / 86400 as giorni from imaging_esami where id = $1`, [x1.id]);
    verifica(ap.status === 200 && dopo.giorni > 6.9 && (await ap.json()).esame?.origine === 'archivio', `aprire l'esame lo tiene in vita altri 7 giorni (${Math.round(dopo.giorni * 10) / 10})`);

    // Scaduta: via righe e file.
    const [f] = await query<{ storage_key: string }>(`select i.storage_key from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1 limit 1`, [x1.id]);
    const sulDisco = () => fs.access(path.join(process.cwd(), 'uploads', f.storage_key)).then(() => true, () => false);
    const prima = await sulDisco();
    await query(`update imaging_esami set scade_il = now() - interval '1 hour' where id = $1`, [x1.id]);
    const tolte = await scadutiVia();
    const [resta] = await query<{ id: string }>(`select id from imaging_esami where id = $1`, [x1.id]);
    verifica(prima && tolte >= 1 && !resta && !(await sulDisco()), `copia scaduta: sparisce l'esame e spariscono i suoi file (${tolte})`);
    const r4 = await leggi(`paziente=${pa}`);
    verifica((r4.esami ?? []).find((e: any) => e.study_uid === eco.study_uid)?.esame_id == null, 'nell\'archivio c\'è ancora: si può riprendere');

    // L'archivio non conosce il Mac: lo si dice con parole chiare.
    const file = path.join(CONF, 'archivio.conf');
    const conf = await fs.readFile(file, 'utf-8');
    await fs.writeFile(file, conf.replace(/^NOSTRO_AE=.*$/m, 'NOSTRO_AE=MACSCONOSCIUTO'));
    const a5 = await prendi(e1[1].study_uid, pa);
    await fs.writeFile(file, conf);
    verifica(a5.stato === 'fallito' && /non conosce ancora questo Mac/.test(a5.messaggio ?? ''), `archivio che non conosce il Mac: fallisce e dice perché (${a5.stato})`);

    const male = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ azione: 'recupera', study_uid: "1.2'; drop" }) });
    const senza = await fetch(`${url}?paziente=${pa}`);
    verifica(male.status === 400 && senza.status === 401, 'identificativo non valido rifiutato; senza sessione niente');
    const [reg] = await query<{ n: number }>(`select count(*)::int as n from imaging_accessi where studio_id = $1 and azione in ('archivio_cerca', 'archivio_richiesta') and created_at > now() - interval '5 minutes'`, [S]);
    verifica(reg.n >= 9, `ricerche e richieste nel registro degli accessi (${reg.n})`);
  } finally {
    for (const e of await mieiEsami()) {
      for (const f of await query<{ storage_key: string }>(`select i.storage_key from imaging_immagini i join imaging_serie s on s.id = i.serie_id where s.esame_id = $1`, [e.id])) await deleteFile(f.storage_key).catch(() => null);
      await query('delete from imaging_esami where id = $1', [e.id]);
    }
    await query(`delete from imaging_richieste where studio_id = $1 and chiesto_il > now() - interval '1 hour'`, [S]).catch(() => null);
    await query(`delete from imaging_accessi where studio_id = $1 and esame_id is null and azione in ('archivio_cerca', 'archivio_richiesta', 'copia_scaduta') and created_at > now() - interval '1 hour'`, [S]).catch(() => null);
    await query('delete from patients where id = any($1::uuid[])', [pazienti]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
