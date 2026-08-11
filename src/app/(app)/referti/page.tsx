import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { PageHero, StatStrip } from '../PageHero';
import { ignoraSuggerimento } from './actions';

export const dynamic = 'force-dynamic';

// Bozze di referto dalla pipeline di trascrizione locale (docs/trascrizione/SPEC.md):
// arrivano qui come «da rivedere», un umano le conferma o le scarta. Nessuna
// bozza diventa definitiva da sola.

type Row = {
  id: string;
  stato: string;
  created_at: string;
  reviewed_at: string | null;
  paziente: string | null;
  n_divergenze: number;
  n_dubbi: number;
  n_allarmi: number;
};

export default async function Referti() {
  const session = await getSession();
  if (!session) redirect('/login');

  const rows = await query<Row>(
    `select id, stato, created_at::text, reviewed_at::text,
            payload -> 'campi_estratti' ->> 'nome_paziente' as paziente,
            coalesce(jsonb_array_length(payload -> 'divergenze'), 0)::int as n_divergenze,
            coalesce(jsonb_array_length(payload -> 'segmenti_dubbi'), 0)::int as n_dubbi,
            coalesce(jsonb_array_length(payload -> 'allarmi_numerici'), 0)::int as n_allarmi
       from referti_bozze
      where studio_id = $1
        and (stato = 'bozza' or reviewed_at > now() - interval '30 days')
      order by (stato = 'bozza') desc, created_at desc
      limit 200`,
    [session.studioId]
  );

  const daRivedere = rows.filter((r) => r.stato === 'bozza');
  const gestite = rows.filter((r) => r.stato !== 'bozza');

  // Suggerimenti per il dizionario, imparati dalle correzioni ricorrenti
  // (mostrati quando la stessa sostituzione ricorre almeno due volte).
  const suggerimenti = await query<{ id: string; da: string; a: string; conteggio: number }>(
    `select id, da, a, conteggio from referti_suggerimenti
      where studio_id = $1 and not ignorato and not applicato and conteggio >= 2
      order by conteggio desc, updated_at desc
      limit 12`,
    [session.studioId]
  );

  return (
    <>
      <PageHero zone="green" eyebrow="Operativo" title="Bozze di referto">
        Le trascrizioni dei referti dettati arrivano qui come bozze: rivedile,
        correggi il testo e conferma. Nessuna bozza è definitiva senza una persona.
      </PageHero>

      <StatStrip
        items={[
          { label: 'Da rivedere', value: daRivedere.length, tone: daRivedere.length > 0 ? 'warn' : undefined },
          { label: 'Gestite negli ultimi 30 giorni', value: gestite.length },
        ]}
      />

      {suggerimenti.length > 0 && (
        <div className="card learn-box">
          <h2>Impara dalle conferme</h2>
          <p className="muted">
            Queste parole vengono corrette spesso a mano. Aggiungile al dizionario
            della trascrizione (dal pannello sul Mac dello studio) e la trascrizione
            smetterà di sbagliarle.
          </p>
          <ul className="learn-list">
            {suggerimenti.map((s) => (
              <li key={s.id} className="learn-item">
                <span className="learn-pair">
                  <span className="learn-da">{s.da}</span>
                  <span className="learn-arr">→</span>
                  <span className="learn-a">{s.a}</span>
                </span>
                <span className="learn-count">×{s.conteggio}</span>
                <form action={ignoraSuggerimento}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn btn-ghost btn-small" type="submit">Ignora</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {daRivedere.length === 0 && (
        <div className="card"><p className="muted">Nessuna bozza in attesa di revisione.</p></div>
      )}

      {daRivedere.map((r) => (
        <div key={r.id} className={`qrow${r.n_allarmi > 0 ? ' tone-danger' : r.n_divergenze + r.n_dubbi > 0 ? ' tone-warn' : ''}`}>
          <Link className="qrow-link" href={`/referti/${r.id}`}>
            <div className="qrow-top">
              <strong>{r.paziente && r.paziente !== 'non indicato' ? r.paziente : 'Paziente non indicato'}</strong>
              <span className="badge badge-warn">da rivedere</span>
            </div>
            <div className="qrow-sub">Ricevuta il {dataOra(r.created_at)}</div>
            <div className="qrow-meta">
              {r.n_divergenze > 0 && <span className="badge badge-warn">{r.n_divergenze} divergenze audio</span>}
              {r.n_dubbi > 0 && <span className="badge badge-warn">{r.n_dubbi} segmenti dubbi</span>}
              {r.n_allarmi > 0 && <span className="badge badge-danger">{r.n_allarmi} allarmi numerici</span>}
              {r.n_divergenze + r.n_dubbi + r.n_allarmi === 0 && (
                <span className="badge badge-success">nessun punto segnalato</span>
              )}
            </div>
          </Link>
        </div>
      ))}

      {gestite.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Gestite di recente</h2>
          {gestite.map((r) => (
            <div key={r.id} className="qrow">
              <Link className="qrow-link" href={`/referti/${r.id}`}>
                <div className="qrow-top">
                  <strong>{r.paziente && r.paziente !== 'non indicato' ? r.paziente : 'Paziente non indicato'}</strong>
                  <span className={`badge ${r.stato === 'confermata' ? 'badge-success' : 'badge-danger'}`}>
                    {r.stato}
                  </span>
                </div>
                <div className="qrow-sub">
                  Ricevuta il {dataOra(r.created_at)}
                  {r.reviewed_at ? ` · gestita il ${dataOra(r.reviewed_at)}` : ''}
                </div>
              </Link>
            </div>
          ))}
        </>
      )}
    </>
  );
}
