import pkg from 'pg';
const { Pool } = pkg;
import { hash } from '@node-rs/argon2';

// Crea o aggiorna un utente. Multi-studio: l'ultimo argomento è lo slug dello
// studio; se la piattaforma ha un solo studio si può omettere.
// Uso: npm run create-user -- <email> <password> [ruolo] [slug-studio]

const [, , email, password, role = 'segretaria', studioSlug] = process.argv;
if (!email || !password) {
  console.error('Uso: npm run create-user -- <email> <password> [ruolo] [slug-studio]');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let studio;
if (studioSlug) {
  ({ rows: [studio] } = await pool.query('select id, nome from studios where slug = $1', [studioSlug]));
  if (!studio) {
    console.error(`Studio con slug "${studioSlug}" non trovato. Crealo prima con create-studio.`);
    process.exit(1);
  }
} else {
  const { rows } = await pool.query('select id, nome from studios');
  if (rows.length !== 1) {
    console.error('Più studi sulla piattaforma: indica lo slug. Uso: ... [ruolo] <slug-studio>');
    process.exit(1);
  }
  studio = rows[0];
}

const password_hash = await hash(password);
await pool.query(
  `insert into users (studio_id, email, password_hash, role)
   values ($1, $2, $3, $4::user_role)
   on conflict (email) do update set password_hash = excluded.password_hash,
     role = excluded.role, studio_id = excluded.studio_id, attivo = true`,
  [studio.id, email.toLowerCase(), password_hash, role]
);
console.log(`Utente creato/aggiornato: ${email} (${role}) — studio: ${studio.nome}`);
await pool.end();
