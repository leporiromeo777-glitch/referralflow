import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { rispondiAppuntamento } from './actions';
import { CallButton } from './CallButton';

export const dynamic = 'force-dynamic';

// Pagina pubblica per il paziente: conferma dell'appuntamento, oppure
// segnalazione di disdetta con telefonata allo studio (la disdetta vera
// viene confermata dalla segreteria). Solo data e ora — nessun nome,
// nessun dato clinico.

type Row = {
  appuntamento_at: string;
  status: string;
  appt_response: string | null;
  studio_nome: string;
  studio_telefono: string | null;
  prep_testo: string | null;
};

function dataEstesa(d: string): string {
  return new Date(d).toLocaleString('it-CH', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default async function Appuntamento({
  params,
}: {
  params: { token: string };
}) {
  const [ref] = await query<Row>(
    `select r.appuntamento_at::text, r.status, r.appt_response, s.nome as studio_nome,
            s.telefono as studio_telefono,
            pr.testo as prep_testo
       from referrals r
       join studios s on s.id = r.studio_id
       left join preparazioni pr on pr.id = r.preparazione_id
      where r.appt_token = $1`,
    [params.token]
  );
  if (!ref) notFound();

  const attivo =
    ref.status === 'prenotata' &&
    ref.appuntamento_at &&
    new Date(ref.appuntamento_at) > new Date();

  return (
    <main className="public">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">{ref.studio_nome}</p>

      {!attivo ? (
        <div className="card notice">
          <h2>Appuntamento non più attivo</h2>
          <p className="muted">
            Questo promemoria non è più valido. Per informazioni contatti la segreteria
            dello studio.
          </p>
        </div>
      ) : ref.appt_response === 'confermato' ? (
        <div className="card notice">
          <h2>Appuntamento confermato ✓</h2>
          <p className="muted">
            La aspettiamo {dataEstesa(ref.appuntamento_at)}. Se dovesse avere un
            impedimento, chiami la segreteria dello studio.
          </p>
        </div>
      ) : ref.appt_response === 'disdetta_da_confermare' ? (
        <div className="card notice">
          <h2>Richiesta di disdetta segnalata</h2>
          <p className="muted">
            Abbiamo registrato la sua richiesta per l'appuntamento
            del {dataEstesa(ref.appuntamento_at)}. La segreteria la confermerà.
            Se non ha ancora parlato con lo studio, chiami per completare la disdetta:
          </p>
          <div className="appt-actions">
            <CallButton token={params.token} telefono={ref.studio_telefono} />
          </div>
        </div>
      ) : ref.appt_response === 'disdetto' ? (
        <div className="card notice">
          <h2>Disdetta registrata</h2>
          <p className="muted">
            Grazie per l'avviso: la segreteria la ricontatterà per fissare una nuova data.
          </p>
        </div>
      ) : (
        <div className="card notice">
          <h2>Il suo appuntamento</h2>
          <p className="appt-date">{dataEstesa(ref.appuntamento_at)}</p>
          <p className="muted">
            Può confermare la presenza oppure, se ha un impedimento, chiamare lo studio
            per disdire.
          </p>
          <div className="appt-actions">
            <form action={rispondiAppuntamento}>
              <input type="hidden" name="token" value={params.token} />
              <input type="hidden" name="risposta" value="confermato" />
              <button className="btn btn-primary" type="submit">Confermo ✓</button>
            </form>
            <CallButton token={params.token} telefono={ref.studio_telefono} />
          </div>
        </div>
      )}

      {attivo && ref.prep_testo && (
        <div className="card notice prep-note">
          <h2>Come prepararsi</h2>
          <p>{ref.prep_testo}</p>
        </div>
      )}

      <p className="muted small center">
        Questa pagina non contiene dati medici ed è conforme alla nLPD.
        {' '}<a href="/privacy">Informativa privacy</a>
      </p>
    </main>
  );
}
