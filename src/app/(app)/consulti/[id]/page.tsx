import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { dataOra } from '@/lib/format';
import { rispondiConsulto, convertiConsulto } from '../actions';

export const dynamic = 'force-dynamic';

// Dettaglio di un consulto rapido: la domanda dell'inviante con eventuali
// allegati, il riquadro per rispondere per iscritto e — quando serve la
// visita — la conversione in referral (la domanda diventa il quesito).

type Row = {
  id: string;
  stato: string;
  domanda: string;
  risposta: string | null;
  medico: string;
  medico_studio: string | null;
  created_at: string;
  answered_at: string | null;
  converted_referral_id: string | null;
};

type Att = { id: string; filename: string };

const STATO: Record<string, { label: string; tone: string }> = {
  aperto: { label: 'da rispondere', tone: 'warn' },
  risposto: { label: 'risposto', tone: 'success' },
  convertito: { label: 'convertito in visita', tone: 'accent' },
};

export default async function ConsultoDettaglio({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; err?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isUuid(params.id)) notFound();

  const [c] = await query<Row>(
    `select c.id, c.stato, c.domanda, c.risposta,
            d.nome as medico, d.studio as medico_studio,
            c.created_at::text, c.answered_at::text, c.converted_referral_id
       from consulti c
       join referring_doctors d on d.id = c.referring_doctor_id
      where c.id = $1 and c.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!c) notFound();

  const allegati = await query<Att>(
    'select id, filename from consulto_attachments where consulto_id = $1 order by uploaded_at',
    [params.id]
  );

  const chiuso = c.stato === 'convertito';

  return (
    <>
      <div className="page-head">
        <Link className="btn btn-ghost btn-small" href="/consulti">← Consulti</Link>
        <h1>Consulto rapido</h1>
      </div>

      {searchParams.ok === 'risposto' && <p className="success">Risposta inviata all'inviante.</p>}
      {searchParams.err === 'vuota' && <p className="error">Scriva la risposta prima di inviare.</p>}
      {searchParams.err === 'nome' && <p className="error">Inserisca cognome e nome del paziente per creare la referral.</p>}

      <div className="card">
        <div className="qrow-top" style={{ marginBottom: 10 }}>
          <strong>{c.medico}{c.medico_studio ? ` · ${c.medico_studio}` : ''}</strong>
          <span className={`badge badge-${STATO[c.stato]?.tone ?? 'warn'}`}>
            {STATO[c.stato]?.label ?? c.stato}
          </span>
        </div>
        <p className="muted small">Arrivato il {dataOra(c.created_at)}</p>
        <p className="consulto-domanda" style={{ marginTop: 10 }}>{c.domanda}</p>

        {allegati.length > 0 && (
          <div className="qrow-meta">
            {allegati.map((a) => (
              <a key={a.id} className="badge badge-accent" href={`/api/consulto-attachments/${a.id}`} target="_blank" rel="noreferrer">
                {a.filename}
              </a>
            ))}
          </div>
        )}
      </div>

      {chiuso ? (
        <div className="card notice">
          <h2>Convertito in visita</h2>
          <p className="muted">
            Da questo consulto è nata una referral.
            {c.converted_referral_id && (
              <> <Link href={`/referral/${c.converted_referral_id}`}>Apri la referral →</Link></>
            )}
          </p>
          {c.risposta && <p className="consulto-risposta">{c.risposta}</p>}
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Risposta</h2>
            <p className="muted small">
              La risposta arriva all'inviante nel suo portale riservato (avviso via email neutro,
              senza contenuti clinici).
            </p>
            <form action={rispondiConsulto} className="form">
              <input type="hidden" name="id" value={c.id} />
              <label>La sua risposta
                <textarea
                  name="risposta" rows={5} required maxLength={8000}
                  defaultValue={c.risposta ?? ''}
                  placeholder="Indicazioni per il collega inviante…"
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  {c.stato === 'risposto' ? 'Aggiorna la risposta' : 'Invia la risposta'}
                </button>
              </div>
            </form>
          </div>

          <details className="card">
            <summary><strong>Serve una visita? Converti in referral</strong></summary>
            <p className="muted small" style={{ marginTop: 10 }}>
              Crea una richiesta di visita: la domanda diventa il quesito, gli allegati
              seguono la referral e l'inviante la ritrova nel suo portale.
            </p>
            <form action={convertiConsulto} className="form">
              <input type="hidden" name="id" value={c.id} />
              <div className="grid2">
                <label>Cognome *<input name="cognome" required /></label>
                <label>Nome *<input name="nome" required /></label>
                <label>Data di nascita<input name="data_nascita" type="date" /></label>
                <label>Telefono<input name="telefono" type="tel" /></label>
                <label>Urgenza
                  <select name="urgenza" defaultValue="normale">
                    <option value="urgente">Urgente</option>
                    <option value="normale">Normale</option>
                    <option value="programmabile">Programmabile</option>
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button className="btn" type="submit">Crea la referral</button>
              </div>
            </form>
          </details>
        </>
      )}
    </>
  );
}
