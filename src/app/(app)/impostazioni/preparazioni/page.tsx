import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { savePreparazione, togglePreparazione } from './actions';

export const dynamic = 'force-dynamic';

// Libreria delle istruzioni di preparazione alla visita (es. digiuno, farmaci da
// sospendere). La segreteria le assegna al paziente dalla scheda della referral;
// il testo compare sulla pagina di conferma appuntamento e può essere inviato via SMS.

type Prep = { id: string; nome: string; testo: string; attiva: boolean };

export default async function Preparazioni({
  searchParams,
}: {
  searchParams: { err?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/');

  const preparazioni = await query<Prep>(
    'select id, nome, testo, attiva from preparazioni where studio_id = $1 order by nome',
    [session.studioId]
  );

  return (
    <>
      <div className="page-head">
        <h1>Preparazioni alla visita</h1>
      </div>
      <p className="muted">
        Istruzioni pronte da dare al paziente prima di una visita (es. «venga a digiuno»,
        «sospenda i beta-bloccanti 48h prima»). La segreteria le assegna dalla referral;
        il paziente le vede sulla pagina di conferma dell'appuntamento e, se attivi gli SMS,
        le riceve al telefono. Testo neutro: niente dati clinici del singolo paziente.
      </p>

      {searchParams.err === 'campi' && (
        <p className="error">Inserisci un nome e il testo della preparazione.</p>
      )}

      <div className="cols">
        <div className="card">
          <h2>Preparazioni salvate</h2>
          {preparazioni.length === 0 && (
            <p className="muted">Nessuna preparazione. Creane una qui a fianco.</p>
          )}
          {preparazioni.map((p) => (
            <form key={p.id} action={savePreparazione} className="feed-form">
              <input type="hidden" name="id" value={p.id} />
              <label>Nome
                <input name="nome" defaultValue={p.nome} required maxLength={120} />
              </label>
              <label>Testo per il paziente
                <textarea name="testo" defaultValue={p.testo} rows={3} required maxLength={1000} />
              </label>
              <div className="feed-actions">
                <button className="btn btn-primary" type="submit">Salva</button>
                <button className="btn btn-ghost" formAction={togglePreparazione} formNoValidate>
                  {p.attiva ? 'Disattiva' : 'Riattiva'}
                </button>
                {!p.attiva && <span className="badge">disattivata</span>}
              </div>
            </form>
          ))}
        </div>

        <div className="card">
          <h2>Nuova preparazione</h2>
          <form action={savePreparazione} className="feed-form">
            <label>Nome
              <input name="nome" placeholder="Es. Test da sforzo" required maxLength={120} />
            </label>
            <label>Testo per il paziente
              <textarea name="testo" rows={4} required maxLength={1000}
                placeholder="Es. Si presenti con abbigliamento comodo. Sospenda i beta-bloccanti 48 ore prima, salvo diversa indicazione del suo medico." />
            </label>
            <button className="btn btn-primary" type="submit">Aggiungi</button>
          </form>
        </div>
      </div>
    </>
  );
}
