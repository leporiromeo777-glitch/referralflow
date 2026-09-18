import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== 'production') global._pgPool = pool;

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

// Più scritture che devono valere come una sola (18.9.2026).
//
// Senza questo, una sequenza di `query()` si interrompe a metà se la seconda
// fallisce e lascia il database in uno stato che nessuno ha voluto: un
// paziente creato senza la sua referral, prestazioni segnate come esportate
// da un'esportazione che non è mai stata registrata. Qui le query passano
// tutte dalla stessa connessione dentro BEGIN/COMMIT, e al primo errore si
// torna indietro.
//
//   await transazione(async (q) => {
//     const [p] = await q(`insert into patients … returning id`, [...]);
//     await q(`insert into referrals …`, [p.id]);
//   });
export async function transazione<T>(fn: (q: <R = any>(text: string, params?: any[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const esito = await fn(async <R,>(text: string, params?: any[]) => (await client.query(text, params)).rows as R[]);
    await client.query('commit');
    return esito;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* la connessione è già persa: il rollback lo fa il server */ }
    throw e;
  } finally {
    client.release();
  }
}
