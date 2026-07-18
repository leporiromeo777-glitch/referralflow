import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { isUuid } from '@/lib/cartella';
import { togglePartner, saveExternalStudio, toggleExternalStudio, affidaDaAnnuario } from './actions';

export const dynamic = 'force-dynamic';

// «Affida paziente»: scegli lo studio a cui affidare un paziente.
// Gli «studi amici» (quelli con cui lavori di più) stanno in cima; sotto gli
// altri studi della piattaforma, cercabili per nome o specialità. L'invio è
// il form già esistente, con lo studio preselezionato.

type StudioRow = {
  id: string;
  nome: string;
  specialita: string | null;
  telefono: string | null;
  amico: boolean;
  n_inviate: number;
  ultimo_invio: string | null;
};

type Esterno = {
  id: string;
  nome: string;
  specialita: string | null;
  email: string;
  telefono: string | null;
  attivo: boolean;
  n_inviate: number;
  // Valorizzato se nel frattempo lo studio si è attivato sulla piattaforma.
  piattaforma_id: string | null;
};

export default async function Affida({
  searchParams,
}: {
  searchParams: { q?: string; err?: string; paz?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const q = (searchParams.q ?? '').trim().slice(0, 80);

  // Arrivando da una referral («Affida questo paziente»), il paziente è già
  // scelto: i suoi dati e i documenti in cartella accompagnano l'invio.
  let paziente: { id: string; cognome: string; nome: string } | null = null;
  if (searchParams.paz && isUuid(searchParams.paz)) {
    const [p] = await query<{ id: string; cognome: string; nome: string }>(
      'select id, cognome, nome from patients where id = $1 and studio_id = $2',
      [searchParams.paz, session.studioId]
    );
    paziente = p ?? null;
  }
  const pazQS = paziente ? `&paz=${paziente.id}` : '';

  // Tutti gli altri studi della piattaforma, con: amicizia, storico invii.
  const studi = await query<StudioRow>(
    `select s.id, s.nome, s.specialita, s.telefono,
            (sp.partner_studio_id is not null) as amico,
            count(r.id)::int as n_inviate,
            max(r.created_at)::text as ultimo_invio
       from studios s
       left join studio_partners sp
         on sp.studio_id = $1 and sp.partner_studio_id = s.id
       left join referrals r
         on r.studio_id = s.id and r.origin_studio_id = $1
      where s.id <> $1 and s.attivo
        and ($2 = '' or s.nome ilike '%' || $2 || '%' or s.specialita ilike '%' || $2 || '%')
      group by s.id, sp.partner_studio_id
      order by (sp.partner_studio_id is not null) desc, count(r.id) desc, s.nome`,
    [session.studioId, q]
  );

  const amici = studi.filter((s) => s.amico);
  const altri = studi.filter((s) => !s.amico);

  // Annuario: medici invianti registrati sulla piattaforma, visibili e cercabili.
  const annuario = await query<{
    user_id: string; nome: string; studio: string | null;
    specialita: string | null; telefono: string | null;
  }>(
    `select ip.user_id, ip.nome, ip.studio, ip.specialita, ip.telefono
       from inviante_profiles ip
       join users u on u.id = ip.user_id
      where ip.visibile = true and u.attivo = true
        and ($1 = '' or ip.nome ilike '%' || $1 || '%'
             or ip.studio ilike '%' || $1 || '%'
             or ip.specialita ilike '%' || $1 || '%')
      order by ip.nome`,
    [q]
  );

  // Rubrica: studi esterni (non sulla piattaforma), contattabili via link sicuro.
  // Se nel frattempo lo studio si è attivato (stessa email), lo segnaliamo e
  // l'affido passa dalla piattaforma.
  const esterni = await query<Esterno>(
    `select es.id, es.nome, es.specialita, es.email, es.telefono, es.attivo,
            count(er.id)::int as n_inviate,
            (select ps.id from studios ps
              where lower(ps.notify_email) = lower(es.email) and ps.attivo
              limit 1) as piattaforma_id
       from external_studios es
       left join external_referrals er on er.external_studio_id = es.id
      where es.studio_id = $1
        and ($2 = '' or es.nome ilike '%' || $2 || '%' or es.specialita ilike '%' || $2 || '%')
      group by es.id
      order by es.attivo desc, es.nome`,
    [session.studioId, q]
  );

  const supportEmail = process.env.SUPPORT_EMAIL || '';
  const inviteSubject = encodeURIComponent('Invito a ReferralFlow — referral tra studi medici');
  const inviteBody = encodeURIComponent(
    `Buongiorno,\n\n` +
    `il nostro studio (${session.studioNome}) usa ReferralFlow per gestire le referral ` +
    `tra studi medici: invio del paziente in due minuti, stato della presa in carico in tempo reale, ` +
    `dati conservati in Svizzera in conformità nLPD.\n\n` +
    `Ci piacerebbe collaborare con voi tramite la piattaforma. ` +
    `Per attivare il vostro studio potete rispondere a questa email` +
    (supportEmail ? ` o scrivere a ${supportEmail}` : '') +
    `.\n\nCordiali saluti\n${session.studioNome}`
  );

  const Scheda = ({ s }: { s: StudioRow }) => (
    <li className="mrow card studio-card">
      <div className="mrow-head">
        <div>
          <span className="mname">{s.nome}</span>
          {s.n_inviate > 0 && (
            <span className="tmeta"> · {s.n_inviate} pazienti affidati
              {s.ultimo_invio ? `, ultimo ${dataOra(s.ultimo_invio)}` : ''}</span>
          )}
        </div>
        <form action={togglePartner}>
          <input type="hidden" name="partner_id" value={s.id} />
          <button
            className={`star${s.amico ? ' on' : ''}`}
            type="submit"
            title={s.amico ? 'Rimuovi dagli studi amici' : 'Aggiungi agli studi amici'}
          >
            {s.amico ? '★' : '☆'}
          </button>
        </form>
      </div>
      {s.specialita && <p className="muted">{s.specialita}</p>}
      <div className="mrow-links">
        <Link className="btn btn-primary btn-small" href={`/inviati/nuova?studio=${s.id}${pazQS}`}>
          {paziente ? `Affida ${paziente.cognome} ${paziente.nome} →` : 'Affida un paziente →'}
        </Link>
        {s.telefono && (
          <a className="btn btn-ghost btn-small" href={`tel:${s.telefono.replace(/\s+/g, '')}`}>
            ☎ {s.telefono}
          </a>
        )}
      </div>
    </li>
  );

  return (
    <>
      <div className="page-head">
        <h1>Affida paziente</h1>
      </div>
      <p className="muted">
        Scegli lo studio a cui affidare un paziente: i tuoi studi amici sono in cima.
        L'invio arriva direttamente nella loro coda e ne segui lo stato da «Inviati» —
        senza email, senza telefonate di rincorsa.
      </p>

      {paziente && (
        <div className="card notice">
          <p>
            Stai affidando <strong>{paziente.cognome} {paziente.nome}</strong>:
            scegli lo studio qui sotto — i dati sono già compilati e potrai
            allegare i documenti della sua cartella.
          </p>
        </div>
      )}

      <form className="filters" method="get">
        <input name="q" defaultValue={q} placeholder="Cerca per specialità o nome…"
          className="search-input" maxLength={80} />
        <button className="btn btn-small" type="submit">Cerca</button>
        {q && <Link className="btn btn-ghost btn-small" href="/affida">Azzera</Link>}
      </form>

      {amici.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">Studi amici <span className="badge">{amici.length}</span></h2>
          <ul className="mlist">{amici.map((s) => <Scheda key={s.id} s={s} />)}</ul>
        </section>
      )}

      {altri.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">{amici.length > 0 ? 'Altri studi sulla piattaforma' : 'Studi sulla piattaforma'}</h2>
          <ul className="mlist">{altri.map((s) => <Scheda key={s.id} s={s} />)}</ul>
        </section>
      )}

      {studi.length === 0 && esterni.length === 0 && (
        <div className="empty">
          {q
            ? 'Nessuno studio corrisponde alla ricerca.'
            : 'Non ci sono ancora altri studi sulla piattaforma: aggiungi i tuoi contatti esterni qui sotto.'}
        </div>
      )}

      {annuario.length > 0 && (
        <section className="prog-group">
          <h2 className="prog-doctor">
            Annuario — medici registrati <span className="badge">{annuario.length}</span>
          </h2>
          <p className="muted">
            Medici invianti con un accesso ReferralFlow: puoi affidare loro un paziente
            senza inserirli a mano — la rubrica si compila da sola.
          </p>
          <ul className="mlist">
            {annuario.map((a) => (
              <li key={a.user_id} className="mrow card studio-card">
                <div className="mrow-head">
                  <div>
                    <span className="mname">{a.nome}</span>
                    {a.studio && <span className="tmeta"> · {a.studio}</span>}
                  </div>
                  <span className="badge badge-success">registrato ✓</span>
                </div>
                {a.specialita && <p className="muted">{a.specialita}</p>}
                <div className="mrow-links">
                  <form action={affidaDaAnnuario}>
                    <input type="hidden" name="user_id" value={a.user_id} />
                    {paziente && <input type="hidden" name="paz" value={paziente.id} />}
                    <button className="btn btn-primary btn-small" type="submit">
                      Affida un paziente →
                    </button>
                  </form>
                  {a.telefono && (
                    <a className="btn btn-ghost btn-small" href={`tel:${a.telefono.replace(/\s+/g, '')}`}>
                      ☎ {a.telefono}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="prog-group">
        <h2 className="prog-doctor">
          Studi esterni (rubrica)
          {esterni.length > 0 && <span className="badge">{esterni.length}</span>}
        </h2>
        <p className="muted">
          Contatti fuori dalla piattaforma: l'affido parte con una email neutra e un
          link sicuro dove lo studio vede i dettagli e risponde — senza registrarsi.
          Tu segui lo stato da «Inviati», come per gli altri.
        </p>

        {searchParams.err === 'esterno' && (
          <p className="error">Per aggiungere uno studio esterno servono nome e email validi.</p>
        )}
        {searchParams.err === 'esterno_mancante' && (
          <p className="error">Studio esterno non trovato nella rubrica.</p>
        )}

        <ul className="mlist">
          {esterni.map((e) => (
            <li key={e.id} className={`mrow card studio-card${e.attivo ? '' : ' inactive'}`}>
              <div className="mrow-head">
                <div>
                  <span className="mname">{e.nome}</span>
                  <span className="tmeta"> · esterno</span>
                  {e.n_inviate > 0 && (
                    <span className="tmeta"> · {e.n_inviate} affidi</span>
                  )}
                </div>
                {e.piattaforma_id
                  ? <span className="badge badge-success">ora su ReferralFlow ✓</span>
                  : !e.attivo && <span className="badge">disattivato</span>}
              </div>
              {e.specialita && <p className="muted">{e.specialita}</p>}
              <div className="mrow-links">
                {e.piattaforma_id ? (
                  <Link className="btn btn-primary btn-small" href={`/inviati/nuova?studio=${e.piattaforma_id}${pazQS}`}>
                    Affida via piattaforma →
                  </Link>
                ) : e.attivo && (
                  <Link className="btn btn-primary btn-small" href={`/affida/esterno?e=${e.id}${pazQS}`}>
                    Affida (link sicuro) →
                  </Link>
                )}
                {e.telefono && (
                  <a className="btn btn-ghost btn-small" href={`tel:${e.telefono.replace(/\s+/g, '')}`}>
                    ☎ {e.telefono}
                  </a>
                )}
                <form action={toggleExternalStudio}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="btn btn-ghost btn-small" type="submit">
                    {e.attivo ? 'Disattiva' : 'Riattiva'}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>

        <details className="complete ext-add">
          <summary className="btn btn-small">+ Aggiungi uno studio esterno</summary>
          <form action={saveExternalStudio} className="card feed-form ext-form">
            <div className="grid2">
              <label>Nome dello studio *
                <input name="nome" required maxLength={120} placeholder="Es. Studio Ortopedico Bellinzona" />
              </label>
              <label>Email *
                <input name="email" type="email" required maxLength={160} placeholder="segreteria@studio.ch" />
              </label>
              <label>Specialità
                <input name="specialita" maxLength={200} placeholder="Es. Ortopedia: ginocchio, spalla" />
              </label>
              <label>Telefono
                <input name="telefono" type="tel" maxLength={40} />
              </label>
            </div>
            <button className="btn btn-primary btn-small" type="submit">Salva in rubrica</button>
          </form>
        </details>
      </section>

      <div className="card invite-card">
        <h2>Lo studio che cerchi non è ancora qui?</h2>
        <p className="muted">
          Invitalo: quando si iscrive, potrai affidargli pazienti in due tocchi e
          seguirne lo stato in tempo reale — e lui riceverà le tue referral già ordinate.
        </p>
        <div className="invite-actions">
          <a className="btn" href={`mailto:?subject=${inviteSubject}&body=${inviteBody}`}>
            ✉ Invita uno studio
          </a>
          <a className="btn btn-ghost" href="/attiva" target="_blank" rel="noreferrer">
            Vedi «Attiva il tuo studio»
          </a>
        </div>
      </div>
    </>
  );
}
