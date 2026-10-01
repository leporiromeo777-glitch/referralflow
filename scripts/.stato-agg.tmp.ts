import { pool } from '../src/lib/db';
import { statoAggiornamento } from '../src/lib/aggiorna-lettera-server';
import { query } from '../src/lib/db';
(async () => {
  for (const id of process.argv.slice(2)) {
    const [b] = await query<{ studio_id: string }>('select studio_id from referti_bozze where id = $1', [id]);
    const s = await statoAggiornamento(b.studio_id, id);
    console.log(id.slice(0, 8), JSON.stringify({ abilitato: s?.abilitato, richiesta: s?.richiesta, proposta: !!s?.proposta, stampella: s?.stampella ? { tipo: s.stampella.fonte.tipo, data: s.stampella.fonte.data, correzioni: s.stampella.correzioni.length, impaginata: s.stampella.impaginata } : null, errore: s?.errore ? s.errore.replace(/[A-ZÀ-Ý][a-zà-ý]+ [A-ZÀ-Ý][a-zà-ý]+/g, '…') : null, scelte: s?.scelte.length }));
  }
  await pool.end();
})().catch((e) => { console.error(e?.code ?? e?.name ?? e?.message ?? 'errore'); process.exit(1); });
