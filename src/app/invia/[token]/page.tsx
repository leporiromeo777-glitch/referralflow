import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { createPublicReferral } from './actions';

export const dynamic = 'force-dynamic';

export default async function InviaReferral({
  params, searchParams,
}: {
  params: { token: string };
  searchParams: { ok?: string; error?: string };
}) {
  const [doc] = await query<{ nome: string; studio: string | null; scaduto: boolean; studio_nome: string }>(
    `select d.nome, d.studio, (d.token_expires_at <= now()) as scaduto, s.nome as studio_nome
       from referring_doctors d
       join studios s on s.id = d.studio_id
      where d.token = $1`,
    [params.token]
  );
  if (!doc) notFound();

  if (doc.scaduto) {
    return (
      <main className="public">
        <div className="brand brand-lg center">Referral<span>Flow</span></div>
        <p className="muted center">{doc.studio_nome}</p>
        <div className="card notice">
          <h2>Link scaduto</h2>
          <p className="muted">
            Per motivi di sicurezza questo link non è più valido. Contatti la segreteria
            dello studio per ricevere il nuovo link d'invio.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="public">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">{doc.studio_nome}</p>

      {searchParams.ok ? (
        <div className="card notice">
          <h2>Referral inviata ✓</h2>
          <p className="muted">
            Grazie, {doc.nome}. La segreteria contatterà il paziente per l'appuntamento e
            lei riceverà gli aggiornamenti di stato. Può chiudere questa pagina o inviarne un'altra.
          </p>
          <a className="btn" href={`/invia/${params.token}`}>Invia un'altra referral</a>
        </div>
      ) : (
        <form action={createPublicReferral} className="card form">
          <input type="hidden" name="token" value={params.token} />
          <p>
            Invio referral come <strong>{doc.nome}</strong>
            {doc.studio ? ` · ${doc.studio}` : ''}.
          </p>
          {searchParams.error === 'nome' && <p className="error">Inserisci cognome e nome del paziente.</p>}

          <fieldset>
            <legend>Paziente</legend>
            <div className="grid2">
              <label>Cognome *<input name="cognome" required /></label>
              <label>Nome *<input name="nome" required /></label>
              <label>Data di nascita<input name="data_nascita" type="date" /></label>
              <label>Telefono<input name="telefono" type="tel" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Richiesta</legend>
            <label>Quesito clinico
              <textarea name="quesito" rows={3} placeholder="Motivo dell'invio…" />
            </label>
            <label>Urgenza
              <select name="urgenza" defaultValue="normale">
                <option value="urgente">Urgente</option>
                <option value="normale">Normale</option>
                <option value="programmabile">Programmabile</option>
              </select>
            </label>
            <label>Allegati (ECG, lettera, esami — facoltativi, max 5 file da 10 MB)
              <input type="file" name="allegati" multiple accept=".pdf,.png,.jpg,.jpeg" />
            </label>
          </fieldset>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Invia referral</button>
          </div>
        </form>
      )}
      <p className="muted small center">
        I dati inseriti sono trattati in modo conforme alla nLPD e conservati in Svizzera.
      </p>
    </main>
  );
}
