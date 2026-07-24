import Link from 'next/link';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS, NEXT_STATUS, NEXT_ACTION, URGENZA } from '@/lib/status';
import { eta, dataOra } from '@/lib/format';
import { visitePrecedenti } from '@/lib/patient-history';
import { documentiPaziente, CATEGORIE } from '@/lib/cartella';
import { CartellaUpload } from './CartellaUpload';
import {
  advanceStatus, uploadAttachment, updateAppointment,
  assegnaPreparazione, inviaPreparazione,
  confermaDisdetta, annullaSegnalazioneDisdetta,
} from './actions';

export const dynamic = 'force-dynamic';

type Detail = {
  id: string; patient_id: string;
  quesito: string | null; urgenza: string; status: string;
  canale: string | null; appuntamento_at: string | null; created_at: string;
  cognome: string; nome: string; data_nascita: string | null; telefono: string | null;
  medico_nome: string | null; medico_studio: string | null;
  origin_studio_nome: string | null;
  appt_response: string | null; reminder_sent_at: string | null;
  preparazione_id: string | null; preparazione_sent_at: string | null;
  questionario: { motivo?: string; farmaci?: string; allergie?: string; note?: string } | null;
  questionario_at: string | null;
};
type Prep = { id: string; nome: string };
type HistoryRow = {
  to_status: string; from_status: string | null; nota: string | null;
  changed_at: string; changed_by_email: string | null;
};
type Att = { id: string; filename: string; uploaded_at: string };

