// Prova della copia di sicurezza fuori dal Mac (13.10.2026), con dati INVENTATI e cartelle temporanee: i pacchi si
// cifrano come fa mac/backup-db.sh, l'app li porta a destinazione (src/lib/backup-fuori.ts), si riaprono con
// mac/apri-pacco.sh e devono tornare identici. Non tocca né il database né il server dello studio.
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/prova-backup-fuori.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { portaFuori } from '../src/lib/backup-fuori';

let ok = 0, no = 0;
const verifica = (c: boolean, cosa: string) => { if (c) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rf-prova-backup-'));
  try {
    const pronti = path.join(dir, 'fuori'), dest = path.join(dir, 'server', 'ReferralFlow-backup'), stato = path.join(dir, 'stato.json'), chiave = path.join(dir, 'chiave');
    mkdirSync(pronti, { recursive: true });
    const openssl = existsSync('/opt/homebrew/bin/openssl') ? '/opt/homebrew/bin/openssl' : '/usr/bin/openssl';
    writeFileSync(chiave, execFileSync(openssl, ['rand', '-base64', '48']), { mode: 0o600 });
    const cifra = (chiaro: Buffer, nome: string) => writeFileSync(path.join(pronti, nome), execFileSync(openssl, ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-pass', `file:${chiave}`], { input: chiaro, maxBuffer: 1e9 }));
    const oggi = new Date().toISOString().slice(0, 10), vecchio = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
    const database = Buffer.from('-- database inventato\ncreate table prova (id int);\n'.repeat(2000));
    const allegati = Buffer.alloc(3_000_000, 7);
    cifra(database, `referralflow-${oggi}.sql.gz.enc`); cifra(allegati, `allegati-${oggi}-0230.tar.enc`); cifra(Buffer.from('configurazione inventata'), `configurazione-${oggi}.tar.enc`);
    writeFileSync(path.join(pronti, `referralflow-${oggi}.sql.gz.enc.parziale`), 'a metà'); writeFileSync(path.join(pronti, 'altro.txt'), 'non è un pacco');
    // sul «server» ci sono già un database vecchio, un pacco di allegati vecchio e un file di qualcun altro
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, `referralflow-${vecchio}.sql.gz.enc`), 'vecchio'); writeFileSync(path.join(dest, `allegati-${vecchio}-0230.tar.enc`), 'vecchio ma serve'); writeFileSync(path.join(dest, 'documento-dello-studio.docx'), 'non nostro');

    const r = await portaFuori({ pronti, dest, stato });
    const la = readdirSync(dest).sort(), qui = readdirSync(pronti).sort();
    verifica(r.stato === 'fatto' && r.portati === 3, `i tre pacchi arrivano a destinazione (${r.stato}, ${r.portati})`);
    verifica(!la.includes(`referralflow-${vecchio}.sql.gz.enc`) && la.includes(`allegati-${vecchio}-0230.tar.enc`) && la.includes('documento-dello-studio.docx'), 'il database di 45 giorni fa si toglie; i pacchi degli allegati restano tutti; un file non nostro non si tocca');
    verifica(qui.join() === ['altro.txt', `referralflow-${oggi}.sql.gz.enc.parziale`].sort().join(), 'sul Mac i pacchi arrivati si tolgono; un pacco a metà e un file qualunque restano dove sono');
    verifica(!la.some((n) => n.endsWith('.parziale')), 'a destinazione nessun file a metà');
    const s = JSON.parse(readFileSync(stato, 'utf-8'));
    verifica(s.sul_server === 4 && s.ultimo_database === `referralflow-${oggi}.sql.gz.enc`, `lo stato dice quanti pacchi ci sono e qual è l'ultimo database (${s.sul_server})`);
    // sul server il contenuto NON si legge
    const cifrato = readFileSync(path.join(dest, `referralflow-${oggi}.sql.gz.enc`));
    verifica(!cifrato.includes('database inventato') && cifrato.subarray(0, 8).toString() === 'Salted__', 'sul server il pacco è cifrato: dentro non si legge niente');
    // si riapre con la chiave, identico
    const aperto = path.join(dir, 'aperto.sql.gz');
    execFileSync('bash', ['mac/apri-pacco.sh', path.join(dest, `referralflow-${oggi}.sql.gz.enc`), aperto], { env: { ...process.env, BACKUP_CHIAVE: chiave } });
    verifica(readFileSync(aperto).equals(database), 'con la chiave il pacco si riapre e torna identico');
    writeFileSync(path.join(dir, 'chiave-sbagliata'), 'un-altra-chiave');
    let rifiutato = false; try { execFileSync('bash', ['mac/apri-pacco.sh', path.join(dest, `referralflow-${oggi}.sql.gz.enc`), path.join(dir, 'no')], { env: { ...process.env, BACKUP_CHIAVE: path.join(dir, 'chiave-sbagliata') }, stdio: 'pipe' }); } catch { rifiutato = true; }
    verifica(rifiutato, 'con un\'altra chiave non si riapre');
    // un secondo giro senza niente di nuovo non porta niente e non rompe niente
    const r2 = await portaFuori({ pronti, dest, stato });
    verifica(r2.stato === 'fatto' && r2.portati === 0 && readdirSync(dest).length === la.length, 'un secondo giro senza pacchi nuovi non cambia niente');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(`${ok} ok, ${no} no`); process.exit(no ? 1 : 0);
})();
