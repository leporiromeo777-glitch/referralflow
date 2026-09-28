// Prova end-to-end di «Carica documento» nella scheda del paziente
// (28.9.2026) sul DB DEMO, con dati inventati: PDF con testo, PDF senza
// testo (come una scansione senza OCR), file oltre i 50 MB, paziente solo
// d'agenda. Poi toglie tutto. Uso (da prova-e2e.sh):
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-documenti.ts <base> <cookie> <studio>
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

// Un PDF minimo e valido, con o senza una riga di testo.
function pdf(testo: string | null, pagine = 1): Buffer {
  const ogg: string[] = [];
  const kids = Array.from({ length: pagine }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
  ogg.push('<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${pagine} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let i = 0; i < pagine; i++) {
    const flusso = testo ? `BT /F1 12 Tf 72 720 Td (${testo} pagina ${i + 1}) Tj ET` : '';
    ogg.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${flusso.length} >>\nstream\n${flusso}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const pos: number[] = [];
  ogg.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${ogg.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${ogg.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function carica(pid: string, dati: Buffer, nome: string, categoria = 'altro', nota = '') {
  const fd = new FormData();
  fd.append('file', new Blob([dati], { type: nome.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' }), nome);
  fd.append('categoria', categoria); fd.append('nota', nota);
  const r = await fetch(`${base}/api/prototipo/pazienti/${pid}/documenti`, { method: 'POST', headers: { cookie }, body: fd });
  return { status: r.status, j: await r.json().catch(() => ({})) as any };
}

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  let paz: string | null = null;
  try {
    [{ id: paz }] = await query(`insert into patients (studio_id, cognome, nome) values ($1,'Scansioneprova','Paziente') returning id`, [S]);
    const a = await carica(paz!, pdf('Esame di prova con testo leggibile', 3), 'cartella.pdf', 'laboratorio', 'Laboratorio 2020-2024');
    verifica(a.status === 201 && a.j.pagine === 3 && a.j.senza_testo === false, `PDF con testo: caricato, 3 pagine, testo trovato (${a.status} ${JSON.stringify(a.j)})`);
    const b = await carica(paz!, pdf(null, 4), 'scansione.pdf', 'ecg');
    verifica(b.status === 201 && b.j.senza_testo === true, 'PDF senza testo: caricato con l\'avviso «senza testo»');
    const righe = await query<{ categoria: string; nota: string | null }>('select categoria, nota from patient_documents where patient_id = $1 order by uploaded_at', [paz]);
    verifica(righe.length === 2 && righe[0].categoria === 'laboratorio' && righe[0].nota === 'Laboratorio 2020-2024' && righe[1].categoria === 'ecg', 'in cartella con categoria e descrizione');
    const acc = await query<{ n: number }>(`select count(*)::int as n from document_access_log where document_id = any($1::uuid[])`, [[a.j.id, b.j.id]]).catch(() => [{ n: -1 }]);
    verifica(acc[0].n === -1 || acc[0].n >= 2, 'caricamento nel registro accessi');
    const grande = Buffer.alloc(51 * 1024 * 1024, 0x20); grande.write('%PDF-1.4\n');
    const c = await carica(paz!, grande, 'enorme.pdf');
    verifica(c.status === 413, `oltre 50 MB respinto (${c.status})`);
    const d = await carica('ag-scansioneprova', pdf('x'), 'x.pdf');
    verifica(d.status === 409, 'paziente solo d\'agenda: prima la scheda (409)');
    const e = await carica(paz!, Buffer.from('MZ'), 'programma.exe');
    verifica(e.status === 415, 'formato non ammesso (415)');
  } finally {
    if (paz) {
      const docs = await query<{ id: string; storage_key: string }>('select id, storage_key from patient_documents where patient_id = $1', [paz]);
      for (const x of docs) await deleteFile(x.storage_key).catch(() => null);
      await query('delete from document_access_log where document_id = any($1::uuid[])', [docs.map((x) => x.id)]).catch(() => null);
      await query('delete from patient_documents where patient_id = $1', [paz]);
      await query('delete from patients where id = $1', [paz]);
    }
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
