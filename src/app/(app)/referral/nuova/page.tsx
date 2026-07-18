import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createReferral } from './actions';

export const dynamic = 'force-dynamic';

export default async function NuovaReferral() {
  const session = await getSession();
  if (!session) redirect('/login');

  const medici = await query<{ id: string; nome: string; studio: string | null }>(
    'select id, nome, studio from referring_doctors where studio_id = $1 order by nome',
    [session.studioId]
  );

  return (
    <>
      <div className="page-head">
        <h1>Nuova referral</h1>
      </div>

      <form action={createReferral} className="card form">
        <fieldset>
          <legend>Paziente</legend>
          <div className="grid2">
            <label>
              Cognome *
              <input name="cognome" required />
            </label>
            <label>
              Nome *
              <input name="nome" required />
            </label>
            <label>
              Data di nascita
              <input name="data_nascita" type="date" />
            </label>
            <label>
              Telefono
              <input name="telefono" type="tel" />
            </label>
            <label>
              Assicurazione
              <input name="assicurazione" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Medico inviante</legend>
          <div className="grid2">
            <label>
              Dall'anagrafica
              <select name="referring_doctor_id" defaultValue="">
                <option value="">— seleziona —</option>
                {medici.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.studio ? ` (${m.studio})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              …oppure nuovo medico
              <input name="nuovo_medico" placeholder="Dott. …" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Richiesta</legend>
          <label>
            Quesito clinico
            <textarea name="quesito" rows={3} placeholder="Es. eco di controllo, valutazione aritmia…" />
          </label>
          <div className="grid2">
            <label>
              Urgenza
              <select name="urgenza" defaultValue="normale">
                <option value="urgente">Urgente</option>
                <option value="normale">Normale</option>
                <option value="programmabile">Programmabile</option>
              </select>
            </label>
            <label>
              Canale d'arrivo
              <select name="canale" defaultValue="hin">
                <option value="hin">HIN Mail</option>
                <option value="fax">Fax</option>
                <option value="telefono">Telefono</option>
                <option value="form">Form online</option>
              </select>
            </label>
          </div>
        </fieldset>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            Registra referral
          </button>
        </div>
      </form>
    </>
  );
}
