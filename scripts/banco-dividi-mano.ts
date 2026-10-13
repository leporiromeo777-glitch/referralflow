// Banco «scritta a mano o stampata?» di Dividi cartella (13.10.2026): pagine INVENTATE (scripts/banco-dividi-mano/pagine.py:
// lettere stampate con la firma, un laboratorio, un modulo vuoto; appunti con caratteri che imitano la penna, un modulo
// compilato a penna) date al modello locale come le darebbe l'analisi. Dice quante ne riconosce e quanto ci mette.
// Chiama il modello locale: non parte se la catena dei referti lavora.
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/banco-dividi-mano.ts [modello] [lato in pixel]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catenaOccupata } from '../src/lib/esporta-grezze';
import { MODELLO, guardaPagina } from '../src/lib/dividi/analisi';
(async () => {
  if (await catenaOccupata()) { console.log('la catena dei referti lavora: riprova dopo'); process.exit(2); }
  const modello = process.argv[2] || MODELLO, lato = Number(process.argv[3]) || 0;
  const py = process.env.IMAGING_PYTHON ?? path.join(os.homedir(), '.referralflow-imaging', 'bin', 'python');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-banco-mano-'));
  try {
    execFileSync(py, [path.join('scripts', 'banco-dividi-mano', 'pagine.py'), dir]);
    if (lato) execFileSync(py, ['-c', `import sys,glob\nfrom PIL import Image\nfor f in glob.glob(sys.argv[1]+'/*.png'):\n    im=Image.open(f); im.thumbnail((${lato},${lato})); im.save(f)`, dir]);
    let giuste = 0, n = 0; const tempi: number[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.png')).sort()) {
      const attesa = f.startsWith('M-'), t0 = Date.now();
      const v = await guardaPagina(readFileSync(path.join(dir, f)).toString('base64'), modello);
      const ms = Date.now() - t0; tempi.push(ms); n++;
      const ok = !!v && v.mano === attesa; if (ok) giuste++;
      console.log(`${ok ? 'ok' : 'NO'} ${f.replace('.png', '')} → ${v ? `mano=${v.mano} data=${v.data ?? '-'}` : 'nessuna risposta'} (${(ms / 1000).toFixed(1)} s)`);
    }
    const dopo = tempi.slice(1);
    console.log(`\n${giuste} su ${n} · modello ${modello}${lato ? ` · lato ${lato}px` : ''} · prima pagina ${(tempi[0] / 1000).toFixed(1)} s, poi in media ${(dopo.reduce((a, b) => a + b, 0) / Math.max(1, dopo.length) / 1000).toFixed(1)} s a pagina`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
})();
