// Prova end-to-end di «Cartella sul computer» (1.10.2026): stato della
// condivisione letto dal Mac vero (solo nome e sì/no), .bat per Windows solo
// se la cartella è condivisa, nessuna credenziale nel file.
const [base, cookie] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  const url = `${base}/api/prototipo/cartella-dettati`;
  const g = await fetch(url, { headers: { cookie } });
  const d = await g.json().catch(() => ({}));
  verifica(g.status === 200 && typeof d.condivisa === 'boolean' && /^smb:\/\/[^/]+\/.+/.test(d.smb ?? ''), `stato della cartella (${g.status}, condivisa: ${d.condivisa})`);
  const w = await fetch(`${url}?file=win`, { headers: { cookie } });
  if (d.condivisa) {
    const t = await w.text();
    verifica(w.status === 200 && /attachment; filename="Collega cartella dettati\.bat"/.test(w.headers.get('content-disposition') ?? '') && t.includes('\r\n') && !/password|\/user:/i.test(t), 'file per Windows: .bat con CRLF, senza credenziali');
  } else {
    verifica(w.status === 409, 'cartella non condivisa: niente file per Windows (409)');
  }
  verifica((await fetch(url)).status === 401, 'senza sessione: 401');
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
