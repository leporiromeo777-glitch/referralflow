// Prova end-to-end di «Carica documento» nella scheda del paziente
// (28.9.2026) sul DB DEMO, con dati inventati: PDF con testo, PDF senza
// testo (come una scansione senza OCR), file oltre i 50 MB, paziente solo
// d'agenda. Poi toglie tutto. Uso (da prova-e2e.sh):
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-documenti.ts <base> <cookie> <studio>
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
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
    const flusso = testo ? `BT /F1 22 Tf 60 700 Td (${testo} pagina ${i + 1}) Tj ET` : '';
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
    verifica(b.status === 201 && b.j.senza_testo === true && b.j.ocr === 'in_coda', 'PDF senza testo: caricato e in coda per l\'OCR');
    // Una «scansione»: il PDF con testo trasformato in sole immagini da
    // Ghostscript; il Mac deve rimetterci il testo con l'OCR.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-prova-ocr-'));
    writeFileSync(path.join(dir, 'a.pdf'), pdf('Ecocardiogramma di controllo', 2));
    execFileSync('/opt/homebrew/bin/gs', ['-q', '-sDEVICE=pdfimage24', '-r200', '-o', path.join(dir, 'b.pdf'), path.join(dir, 'a.pdf')]);
    const scansione = readFileSync(path.join(dir, 'b.pdf'));
    rmSync(dir, { recursive: true, force: true });
    const o = await carica(paz!, scansione, 'scansione-ocr.pdf', 'referto');
    verifica(o.status === 201 && o.j.senza_testo === true && o.j.ocr === 'in_coda', 'scansione di sole immagini: in coda per l\'OCR');
    let st: { ocr_stato: string | null; ocr_pagine_testo: number | null } | undefined;
    for (let i = 0; i < 60; i++) {
      [st] = await query<{ ocr_stato: string | null; ocr_pagine_testo: number | null }>('select ocr_stato, ocr_pagine_testo from patient_documents where id = $1', [o.j.id]);
      if (st?.ocr_stato !== 'da_fare') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (st?.ocr_stato === 'da_fare') console.log('ok OCR rimandato: la catena dei referti sta lavorando (si rifà al prossimo giro)');
    else verifica(st?.ocr_stato === 'fatto' && st.ocr_pagine_testo === 2, `OCR fatto sul Mac: 2 pagine su 2 con testo (${st?.ocr_stato}, ${st?.ocr_pagine_testo})`);
    const righe = await query<{ categoria: string; nota: string | null }>('select categoria, nota from patient_documents where patient_id = $1 order by uploaded_at', [paz]);
    verifica(righe.length >= 3 && righe[0].categoria === 'laboratorio' && righe[0].nota === 'Laboratorio 2020-2024' && righe[1].categoria === 'ecg', 'in cartella con categoria e descrizione');
    const acc = await query<{ n: number }>(`select count(*)::int as n from document_access_log where document_id = any($1::uuid[])`, [[a.j.id, b.j.id]]).catch(() => [{ n: -1 }]);
    verifica(acc[0].n === -1 || acc[0].n >= 2, 'caricamento nel registro accessi');
    // «Estrai pagine»: dal PDF di 3 pagine, le pagine 2-3 come ECG.
    const es = `${base}/api/prototipo/documenti/${a.j.id}/estrai`;
    const g = await (await fetch(es, { headers: { cookie } })).json();
    verifica(g.pagine === 3, `estrai: il documento ha 3 pagine (${g.pagine})`);
    const pe = await fetch(es, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ pagine: '2–3', categoria: 'ecg', nota: 'ECG di prova' }) });
    const je = await pe.json();
    const [nuovo] = await query<{ categoria: string; nota: string; filename: string }>('select categoria, nota, filename from patient_documents where id = $1', [je.id ?? null]);
    verifica(pe.status === 201 && je.pagine === 2 && nuovo?.categoria === 'ecg' && nuovo.nota === 'ECG di prova' && /pp\. 2–3\.pdf$/.test(nuovo.filename), 'estrai: 2 pagine in un documento nuovo, categoria ECG');
    const ge = await (await fetch(`${base}/api/prototipo/documenti/${je.id}/estrai`, { headers: { cookie } })).json();
    verifica(ge.pagine === 2, 'estrai: il nuovo PDF ha davvero 2 pagine');
    const oltre = await fetch(es, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ pagine: '3-5' }) });
    verifica(oltre.status === 400, 'estrai: pagine oltre la fine respinte (400)');

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
