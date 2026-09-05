import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { decidiConfronto } from '../actions';

export const dynamic = 'force-dynamic';

// Confronto cieco tra la catena in produzione e una versione candidata sullo
// stesso dettato (2026-09-06, dall'analisi dei concorrenti: Abridge non
// rilascia senza test A/B cieco). La pipeline lanciata con «--ombra» consegna
// una seconda bozza (file_id «…-ombra»); qui le due proposte compaiono
// affiancate in ordine casuale ma stabile, senza dire quale sia la nuova.
// La preferenza del medico finisce in referti_confronti.

type Riga = { id: string; file_id: string; testo: string; created_at: string; ombra: boolean };

export default async function Confronto({ searchParams }: { searchParams: { ok?: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const righe = await query<Riga>(
    `select id, payload->>'file_id' as file_id,
            coalesce(testo_finale, payload->>'testo_corretto', '') as testo,
            created_at::text, coalesce((payload->>'ombra')::boolean, false) as ombra
       from referti_bozze
      where studio_id = $1 and created_at > now() - interval '90 days'
      order by created_at desc`,
    [session.studioId]
  );
  const decisi = await query<{ bozza_a: string; bozza_b: string; scelta: string | null; motivo: string | null; deciso_at: string | null }>(
    'select bozza_a, bozza_b, scelta, motivo, deciso_at::text from referti_confronti where studio_id = $1',
    [session.studioId]
  );
  const decisione = new Map(decisi.map((d) => [`${d.bozza_a}|${d.bozza_b}`, d]));

  const base = new Map(righe.filter((r) => !r.ombra).map((r) => [r.file_id, r]));
  const coppie = righe
    .filter((r) => r.ombra && r.file_id.endsWith('-ombra'))
    .map((o) => ({ ombra: o, prod: base.get(o.file_id.replace(/-ombra$/, '')) }))
    .filter((c): c is { ombra: Riga; prod: Riga } => !!c.prod);

  const tally = { prod: 0, ombra: 0, pari: 0 };
  for (const d of decisi) {
    if (d.scelta === 'a') tally.prod++;
    else if (d.scelta === 'b') tally.ombra++;
    else if (d.scelta === 'pari') tally.pari++;
  }

  return (
    <div className="content">
      <p className="muted small"><Link href="/referti">← Referti</Link></p>
      <h1>Confronto cieco</h1>
      <p className="muted">
        Due versioni della catena sullo stesso dettato, affiancate in ordine casuale. Scegli quella
        che useresti così com&apos;è, senza sapere quale sia la nuova: è l&apos;unico modo onesto di decidere
        se un cambio di motore, prompt o modello va in produzione.
      </p>
      {searchParams.ok === 'deciso' && <div className="card notice"><p>Preferenza registrata ✓</p></div>}
      {decisi.length > 0 && (
        <p className="muted small">
          Finora: produzione preferita {tally.prod}, candidata preferita {tally.ombra}, pari {tally.pari}.
        </p>
      )}
      {coppie.length === 0 && (
        <div className="card">
          <p className="muted">
            Nessuna coppia da confrontare. Per crearne una, dal Mac dello studio:
          </p>
          <pre className="grezzo-testo">python3 ~/referti-pipeline/pipeline.py --ombra /percorso/del/dettato.m4a</pre>
          <p className="muted small">
            La catena candidata (nuovo motore, prompt o modello, impostati via variabili
            d&apos;ambiente) consegna una seconda bozza per lo stesso audio; qui compare accanto a quella di produzione.
          </p>
        </div>
      )}
      {coppie.map(({ ombra, prod }) => {
        const chiave = `${prod.id}|${ombra.id}`;
        const d = decisione.get(chiave);
        // Ordine casuale ma stabile per coppia: né la pagina né il medico sanno quale sia la nuova.
        const inverti = parseInt(createHash('sha256').update(chiave).digest('hex').slice(0, 2), 16) % 2 === 1;
        const uno = inverti ? ombra : prod;
        const due = inverti ? prod : ombra;
        return (
          <div key={chiave} className="card">
            <h2>Dettato {prod.file_id.slice(0, 8)} · {dataOra(prod.created_at)}</h2>
            {d ? (
              <p className="muted">
                Deciso il {d.deciso_at ? dataOra(d.deciso_at) : ''}: {d.scelta === 'pari' ? 'pari' : d.scelta === 'a' ? 'produzione' : 'candidata'}
                {d.motivo ? ` — ${d.motivo}` : ''}
              </p>
            ) : (
              <>
                <div className="grid2">
                  <div>
                    <h3>Versione 1</h3>
                    <pre className="grezzo-testo" style={{ maxHeight: 520, overflow: 'auto' }}>{uno.testo}</pre>
                  </div>
                  <div>
                    <h3>Versione 2</h3>
                    <pre className="grezzo-testo" style={{ maxHeight: 520, overflow: 'auto' }}>{due.testo}</pre>
                  </div>
                </div>
                <form action={decidiConfronto} className="form" style={{ marginTop: 10 }}>
                  <input type="hidden" name="bozza_a" value={prod.id} />
                  <input type="hidden" name="bozza_b" value={ombra.id} />
                  <input type="hidden" name="inverti" value={inverti ? '1' : '0'} />
                  <label>Perché (facoltativo)
                    <input name="motivo" maxLength={200} placeholder="es. numeri giusti, meno da correggere" />
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-primary" name="scelta" value="1" type="submit">Preferisco la 1</button>
                    <button className="btn btn-primary" name="scelta" value="2" type="submit">Preferisco la 2</button>
                    <button className="btn" name="scelta" value="pari" type="submit">Pari</button>
                  </div>
                </form>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
