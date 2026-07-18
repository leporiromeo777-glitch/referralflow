import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { eta, dataOra } from '@/lib/format';
import { rispondiAffido } from './actions';

export const dynamic = 'force-dynamic';

// Pagina pubblica per lo studio esterno: dettagli dell'affido e risposta con un
// clic, senza registrazione. Il token lungo con scadenza è l'unica chiave.
// In fondo, la presentazione di ReferralFlow: ogni affido è una demo dal vivo.

type Aff = {
  id: string;
  cognome: string;
  nome: string;
  data_nascita: string | null;
  telefono: string | null;
  quesito: string | null;
  urgenza: string;
  stato: string;
  appuntamento_at: string | null;
  created_at: string;
  scaduto: boolean;
  convertito: boolean;
  mittente: string;
  mittente_telefono: string | null;
  ext_nome: string;
};
type Att = { id: string; filename: string };

const URGENZE: Record<string, string> = {
  urgente: 'Urgente',
  normale: 'Normale',
  programmabile: 'Programmabile',
};

export default async function AffidoPubblico({
  params,
}: {
  params: { token: string };
}) {
  const [aff] = await query<Aff>(
    `select er.id, er.cognome, er.nome, er.data_nascita::text, er.telefono,
            er.quesito, er.urgenza::text, er.stato, er.appuntamento_at::text,
            er.created_at::text,
            (er.token_expires_at <= now()) as scaduto,
            (er.converted_referral_id is not null) as convertito,
            s.nome as mittente, s.telefono as mittente_telefono,
            es.nome as ext_nome
       from external_referrals er
       join studios s on s.id = er.studio_id
       join external_studios es on es.id = er.external_studio_id
      where er.token = $1`,
    [params.token]
  );
  if (!aff) notFound();

  if (aff.scaduto) {
    return (
      <main className="public">
        <div className="brand brand-lg center">Referral<span>Flow</span></div>
        <div className="card notice">
          <h2>Link scaduto</h2>
          <p className="muted">
            Per motivi di sicurezza questo link non è più valido. Contattate lo studio
            mittente per riceverne uno nuovo.
          </p>
        </div>
      </main>
    );
  }

  // L'affido è già stato convertito: lo studio destinatario si è attivato
  // sulla piattaforma e il paziente è nella sua coda.
  if (aff.convertito) {
    return (
      <main className="public">
        <div className="brand brand-lg center">Referral<span>Flow</span></div>
        <div className="card notice">
          <h2>Questo affido è nella coda del vostro studio ✓</h2>
          <p className="muted">
            Il vostro studio è attivo su ReferralFlow: questo paziente vi aspetta
            nella coda, con allegati e urgenza. Da lì lo fate avanzare con un clic
            e lo studio mittente ne segue lo stato in tempo reale.
          </p>
          <a className="btn btn-primary" href="/login">Accedi allo studio →</a>
        </div>
        <p className="muted small center"><a href="/privacy">Informativa privacy</a></p>
      </main>
    );
  }

  const allegati = await query<Att>(
    'select id, filename from external_attachments where external_referral_id = $1 order by uploaded_at',
    [aff.id]
  );

  const risposto = aff.stato !== 'inviato';

  return (
    <main className="public">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">Affido da: {aff.mittente} · per {aff.ext_nome}</p>

      {!risposto && (
        <div className="card notice">
          <p className="muted">
            <strong>Che cos'è questo link?</strong> {aff.mittente} desidera
            affidarvi un paziente e vi ha inviato questa pagina riservata: qui
            sotto trovate i dettagli e gli allegati, e rispondete con un clic.
            Niente registrazione, niente password, niente costi — e il link
            scade da solo.
          </p>
        </div>
      )}

      <div className="card">
        <h2>
          {aff.cognome} {aff.nome}
          {aff.data_nascita ? <span className="age">, {eta(aff.data_nascita)}</span> : null}
        </h2>
        <dl className="kv">
          <dt>Urgenza</dt><dd>{URGENZE[aff.urgenza] ?? aff.urgenza}</dd>
          <dt>Quesito</dt><dd>{aff.quesito ?? '—'}</dd>
          <dt>Telefono paziente</dt><dd>{aff.telefono ?? '—'}</dd>
          <dt>Inviato il</dt><dd>{dataOra(aff.created_at)}</dd>
          {aff.mittente_telefono && (
            <><dt>Contatto mittente</dt><dd>{aff.mittente_telefono}</dd></>
          )}
        </dl>

        {allegati.length > 0 && (
          <>
            <h2>Allegati</h2>
            <ul className="attach-list">
              {allegati.map((a) => (
                <li key={a.id}>
                  <a href={`/api/affido/${params.token}/${a.id}`} target="_blank" rel="noreferrer">
                    {a.filename}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {risposto ? (
        <div className="card notice">
          {aff.stato === 'preso_in_carico' ? (
            <>
              <h2>Preso in carico ✓</h2>
              <p className="muted">
                Avete accettato questo paziente
                {aff.appuntamento_at ? ` — appuntamento: ${dataOra(aff.appuntamento_at)}` : ''}.
                Lo studio mittente è stato avvisato.
              </p>
            </>
          ) : (
            <>
              <h2>Risposta registrata</h2>
              <p className="muted">
                Avete indicato che non potete prendere in carico questo paziente.
                Lo studio mittente è stato avvisato.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <h2>La vostra risposta</h2>
          <form action={rispondiAffido} className="affido-form">
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="risposta" value="preso_in_carico" />
            <label>Data e ora dell'appuntamento (se già fissato, facoltativa)
              <input type="datetime-local" name="appuntamento_at" />
            </label>
            <label>Nota per lo studio mittente (facoltativa)
              <input name="nota" maxLength={500} placeholder="Es. lo contatteremo per la data" />
            </label>
            <button className="btn btn-primary" type="submit">Prendiamo in carico ✓</button>
          </form>
          <form action={rispondiAffido} className="affido-form affido-no">
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="risposta" value="rifiutato" />
            <label>Motivo (facoltativo)
              <input name="nota" maxLength={500} placeholder="Es. agenda piena fino a ottobre" />
            </label>
            <button className="btn" type="submit">Non possiamo prenderlo in carico</button>
          </form>
        </div>
      )}

      {risposto ? (
        <div className="card pitch">
          <h2>La prossima volta, tutto nella vostra coda</h2>
          <p className="muted">
            Questo scambio è avvenuto su <strong>ReferralFlow</strong>, la
            piattaforma svizzera delle referral tra studi medici. Attivando il
            vostro studio — <strong>gratis, in 2 minuti</strong>, basta l'email —
            {aff.stato === 'preso_in_carico'
              ? ' questo paziente comparirà già nella vostra coda, '
              : ' gli affidi arrivano direttamente nella vostra coda, '}
            con allegati e urgenza, e ogni nuovo invio vi arriva ordinato invece
            che per email o fax.
          </p>
          <ul className="muted" style={{ margin: '4px 0 10px 20px', lineHeight: 1.7, textAlign: 'left' }}>
            <li>Coda delle richieste con urgenze e allegati, dal ricevimento al referto</li>
            <li>Promemoria SMS ai pazienti e lista d'attesa automatica</li>
            <li>Dati su server in Svizzera, conforme nLPD</li>
          </ul>
          <a className="btn btn-primary" href={`/attiva?da=${params.token}`}>
            Attiva il tuo studio — prova gratuita →
          </a>
          <p className="muted small" style={{ marginTop: 8 }}>
            L'attivazione va fatta dal medico titolare dello studio: mostrategli
            questa pagina o inoltrategli il link.
          </p>
        </div>
      ) : (
        <div className="card notice pitch">
          <p className="muted">
            Questo scambio avviene su <strong>ReferralFlow</strong>, la piattaforma
            svizzera delle referral tra studi medici: pazienti affidati in due minuti,
            stato in tempo reale, dati conservati in Svizzera (nLPD).
          </p>
          <a className="btn btn-ghost btn-small" href={`/attiva?da=${params.token}`}>
            Scopri come attivare il tuo studio →
          </a>
        </div>
      )}

      <p className="muted small center">
        Link riservato con scadenza automatica · conforme nLPD
        {' '}· <a href="/privacy">Informativa privacy</a>
      </p>
    </main>
  );
}
