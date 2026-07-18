import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { documentiPaziente, CATEGORIE, DocumentoPaziente, isUuid } from '@/lib/cartella';
import { inviaAdAltroStudio } from '../actions';

export const dynamic = 'force-dynamic';

// Affida un paziente a un altro studio della piattaforma.

export default async function InviaAdAltroStudio({
  searchParams,
}: {
  searchParams: { err?: string; studio?: string; paz?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const studi = await query<{ id: string; nome: string }>(
    'select id, nome from studios where id <> $1 and attivo order by nome',
    [session.studioId]
  );

  // Arrivando da «Affida paziente», lo studio è già scelto.
  const preselezionato = studi.find((s) => s.id === searchParams.studio)?.id ?? '';

  // Paziente già scelto (da una referral): dati compilati e cartella allegabile.
  type Paz = {
    id: string; cognome: string; nome: string;
    data_nascita: string | null; telefono: string | null;
  };
  let paziente: Paz | null = null;
  let dossier: DocumentoPaziente[] = [];
  if (searchParams.paz && isUuid(searchParams.paz)) {
    const [p] = await query<Paz>(
      `select id, cognome, nome, data_nascita::text, telefono
         from patients where id = $1 and studio_id = $2`,
      [searchParams.paz, session.studioId]
    );
    paziente = p ?? null;
    if (paziente) dossier = await documentiPaziente(paziente.id, session.studioId);
  }

  return (
    <>
      <div className="page-head">
        <Link href="/affida" className="back">← Affida paziente</Link>
        <h1>Invia a un altro studio</h1>
      </div>

      {studi.length === 0 ? (
        <div className="empty">
          Al momento non ci sono altri studi sulla piattaforma a cui affidare pazienti.
        </div>
      ) : (
        <form action={inviaAdAltroStudio} className="card form">
          {paziente && <input type="hidden" name="paz" value={paziente.id} />}
          {searchParams.err === 'nome' && (
            <p className="error">Inserisci cognome e nome del paziente.</p>
          )}
          {searchParams.err === 'studio' && (
            <p className="error">Scegli lo studio a cui affidare il paziente.</p>
          )}
          {searchParams.err === 'consenso' && (
            <p className="error">
              Per inviare documenti della cartella serve la conferma del consenso del paziente.
            </p>
          )}

          <fieldset>
            <legend>Studio destinatario</legend>
            <label>Studio
              <select name="studio_id" required defaultValue={preselezionato}>
                <option value="" disabled>— scegli lo studio —</option>
                {studi.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Paziente</legend>
            <div className="grid2">
              <label>Cognome *<input name="cognome" required maxLength={120}
                defaultValue={paziente?.cognome ?? ''} /></label>
              <label>Nome *<input name="nome" required maxLength={120}
                defaultValue={paziente?.nome ?? ''} /></label>
              <label>Data di nascita<input name="data_nascita" type="date"
                defaultValue={paziente?.data_nascita ?? ''} /></label>
              <label>Telefono<input name="telefono" type="tel" maxLength={40}
                defaultValue={paziente?.telefono ?? ''} /></label>
            </div>
          </fieldset>

          {paziente && dossier.length > 0 && (
            <fieldset>
              <legend>Documenti dalla cartella del paziente</legend>
              {dossier.map((d) => (
                <label key={d.id} className="check-line" style={{ fontWeight: 400 }}>
                  <input type="checkbox" name="doc_ids" value={d.id} />{' '}
                  {d.filename} <span className="tmeta">({CATEGORIE[d.categoria] ?? d.categoria})</span>
                </label>
              ))}
              <label className="check-line" style={{ marginTop: 8 }}>
                <input type="checkbox" name="consenso" value="1" />{' '}
                Il paziente acconsente alla trasmissione dei documenti selezionati
                allo studio destinatario (obbligatorio se si allegano documenti)
              </label>
            </fieldset>
          )}

          <fieldset>
            <legend>Richiesta</legend>
            <label>Quesito clinico
              <textarea name="quesito" rows={3} maxLength={2000}
                placeholder="Motivo dell'invio e prestazione richiesta…" />
            </label>
            <label>Urgenza
              <select name="urgenza" defaultValue="normale">
                <option value="urgente">Urgente</option>
                <option value="normale">Normale</option>
                <option value="programmabile">Programmabile</option>
              </select>
            </label>
          </fieldset>

          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Invia allo studio</button>
          </div>
          <p className="tmeta">
            La referral arriva nella coda dello studio scelto; da «Inviati» ne segui
            lo stato in tempo reale. La segreteria dello studio riceve un avviso.
          </p>
        </form>
      )}
    </>
  );
}