export default async function ReferralDetail({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { err?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [ref] = await query<Detail>(
    `select r.id, r.patient_id, r.quesito, r.urgenza, r.status, r.canale, r.appuntamento_at, r.created_at,
            p.cognome, p.nome, p.data_nascita, p.telefono,
            d.nome as medico_nome, d.studio as medico_studio,
            os.nome as origin_studio_nome,
            r.appt_response, r.reminder_sent_at::text,
            r.preparazione_id, r.preparazione_sent_at::text,
            r.questionario, r.questionario_at::text
     from referrals r
     join patients p on p.id = r.patient_id
     left join referring_doctors d on d.id = r.referring_doctor_id
     left join studios os on os.id = r.origin_studio_id
     where r.id = $1 and r.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!ref) notFound();

  const history = await query<HistoryRow>(
    `select h.to_status, h.from_status, h.nota, h.changed_at, u.email as changed_by_email
     from referral_status_history h
     left join users u on u.id = h.changed_by
     where h.referral_id = $1 order by h.changed_at asc`,
    [params.id]
  );

  const allegati = await query<Att>(
    'select id, filename, uploaded_at from attachments where referral_id = $1 order by uploaded_at asc',
    [params.id]
  );

  // Cartella del paziente: documenti che vivono oltre la singola referral.
  const dossier = await documentiPaziente(ref.patient_id, session.studioId);

  const visite = await visitePrecedenti({
    studioId: session.studioId,
    cognome: ref.cognome,
    nome: ref.nome,
    dataNascita: ref.data_nascita,
    escludiReferralId: ref.id,
  });

  // Preparazioni attive (per assegnarne una al paziente).
  const preparazioni = await query<Prep>(
    'select id, nome from preparazioni where studio_id = $1 and attiva = true order by nome',
    [session.studioId]
  );

  const next = NEXT_STATUS[ref.status];

  return (
    <>
      <div className="page-head">
        <Link href="/" className="back">← Coda</Link>
        <h1>
          {ref.cognome} {ref.nome}
          {ref.data_nascita ? <span className="age">, {eta(ref.data_nascita)}</span> : null}
        </h1>
        <span className={`badge badge-${URGENZA[ref.urgenza]?.tone}`}>{URGENZA[ref.urgenza]?.label}</span>
        <span className={`badge badge-${STATUS[ref.status]?.tone}`}>{STATUS[ref.status]?.label}</span>
      </div>

      <div className="cols">
        <div className="card">
          <h2>Dettaglio</h2>
          <dl className="kv">
            <dt>Medico inviante</dt>
            <dd>{ref.medico_nome ?? '—'}{ref.medico_studio ? ` · ${ref.medico_studio}` : ''}</dd>
            {ref.origin_studio_nome && (
              <>
                <dt>Affidata da</dt>
                <dd>{ref.origin_studio_nome} (piattaforma)</dd>
              </>
            )}
            <dt>Quesito clinico</dt><dd>{ref.quesito ?? '—'}</dd>
            <dt>Telefono paziente</dt><dd>{ref.telefono ?? '—'}</dd>
            <dt>Canale d'arrivo</dt><dd>{ref.canale ?? '—'}</dd>
            <dt>Appuntamento</dt><dd>{ref.appuntamento_at ? dataOra(ref.appuntamento_at) : '—'}</dd>
            {ref.status === 'prenotata' && (
              <>
                <dt>Conferma paziente</dt>
                <dd>
                  {ref.appt_response === 'confermato' ? (
                    <span className="badge badge-success">✓ Confermato</span>
                  ) : ref.appt_response === 'disdetta_da_confermare' ? (
                    <span className="badge badge-warn">⚠ Disdetta segnalata — da confermare</span>
                  ) : ref.appt_response === 'disdetto' ? (
                    <span className="badge badge-danger">⚠ Disdetto — da ricontattare</span>
                  ) : ref.reminder_sent_at ? (
                    <span className="muted">promemoria inviato, in attesa</span>
                  ) : (
                    <span className="muted">promemoria non ancora inviato</span>
                  )}
                </dd>
              </>
            )}
          </dl>

          {ref.questionario && (ref.questionario.motivo || ref.questionario.farmaci
            || ref.questionario.allergie || ref.questionario.note) && (
            <div className="quest-box">
              <p className="quest-title">
                Questionario del paziente
                {ref.questionario_at ? ` · ${dataOra(ref.questionario_at)}` : ''}
              </p>
              {ref.questionario.motivo && <p><strong>Disturbi:</strong> {ref.questionario.motivo}</p>}
              {ref.questionario.farmaci && <p><strong>Farmaci:</strong> {ref.questionario.farmaci}</p>}
              {ref.questionario.allergie && <p><strong>Allergie:</strong> {ref.questionario.allergie}</p>}
              {ref.questionario.note && <p><strong>Altro:</strong> {ref.questionario.note}</p>}
            </div>
          )}

          {ref.status === 'prenotata' && ref.appt_response === 'disdetta_da_confermare' && (
            <div className="disdetta-box">
              <p className="error">
                Il paziente ha segnalato una disdetta e doveva chiamare lo studio.
                Dopo la telefonata, conferma o annulla:
              </p>
              <div className="disdetta-actions">
                <form action={confermaDisdetta}>
                  <input type="hidden" name="id" value={ref.id} />
                  <button className="btn btn-primary btn-small" type="submit">
                    Conferma disdetta (libera lo slot)
                  </button>
                </form>
                <form action={annullaSegnalazioneDisdetta}>
                  <input type="hidden" name="id" value={ref.id} />
                  <button className="btn btn-ghost btn-small" type="submit">
                    Annulla segnalazione (l'appuntamento resta)
                  </button>
                </form>
              </div>
            </div>
          )}

          {ref.status === 'prenotata' && (
            <form action={updateAppointment} className="advance">
              <input type="hidden" name="id" value={ref.id} />
              <label>Sposta appuntamento
                <input type="datetime-local" name="appuntamento_at" required />
              </label>
              <button className="btn" type="submit">Aggiorna data</button>
            </form>
          )}

          {next ? (
            <form action={advanceStatus} className="advance">
              <input type="hidden" name="id" value={ref.id} />
              <input type="hidden" name="to" value={next} />
              {next === 'prenotata' && (
                <>
                  {searchParams.err === 'appuntamento' && (
                    <p className="error">Per prenotare serve la data e l'ora dell'appuntamento.</p>
                  )}
                  <label>Data e ora appuntamento (obbligatoria)
                    <input type="datetime-local" name="appuntamento_at" required />
                  </label>
                </>
              )}
              {next === 'referto_inviato' && (
                <>
                  {searchParams.err === 'referto' && (
                    <p className="error">Per inviare l'esito serve il referto: caricalo qui sotto.</p>
                  )}
                  {searchParams.err === 'file_referto' && (
                    <p className="error">File non valido: sono ammessi PDF, JPG, PNG, DICOM o XML, max 10 MB.</p>
                  )}
                  <label>Referto da inviare {allegati.length > 0 ? '(già tra gli allegati, o caricane uno nuovo)' : '(obbligatorio)'}
                    <input type="file" name="referto" accept=".pdf,.png,.jpg,.jpeg,.dcm,.xml"
                      required={allegati.length === 0} />
                  </label>
                </>
              )}
              {next === 'chiusa' && (
                <>
                  {searchParams.err === 'followup' && (
                    <p className="error">
                      Indica se il paziente è da rivedere (e tra quanti mesi, se scegli «Altro»).
                    </p>
                  )}
                  <fieldset className="fup">
                    <legend>Follow-up: il paziente è da rivedere?</legend>
                    <label className="radio">
                      <input type="radio" name="follow_up" value="no" required /> Non è da rivedere
                    </label>
                    <label className="radio">
                      <input type="radio" name="follow_up" value="6" /> Da rivedere tra 6 mesi
                    </label>
                    <label className="radio">
                      <input type="radio" name="follow_up" value="12" /> Da rivedere tra 12 mesi
                    </label>
                    <label className="radio">
                      <input type="radio" name="follow_up" value="altro" /> Altro:
                      <input type="number" name="follow_up_mesi" min={1} max={120}
                        placeholder="mesi" className="fup-mesi" />
                      mesi
                    </label>
                    <p className="tmeta">La scadenza si calcola dall'ultima visita del paziente.</p>
                  </fieldset>
                </>
              )}
              <label>Nota (facoltativa)
                <input name="nota" placeholder="Es. richiamato, prenotato per…" />
              </label>
              <button className="btn btn-primary" type="submit">{NEXT_ACTION[ref.status]}</button>
            </form>
          ) : (
            <p className="muted">Referral chiusa.</p>
          )}

          <div className="prep">
            <h2>Preparazione alla visita</h2>
            {searchParams.err === 'prep_tel' && (
              <p className="error">Il paziente non ha un telefono registrato: non posso inviare l'SMS.</p>
            )}
            {searchParams.err === 'prep_manca' && (
              <p className="error">Assegna prima una preparazione, poi inviala.</p>
            )}
            {searchParams.err === 'prep_invio' && (
              <p className="error">Invio SMS non riuscito: riprova più tardi.</p>
            )}
            {preparazioni.length === 0 ? (
              <p className="muted">
                Nessuna preparazione configurata.{' '}
                <Link href="/impostazioni/preparazioni">Creane una</Link> (solo amministratore).
              </p>
            ) : (
              <>
                <form action={assegnaPreparazione} className="prep-assign">
                  <input type="hidden" name="id" value={ref.id} />
                  <label>Preparazione per questo paziente
                    <select name="preparazione_id" defaultValue={ref.preparazione_id ?? ''}>
                      <option value="">— nessuna —</option>
                      {preparazioni.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-small" type="submit">Salva</button>
                </form>
                {ref.preparazione_id && (
                  <form action={inviaPreparazione} className="prep-send">
                    <input type="hidden" name="id" value={ref.id} />
                    <button className="btn btn-small" type="submit">
                      {ref.preparazione_sent_at ? 'Reinvia al paziente (SMS)' : 'Invia al paziente (SMS)'}
                    </button>
                    {ref.preparazione_sent_at && (
                      <span className="tmeta">Inviata il {dataOra(ref.preparazione_sent_at)}</span>
                    )}
                  </form>
                )}
                <p className="tmeta">
                  Il paziente vede la preparazione anche sulla pagina di conferma dell'appuntamento.
                </p>
              </>
            )}
          </div>

          <div className="attach">
            <h2>Allegati</h2>
            {searchParams.err === 'file_allegato' && (
              <p className="error">File non valido: sono ammessi PDF, JPG, PNG, DICOM o XML, max 10 MB.</p>
            )}
            {allegati.length === 0 && <p className="muted">Nessun allegato.</p>}
            <ul className="attach-list">
              {allegati.map((a) => (
                <li key={a.id}>
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                    {a.filename}
                  </a>
                  <span className="tmeta">{dataOra(a.uploaded_at)}</span>
                </li>
              ))}
            </ul>
            <form action={uploadAttachment} className="attach-form">
              <input type="hidden" name="id" value={ref.id} />
              <input type="file" name="file" required
                accept=".pdf,.png,.jpg,.jpeg,.dcm,.xml" />
              <button className="btn" type="submit">Carica</button>
            </form>
          </div>

          <div className="attach">
            <h2>
              Cartella del paziente
              {dossier.length > 0 && <span className="badge"> {dossier.length}</span>}
            </h2>
            <p className="tmeta">
              I documenti in cartella restano legati al paziente oltre questa
              referral: li ritrovi a ogni visita e puoi inviarli con un affido.
              Ogni apertura è tracciata nel registro accessi.
            </p>
            {searchParams.err === 'file_cartella' && (
              <p className="error">File non valido: sono ammessi PDF, JPG, PNG, DICOM o XML, max 10 MB.</p>
            )}
            {dossier.length === 0 && <p className="muted">Cartella vuota.</p>}
            <ul className="attach-list">
              {dossier.map((d) => (
                <li key={d.id}>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                    {d.filename}
                  </a>
                  <span className="tmeta">
                    {CATEGORIE[d.categoria] ?? d.categoria} · {dataOra(d.uploaded_at)}
                    {d.nota ? ` · ${d.nota}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <CartellaUpload referralId={ref.id} patientId={ref.patient_id} categorie={CATEGORIE} />
            <p style={{ marginTop: 10 }}>
              <Link className="btn btn-small" href={`/affida?paz=${ref.patient_id}`}>
                Affida questo paziente (con documenti) →
              </Link>
            </p>
          </div>
        </div>

        <div className="card">
          {visite.length > 0 && (
            <div className="prevvisits">
              <h2>Visite precedenti <span className="badge">{visite.length}</span></h2>
              <ul className="queue">
                {visite.map((v) => (
                  <li key={v.id} className={`qrow tone-${STATUS[v.status]?.tone ?? 'gray'}`}>
                    <Link href={`/referral/${v.id}`} className="qrow-link">
                      <div className="qrow-main">
                        <div className="qrow-top">
                          <span className="pname">{v.quesito ?? 'Visita'}</span>
                          <span className={`badge badge-${STATUS[v.status]?.tone}`}>
                            {STATUS[v.status]?.label}
                          </span>
                        </div>
                        <div className="qrow-meta">
                          <span className="meta">
                            {v.appuntamento_at ? `Visita: ${dataOra(v.appuntamento_at)}` : `Ricevuta: ${dataOra(v.created_at)}`}
                          </span>
                          {v.follow_up_months ? (
                            <span className="meta">controllo a {v.follow_up_months} mesi</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2>Cronologia</h2>
          <ol className="timeline">
            {history.map((h, i) => (
              <li key={i}>
                <span className={`dot dot-${STATUS[h.to_status]?.tone}`} />
                <div>
                  <strong>{STATUS[h.to_status]?.label}</strong>
                  <span className="tmeta">
                    {dataOra(h.changed_at)}{h.changed_by_email ? ` · ${h.changed_by_email}` : ''}
                  </span>
                  {h.nota ? <p className="tnote">{h.nota}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}
