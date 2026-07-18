import pkg from 'pg';
const { Pool } = pkg;

// Crea (o aggiorna) uno studio della piattaforma.
// Uso: npm run create-studio -- "Nome Studio" slug-studio [email-notifiche] ["specialità"]

const [, , nome, slug, notifyEmail = null, specialita = null] = process.argv;
if (!nome || !slug) {
  console.error('Uso: npm run create-studio -- "<Nome Studio>" <slug> [email-notifiche] ["specialità"]');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('Lo slug può contenere solo minuscole, numeri e trattini (es. studio-rossi-lugano).');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  `insert into studios (nome, slug, notify_email, specialita) values ($1, $2, $3, $4)
   on conflict (slug) do update set nome = excluded.nome,
     notify_email = coalesce(excluded.notify_email, studios.notify_email),
     specialita = coalesce(excluded.specialita, studios.specialita)
   returning id`,
  [nome, slug, notifyEmail, specialita]
);
console.log(`Studio creato/aggiornato: ${nome} (slug: ${slug}, id: ${rows[0].id})`);
console.log(`Modulo pubblico: /invia?s=${slug}`);
console.log(`Primo admin: npm run create-user -- <email> <password> admin ${slug}`);
await pool.end();
