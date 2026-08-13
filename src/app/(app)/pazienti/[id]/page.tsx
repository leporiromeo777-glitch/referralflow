import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS, URGENZA } from '@/lib/status';
import { eta, dataOra } from '@/lib/format';
import { documentiPaziente, CATEGORIE, isUuid } from '@/lib/cartella';
import { ollamaAttivo } from '@/lib/ollama';
import { controlloNelTempo } from './actions';

export const dynamic = 'force-dynamic';

// La cartella della persona: anagrafica, percorso delle referral, documenti,
// referti confermati — e il controllo AI nel tempo sui valori dei referti.

type Paz = {
  id: string; cognome: string; nome: string; data_nascita: string | null;
  telefono: string | null; assicurazione: string | null;
  controllo_ai: string | null; controllo_ai_at: string | null;
};
type Ref = {
  id: string; quesito: string | null; urgenza: string; status: string;
  created_at: string; appuntamento_at: string | null;
};
type Referto = { id: string; stato: string; quando: string };

export default async function SchedaPaziente({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { ai?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isUuid(params.id)) notFound();

  const [paz] = await query<Paz>(
    `select id, cognome, nome, data_nascita::text, telefono, assicurazione,
            controllo_ai, controllo_ai_at::text
       from patients where id = $1 and studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!paz) notFound();

  const referrals = await query<Ref>(
    `select id, quesito, urgenza::text, status::text, created_at::text, appuntamento_at::text
       from referrals where patient_id = $1 and studio_id = $2
      order by created_at desc`,
    [params.id, session.studioId]
  );

  const dossier = await documentiPaziente(paz.id, session.studioId);

  const referti = await query<Referto>(
    `select id, stato, to_char(created_at, 'DD.MM.YYYY') as quando
       from referti_bozze
      where studio_id = $1 and stato = 'confermata'
        and (lower(payload -> 'campi_estratti' ->> 'nome_paziente') = lower($2)
             or lower(payload -> 'campi_estratti' ->> 'nome_paziente') = lower($3))
      order by created_at desc limit 20`,
    [session.studioId, `${paz.cognome} ${paz.nome}`, `${paz.nome} ${paz.cognome}`]
  );

  const aiAttiva = await ollamaAttivo();

  return (
    <>
      <div className="page-head">
        <Link href="/pazienti" className="back">← Pazienti</Link>
        <h1>
          {paz.cognome} {paz.nome}
          {paz.data_nascita ? <span className="age">, {eta(paz.data_nascita)}</span> : null}
        </h1>
      </div>
      <p className="muted">
        {paz.data_nascita ? `Nato/a il ${dataOra(paz.data_nascita).slice(0, 10)} · ` : ''}
        {paz.telefono ? `☎ ${paz.telefono}` : 'telefono non registrato'}
        {paz.assicurazione ? ` · ${paz.assicurazione}` : ''}
      </p>

      <div className="ai-box">
        <p className="quest-title">
          Controllo AI nel tempo
          {paz.controllo_ai_at ? ` · generato ${dataOra(paz.controllo_ai_at)}` : ''}
        </p>
        {paz.controllo_ai ? (
          <p className="ai-testo">{paz.controllo_ai}</p>
        ) : (
          <p className="muted small">
            Confronta i referti confermati del paziente nel tempo e segnala variazioni
            numeriche marcate o incoerenze. Servono almeno due referti confermati.
            Generato sul Mac dello studio: nessun dato esce.
          </p>
        )}
        {searchParams.ai === 'pochi' && (
          <p className="error">Servono almeno due referti confermati per il confronto.</p>
        )}
        {searchParams.ai === 'errore' && (
          <p className="error">Generazione non riuscita: controlla che Ollama sia acceso e riprova.</p>
        )}
        {aiAttiva ? (
          <form action={controlloNelTempo}>
            <input type="hidden" name="id" value={paz.id} />
            <button className="btn btn-small" type="submit">
              {paz.controllo_ai ? 'Rigenera il controllo' : '✨ Controlla i valori nel tempo'}
            </button>
          </form>
        ) : (
          <p className="tmeta">AI locale spenta: apri Ollama sul Mac dello studio.</p>
        )}
      </div>

      <div className="card">
        <h2>Percorso</h2>
        {referrals.length === 0 ? (
          <p className="muted">Nessuna referral registrata.</p>
        ) : (
          <ul className="queue">
            {referrals.map((r) => (
              <li key={r.id} className="qrow qrow-flex">
                <Link href={`/referral/${r.id}`} className="qrow-link">
                  <div className="qrow-main">
                    <div className="qrow-top">
                      <span className="pname">{r.quesito ?? 'Referral'}</span>
                      <span className={`badge badge-${URGENZA[r.urgenza]?.tone}`}>{URGENZA[r.urgenza]?.label}</span>
                      <span className={`badge badge-${STATUS[r.status]?.tone}`}>{STATUS[r.status]?.label}</span>
                    </div>
                    <div className="qrow-sub">
                      Aperta il {dataOra(r.created_at)}
                      {r.appuntamento_at ? ` · appuntamento ${dataOra(r.appuntamento_at)}` : ''}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cols">
        <div className="card">
          <h2>Cartella documenti</h2>
          {dossier.length === 0 ? (
            <p className="muted">
              Cartella vuota. I documenti si caricano dal dettaglio di una referral
              (sezione «Cartella del paziente»).
            </p>
          ) : (
            <ul className="attach-list">
              {dossier.map((d) => (
                <li key={d.id}>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">📎 {d.filename}</a>
                  <span className="tmeta">{CATEGORIE[d.categoria] ?? d.categoria}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2>Referti confermati</h2>
          {referti.length === 0 ? (
            <p className="muted">
              Nessun referto confermato collegato a questo nome (i referti dettati si
              collegano dal nome estratto dal dettato).
            </p>
          ) : (
            <ul className="attach-list">
              {referti.map((r) => (
                <li key={r.id}>
                  <Link href={`/referti/${r.id}`}>Referto del {r.quando}</Link>
                  <span className="tmeta">confermato</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
