// Prova end-to-end della misura senza conferma (29.9.2026) sul DB DEMO,
// dati inventati: il Word scaricato di una bozza non confermata lascia una
// misura (solo numeri), lo stesso Word scaricato di nuovo non la raddoppia,
// una correzione nella piattaforma sì; il riepilogo della settimana li conta.
import { query, pool } from '../../src/lib/db';
import { nuovoArtefatto } from '../../src/lib/audit/lineage';
import { datiSettimana } from '../../src/lib/riepilogo-settimana-server';
import { togliAudit } from './pulizia-audit';

const [base, cookie, S] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const ai = 'Caro Luca, rivedo il paziente per un controllo. Pressione ben controllata. Cordiali saluti.';
  const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-misura-' || gen_random_uuid(), $2, 'referto') returning id`, [S, JSON.stringify({ testo_corretto: ai, medico: { id: 'moccetti' } })]);
  try {
    await nuovoArtefatto(S, id, 'catena_finale', 'AI', ai);
    const scarica = () => fetch(`${base}/api/referti/docx/${id}`, { headers: { cookie } });
    const righe = async () => query<{ edit_count: number; momento: string; medico: string | null; ruolo: string }>('select edit_count, momento, medico, editor_role as ruolo from audit.misure_lavoro where bozza_id = $1 order by id', [id]);
    const aspetta = async (n: number) => { for (let i = 0; i < 20; i++) { if ((await righe()).length >= n) return; await new Promise((r) => setTimeout(r, 250)); } };

    const w1 = await scarica();
    await aspetta(1);
    let r = await righe();
    verifica(w1.status === 200 && r.length === 1 && r[0].edit_count === 0 && r[0].momento === 'word' && r[0].medico === 'moccetti', `Word scaricato senza correzioni: una misura a 0 (${w1.status}, ${r.length})`);
    await scarica();
    await new Promise((res) => setTimeout(res, 1500));
    verifica((await righe()).length === 1, 'stesso Word scaricato di nuovo: nessuna misura in più');
    await query(`update referti_bozze set testo_finale = $2 where id = $1`, [id, ai.replace('ben controllata', 'ben compensata')]);
    await scarica();
    await aspetta(2);
    r = await righe();
    verifica(r.length === 2 && r[1].edit_count > 0, `corretto nella piattaforma e riscaricato: la nuova misura conta la correzione (${r[1]?.edit_count})`);
    const d = await datiSettimana(S, new Date(Date.now() - 86400_000), new Date(Date.now() + 86400_000));
    // La misura principale è quella di chi rivede (SECRETARY): il medico si tiene a parte.
    if (r[0].ruolo === 'SECRETARY') verifica(d.misurati >= 1 && d.word >= 1 && d.perMedico.some((m) => m.medico === 'moccetti'), `riepilogo della settimana: la bozza conta una volta sola, con il suo medico (${d.misurati} misurati)`);
    else verifica(d.word >= 1 && !d.perMedico.some((m) => m.medico === 'moccetti'), `riepilogo della settimana: il Word del medico si conta, la sua misura resta fuori (${r[0].ruolo})`);
    const [c] = await query<{ n: number }>(`update referti_bozze set stato = 'confermata' where id = $1 returning 1 as n`, [id]);
    const wc = await scarica();
    await new Promise((res) => setTimeout(res, 1000));
    verifica(!!c && wc.status === 200 && (await righe()).length === 2, 'bozza confermata: il Word non aggiunge misure (vale la revisione confermata)');
  } finally {
    await query('delete from audit.misure_lavoro where bozza_id = $1', [id]);
    await togliAudit([id]);
    await query('delete from referti_eventi where bozza_id = $1', [id]);
    await query('delete from referti_bozze where id = $1', [id]);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
