import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { PageHero, StatStrip } from '../PageHero';

export const dynamic = 'force-dynamic';

// Consulto rapido (eConsult): domande cliniche scritte dei medici invianti.
// Rispondere per iscritto spesso evita una visita inutile; quando la visita
// serve, dal dettaglio il consulto si converte in referral con un clic.

type Row = {
  id: string;
  stato: string;
  domanda: string;
  medico: string;
  medico_studio: string | null;
  created_at: string;
  answered_at: string | null;
  n_allegati: number;
};

const STATO: Record<string, { label: string; tone: string }> = {
  aperto: { label: 'da rispondere', tone: 'warn' },
  risposto: { label: 'risposto', tone: 'success' },
  convertito: { label: 'convertito in visita', tone: 'accent' },
};

export default async function Consulti() {
  const session = await getSession();
  if (!session) redirect('/login');

  const rows = await query<Row>(
    `select c.id, c.stato, c.domanda, d.nome as medico, d.studio as medico_studio,
            c.created_at::text, c.answered_at::text,
            (select count(*) from consulto_attachments a where a.consulto_id = c.id)::int as n_allegati
       from consulti c
       join referring_doctors d on d.id = c.referring_doctor_id
      where c.studio_id = $1
        and (c.stato = 'aperto' or c.created_at > now() - interval '90 days')
      order by (c.stato = 'aperto') desc, c.created_at desc
      limit 200`,
    [session.studioId]
  );

  const aperti = rows.filter((r) => r.stato === 'aperto');
  const gestiti = rows.filter((r) => r.stato !== 'aperto');

  return (
    <>
      <PageHero zone="green" eyebrow="Operativo" title="Consulti rapidi">
        Domande cliniche scritte dei medici invianti: una risposta dello specialista
        spesso evita una visita. Se la visita serve, il consulto diventa una referral.
      </PageHero>

      <StatStrip
        items={[
          { label: 'Da rispondere', value: aperti.length, tone: aperti.length > 0 ? 'warn' : undefined },
          { label: 'Gestiti negli ultimi 90 giorni', value: gestiti.length },
        ]}
      />

      {aperti.length === 0 && (
        <div className="card"><p className="muted">Nessun consulto in attesa di risposta.</p></div>
      )}

      {aperti.map((r) => (
        <div key={r.id} className="qrow tone-warn">
          <Link className="qrow-link" href={`/consulti/${r.id}`}>
            <div className="qrow-top">
              <strong>{r.medico}{r.medico_studio ? ` · ${r.medico_studio}` : ''}</strong>
              <span className="badge badge-warn">da rispondere</span>
            </div>
            <div className="qrow-sub">{r.domanda.length > 160 ? `${r.domanda.slice(0, 160)}…` : r.domanda}</div>
            <div className="qrow-meta">
              <span className="muted small">Arrivato il {dataOra(r.created_at)}</span>
              {r.n_allegati > 0 && <span className="badge badge-accent">{r.n_allegati} allegati</span>}
            </div>
          </Link>
        </div>
      ))}

      {gestiti.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Gestiti di recente</h2>
          {gestiti.map((r) => (
            <div key={r.id} className="qrow">
              <Link className="qrow-link" href={`/consulti/${r.id}`}>
                <div className="qrow-top">
                  <strong>{r.medico}{r.medico_studio ? ` · ${r.medico_studio}` : ''}</strong>
                  <span className={`badge badge-${STATO[r.stato]?.tone ?? 'warn'}`}>
                    {STATO[r.stato]?.label ?? r.stato}
                  </span>
                </div>
                <div className="qrow-sub">{r.domanda.length > 160 ? `${r.domanda.slice(0, 160)}…` : r.domanda}</div>
                <div className="qrow-meta">
                  <span className="muted small">
                    Arrivato il {dataOra(r.created_at)}
                    {r.answered_at ? ` · risposto il ${dataOra(r.answered_at)}` : ''}
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </>
      )}
    </>
  );
}
