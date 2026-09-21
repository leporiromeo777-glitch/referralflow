// Una sessione di PROVA sul database demo: un JWT firmato con il SESSION_SECRET
// di .env per un utente del DB demo, senza password. Serve solo alle prove
// end-to-end (scripts/prova-e2e.sh), che girano contro referralflow_demo su
// una porta a parte: mai contro il database dello studio.
//   node scripts/e2e/sessione-demo.mjs <user_id> <email> <ruolo> <studio_id>
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf-8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const [id, email, role, studioId] = process.argv.slice(2);
if (!id || !email || !role || !studioId || !env.SESSION_SECRET) { console.error('uso: sessione-demo.mjs <user_id> <email> <ruolo> <studio_id>'); process.exit(2); }
const token = await new SignJWT({ id, email, role, studioId, studioNome: 'demo' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.SESSION_SECRET));
process.stdout.write(token);
