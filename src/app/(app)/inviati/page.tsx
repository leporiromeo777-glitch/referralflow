import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS, URGENZA } from '@/lib/status';
import { eta, dataOra } from '@/lib/format';
import { PageHero, StatStrip } from '../PageHero';

export const dynamic = 'force-dynamic';

// Monitoraggio dei pazienti affidati ad altri studi della piattaforma:
// lo stato è quello reale della coda dello studio destinatario, in tempo reale.

type Row = {
  id: string;
  quesito: string | null;
  urgenza: string;
  status: string;
  appuntamento_at: string | null;
  created_at: string;
  updated_at: string;
  cognome: string;
  nome: string;
  data_nascita: string | null;
  studio_nome: string;
};
type ExtRow = {
  id: string;
  cognome: string;
  nome: string;
  data_nascita: string | null;
  quesito: string | null;
  urgenza: string;
  stato: string;
  appuntamento_at: string | null;
  risposta_nota: string | null;
  created_at: string;
  responded_at: string | null;
  ext_nome: string;
};

const STATO_ESTERNO: Record<string, { label: string; tone: string }> = {
  inviato: { label: 'In attesa di risposta', tone: 'accent' },
  preso_in_carico: { label: 'Preso in carico', tone: 'success' },
  rifiutato: { label: 'Non accettato', tone: 'danger' },
};

export default async function Inviati({
  searchParams,
}: {
  searchParams: { ok?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const rows = await query<Row>(
    `select r.id, r.quesito, r.urgenza, r.status, r.appuntamento_at,
            r.created_at, r.updated_at,
            p.cognome, p.nome, p.data_nascita,
            s.nome as studio_nome
       from referrals r
       join patients p on p.id = r.patient_id
       join studios s on s.id = r.studio_id
      where r.origin_studio_id = $1
      order by (r.status = 'chiusa'), r.created_at desc`,
    [session.studioId]
  );

  // Affidi a studi esterni (fuori piattaforma), con la loro risposta.
  const esterni = await query<ExtRow>(
    `select er.id, er.cognome, er.nome, er.data_nascita::text, er.quesito,
            er.urgenza::text, er.stato, er.appuntamento_at::text, er.risposta_nota,
            er.created_at::text, er.responded_at::text,
            es.nome as ext_nome
       from external_referrals er
       join external_studios es on es.id = er.external_studio_id
      where er.studio_id = $1
        -- Gli affidi convertiti (lo studio si è attivato) vivono ora come
        -- referral di piattaforma: compaiono nell'elenco principale.
        and er.converted_referral_id is null
      order by (er.stato <> 'inviato'), er.created_at desc`,
    [session.studioId]
  );

  const aperte = rows.filter((r) => r.status !== 'chiusa').length
    + esterni.filter((e) => e.stato === 'inviato').length;

  return (
    <>
      <PageHero
        zone="slate"
        eyebrow="Monitoraggio invii"
        title="Pazienti affidati ad altri studi"
      >
        Qui vedi in tempo reale lo stato dei pazienti che hai affidato ad altri studi
        della piattaforma: presa in carico, appuntamento fissato, referto inviato.
      </PageHero>

      <div className="page-actions">
        <Link className="btn btn-primary" href="/affida">+ Affida un paziente</Link>
      </div>

      {searchParams.ok === 'esterno' ? (
        <div className="card notice">
          <p>
            Affido inviato ✓ — lo studio esterno ha ricevuto l'email col link sicuro.
            Vedrai qui la sua risposta.
          </p>
        </div>
      ) : searchParams.ok ? (
        <div className="card notice">
          <p>Referral inviata allo studio scelto ✓ — ne seguirai lo stato da questa pagina.</p>
        </div>
      ) : null}

      <StatStrip
        items={[
          { label: 'In corso presso altri studi', value: aperte },
          { label: 'Totale inviate', value: rows.length + esterni.length },
        ]}
      />

      {rows.length === 0 && esterni.length === 0 && (
        <div className="empty">
          Nessun paziente affidato ad altri studi. Usa «Affida un paziente» quando
          serve una prestazione che non offrite: scegli lo studio e segui lo stato da qui.
        </div>
      )}

      <ul className="queue">
        {rows.map((r) => (
          <li key={r.id} className={`qrow tone-${r.status === 'chiusa' ? 'gray' : URGENZA[r.urgenza]?.tone ?? 'gray'}`}>
            <div className="qrow-link">
              <div className="qrow-main">
                <div className="qrow-top">
                  <span className="pname">
                    {r.cognome} {r.nome}
                    {r.data_nascita ? <span className="age">, {eta(r.data_nascita)}</span> : null}
                  </span>
                  <span className={`badge badge-${STATUS[r.status]?.tone}`}>
                    {STATUS[r.status]?.label}
                  </span>
                </div>
                <div className="qrow-sub">
                  → {r.studio_nome}
                  {r.quesito ? ` · ${r.quesito}` : ''}
                </div>
                <div className="qrow-meta">
                  <span className="meta">Inviata: {dataOra(r.created_at)}</span>
                  {r.appuntamento_at && (
                    <span className="meta">Appuntamento: {dataOra(r.appuntamento_at)}</span>
                  )}
                  <span className="meta">Ultimo aggiornamento: {dataOra(r.updated_at)}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {esterni.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">Affidati a studi esterni <span className="badge">{esterni.length}</span></h2>
          <ul className="queue">
            {esterni.map((e) => {
              const st = STATO_ESTERNO[e.stato] ?? { label: e.stato, tone: 'gray' };
              return (
                <li key={e.id} className={`qrow tone-${st.tone}`}>
                  <div className="qrow-link">
                    <div className="qrow-main">
                      <div className="qrow-top">
                        <span className="pname">
                          {e.cognome} {e.nome}
                          {e.data_nascita ? <span className="age">, {eta(e.data_nascita)}</span> : null}
                        </span>
                        <span className={`badge badge-${st.tone}`}>{st.label}</span>
                      </div>
                      <div className="qrow-sub">
                        → {e.ext_nome} (esterno)
                        {e.quesito ? ` · ${e.quesito}` : ''}
                      </div>
                      <div className="qrow-meta">
                        <span className="meta">Inviato: {dataOra(e.created_at)}</span>
                        {e.appuntamento_at && (
                          <span className="meta">Appuntamento: {dataOra(e.appuntamento_at)}</span>
                        )}
                        {e.responded_at && (
                          <span className="meta">Risposta: {dataOra(e.responded_at)}</span>
                        )}
                        {e.risposta_nota && (
                          <span className="meta">«{e.risposta_nota}»</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
