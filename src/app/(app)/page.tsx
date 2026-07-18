import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { STATUS, URGENZA, NEXT_STATUS, NEXT_ACTION } from '@/lib/status';
import { isFerma, giorniFermaMax } from '@/lib/watchdog';
import { eta, giorniDa, dataOra } from '@/lib/format';
import { advanceStatus } from './referral/[id]/actions';

export const dynamic = 'force-dynamic';

// Passaggi che richiedono dati in più (data appuntamento, referto):
// dalla coda si apre il dettaglio invece di agire al volo.
const SERVE_DETTAGLIO = new Set(['da_prenotare', 'vista']);

type Row = {
  id: string;
  quesito: string | null;
  urgenza: string;
  status: string;
  canale: string | null;
  appuntamento_at: string | null;
  created_at: string;
  updated_at: string;
  cognome: string;
  nome: string;
  data_nascita: string | null;
  medico_nome: string | null;
  medico_studio: string | null;
  origin_studio_nome: string | null;
  appt_response: string | null;
};

const STATI_FILTRO = ['ricevuta', 'triage', 'da_prenotare', 'prenotata', 'vista', 'referto_inviato'];
const URGENZE_FILTRO = ['urgente', 'normale', 'programmabile'];

// Icone di linea (stesso stile della campanella nel topbar), 24×24.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const IconInbox = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" /></svg>
);
const IconAlert = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
);
const IconLayers = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
);
const IconGrid = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
const IconCalPlus = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" /></svg>
);
const IconCalCheck = () => (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="m9 16 2 2 4-4" /></svg>
);

type Slot = {
  id: string; appuntamento_at: string;
  cognome: string; nome: string; telefono: string | null; medico_nome: string | null;
};
type Attesa = {
  id: string; urgenza: string; quesito: string | null; created_at: string;
  cognome: string; nome: string; data_nascita: string | null;
  telefono: string | null; medico_nome: string | null;
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { stato?: string; urgenza?: string; benvenuto?: string; vista?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Due viste della stessa area: la Coda (flusso normale) e le Disdette (buchi
  // in agenda da riempire). Prima erano due voci di menu: le disdette ora sono
  // una scheda della Coda, così sparisce il doppione «prossimi da chiamare».
  const vista = searchParams.vista === 'disdette' ? 'disdette' : 'coda';

  // Conteggio disdette per il badge sulla scheda (sempre, in entrambe le viste).
  const [dc] = await query<{ n: number }>(
    `select count(*)::int as n from referrals
      where studio_id = $1 and status = 'prenotata'
        and appt_response in ('disdetto', 'disdetta_da_confermare')`,
    [session.studioId]
  );
  const disdetteCount = dc?.n ?? 0;

  // Primo accesso dopo l'attivazione self-service: primi passi guidati.
  let slug: string | null = null;
  if (searchParams.benvenuto) {
    const [s] = await query<{ slug: string }>(
      'select slug from studios where id = $1', [session.studioId]
    );
    slug = s?.slug ?? null;
  }

  // Dati della vista Coda.
  const stato = STATI_FILTRO.includes(searchParams.stato ?? '') ? searchParams.stato! : null;
  const urgenza = URGENZE_FILTRO.includes(searchParams.urgenza ?? '') ? searchParams.urgenza! : null;
  const filtri: string[] = [];
  const params: string[] = [session.studioId];
  if (stato) { params.push(stato); filtri.push(`and r.status = $${params.length}::referral_status`); }
  if (urgenza) { params.push(urgenza); filtri.push(`and r.urgenza = $${params.length}::urgenza`); }

  const referrals = vista === 'coda' ? await query<Row>(`
    select r.id, r.quesito, r.urgenza, r.status, r.canale, r.appuntamento_at, r.created_at,
           r.updated_at,
           p.cognome, p.nome, p.data_nascita,
           d.nome as medico_nome, d.studio as medico_studio,
           os.nome as origin_studio_nome,
           r.appt_response
    from referrals r
    join patients p on p.id = r.patient_id
    left join referring_doctors d on d.id = r.referring_doctor_id
    left join studios os on os.id = r.origin_studio_id
    where r.studio_id = $1 and r.status <> 'chiusa' ${filtri.join(' ')}
    order by case r.urgenza when 'urgente' then 0 when 'normale' then 1 else 2 end,
             r.created_at asc
  `, params) : [];

  // Metriche sempre globali (fotografia vera della coda, indipendente dai filtri).
  const [tot] = vista === 'coda' ? await query<{ da_gestire: number; urgenti: number; aperte: number }>(`
    select count(*) filter (where status in ('ricevuta','triage','da_prenotare'))::int as da_gestire,
           count(*) filter (where urgenza = 'urgente')::int as urgenti,
           count(*)::int as aperte
      from referrals where studio_id = $1 and status <> 'chiusa'
  `, [session.studioId]) : [undefined];
  const daGestire = tot?.da_gestire ?? 0;
  const urgenti = tot?.urgenti ?? 0;
  const filtroAttivo = stato || urgenza;

  // Dati della vista Disdette: slot liberati + disdette da confermare, con la
  // coda «da prenotare» usata solo per suggerire chi richiamare (il pairing).
  const slots = vista === 'disdette' ? await query<Slot>(
    `select r.id, r.appuntamento_at::text, p.cognome, p.nome, p.telefono, d.nome as medico_nome
       from referrals r
       join patients p on p.id = r.patient_id
       left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 and r.status = 'prenotata' and r.appt_response = 'disdetto'
      order by r.appuntamento_at asc`,
    [session.studioId]
  ) : [];
  const daConfermare = vista === 'disdette' ? await query<Slot>(
    `select r.id, r.appuntamento_at::text, p.cognome, p.nome, p.telefono, d.nome as medico_nome
       from referrals r
       join patients p on p.id = r.patient_id
       left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 and r.status = 'prenotata'
        and r.appt_response = 'disdetta_da_confermare'
      order by r.appuntamento_at asc`,
    [session.studioId]
  ) : [];
  const attesa = vista === 'disdette' ? await query<Attesa>(
    `select r.id, r.urgenza::text, r.quesito, r.created_at::text,
            p.cognome, p.nome, p.data_nascita, p.telefono, d.nome as medico_nome
       from referrals r
       join patients p on p.id = r.patient_id
       left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 and r.status = 'da_prenotare'
      order by case r.urgenza when 'urgente' then 0 when 'normale' then 1 else 2 end,
               r.created_at asc`,
    [session.studioId]
  ) : [];
  // Ogni slot liberato è abbinato al prossimo paziente da chiamare, in priorità.
  const suggerimenti = new Map(slots.map((s, i) => [s.id, attesa[i] ?? null]));

  const tabs = (
    <div className="coda-tabs">
      <Link href="/" className={`coda-tab${vista === 'coda' ? ' active' : ''}`}>Coda</Link>
      <Link href="/?vista=disdette" className={`coda-tab${vista === 'disdette' ? ' active' : ''}`}>
        Disdette
        {disdetteCount > 0 && <span className="coda-tab-badge">{disdetteCount}</span>}
      </Link>
    </div>
  );

  return (
    <>
      <div className="coda-top">
      <div className="coda-hero">
        {vista === 'coda' ? (
          <>
            <span className="coda-eyebrow">Smistamento · in tempo reale</span>
            <h1>Referral in entrata</h1>
            <p className="coda-lede">
              La coda di lavoro dello studio: ogni richiesta con la sua urgenza e il
              prossimo passo pronto da un clic. Le più urgenti restano in cima.
            </p>
          </>
        ) : (
          <>
            <span className="coda-eyebrow">Buchi in agenda · da riempire</span>
            <h1>Disdette e slot liberi</h1>
            <p className="coda-lede">
              Quando un paziente disdice, lo slot liberato compare qui con accanto
              chi richiamare per riempirlo, in ordine di urgenza e attesa.
            </p>
          </>
        )}
      </div>

      {tabs}

      {vista === 'disdette' && (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-badge"><IconCalPlus /></span>
            <span className="stat-body">
              <span className="stat-value">{slots.length}</span>
              <span className="stat-label">Slot liberati</span>
            </span>
          </div>
          <div className={`stat-card${daConfermare.length > 0 ? ' alert' : ''}`}>
            <span className="stat-badge"><IconAlert /></span>
            <span className="stat-body">
              <span className="stat-value">{daConfermare.length}</span>
              <span className="stat-label">Da confermare</span>
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-badge"><IconBell /></span>
            <span className="stat-body">
              <span className="stat-value">{attesa.length}</span>
              <span className="stat-label">In attesa</span>
            </span>
          </div>
        </div>
      )}

      {vista === 'coda' && searchParams.benvenuto && (
        <div className="card notice">
          <h2>Benvenuti: lo studio è attivo ✓</h2>
          <p className="muted">Questa è la vostra coda. Tre passi per partire bene:</p>
          <ol className="muted" style={{ margin: '8px 0 4px 20px', lineHeight: 1.7 }}>
            <li>
              <Link href="/impostazioni/utenti">Create gli accessi</Link> per
              segreteria e colleghi (voi siete l'amministratore).
            </li>
            {slug && (
              <li>
                Condividete il vostro modulo pubblico con i medici invianti:{' '}
                <a href={`/invia?s=${slug}`} target="_blank">/invia?s={slug}</a>{' '}
                (da mettere anche sul vostro sito).
              </li>
            )}
            <li>
              Se vi hanno affidato pazienti, sono già qui sotto: apriteli e
              fateli avanzare con un clic.
            </li>
          </ol>
          <p className="muted small">
            🔒 Conformità nLPD inclusa: chiedete all'assistenza i contratti pronti per il
            vostro studio (trattamento dati e riservatezza, sul modello FMH).
          </p>
          <p className="muted small">
            Per tutto il resto c'è l'assistenza 24/7 nel menu del profilo, in alto a destra.
          </p>
        </div>
      )}

      {vista === 'coda' && (<>
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-badge"><IconInbox /></span>
          <span className="stat-body">
            <span className="stat-value">{daGestire}</span>
            <span className="stat-label">Da gestire</span>
          </span>
        </div>
        <div className={`stat-card${urgenti > 0 ? ' alert' : ''}`}>
          <span className="stat-badge"><IconAlert /></span>
          <span className="stat-body">
            <span className="stat-value">{urgenti}</span>
            <span className="stat-label">Urgenti aperte</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-badge"><IconLayers /></span>
          <span className="stat-body">
            <span className="stat-value">{tot?.aperte ?? 0}</span>
            <span className="stat-label">Totale aperte</span>
          </span>
        </div>
      </div>

      {(() => {
        const chips = [
          { key: 'all', label: 'Tutte', href: '/', icon: <IconGrid /> },
          { key: 'u:urgente', label: 'Urgenti', href: '/?urgenza=urgente', icon: <IconAlert /> },
          { key: 's:ricevuta', label: 'Nuove', href: '/?stato=ricevuta', icon: <IconBell /> },
          { key: 's:da_prenotare', label: 'Da prenotare', href: '/?stato=da_prenotare', icon: <IconCalPlus /> },
          { key: 's:prenotata', label: 'Prenotate', href: '/?stato=prenotata', icon: <IconCalCheck /> },
        ];
        const activeKey = urgenza ? `u:${urgenza}` : stato ? `s:${stato}` : 'all';
        return (
          <section className="qf-section">
            <div className="qf-head">
              <h2>Filtro rapido</h2>
            </div>
            <div className="qf-row">
              {chips.map((c) => (
                <Link key={c.key} href={c.href}
                  className={`qf-btn${c.key === activeKey ? ' active' : ''}`}>
                  <span className="qf-ico">{c.icon}</span>
                  <span className="qf-label">{c.label}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })()}
      </>)}
      </div>

      {vista === 'coda' && (
      <>
      <div className="coda-list-head">
        <h2>In coda</h2>
        <span className="count">
          {referrals.length} {referrals.length === 1 ? 'referral' : 'referral'}
          {filtroAttivo ? ' (filtrate)' : ''}
        </span>
      </div>

      {referrals.length === 0 && (
        <div className="empty">
          {filtroAttivo
            ? 'Nessuna referral corrisponde ai filtri.'
            : 'Nessuna referral aperta. Registra la prima con «Nuova referral».'}
        </div>
      )}

      <ul className="queue">
        {referrals.map((r) => {
          const next = NEXT_STATUS[r.status];
          return (
          <li key={r.id} className={`qrow qrow-flex tone-${URGENZA[r.urgenza]?.tone ?? 'gray'}`}>
            <Link href={`/referral/${r.id}`} className="qrow-link">
              <div className="qrow-main">
                <div className="qrow-top">
                  <span className="pname">
                    {r.cognome} {r.nome}
                    {r.data_nascita ? <span className="age">, {eta(r.data_nascita)}</span> : null}
                  </span>
                  <span className={`badge badge-${URGENZA[r.urgenza]?.tone}`}>
                    {URGENZA[r.urgenza]?.label}
                  </span>
                </div>
                <div className="qrow-sub">
                  {r.medico_nome
                    ?? (r.origin_studio_nome ? `Da ${r.origin_studio_nome}` : 'Medico non indicato')}
                  {r.quesito ? ` · ${r.quesito}` : ''}
                </div>
                <div className="qrow-meta">
                  <span className={`badge badge-${STATUS[r.status]?.tone}`}>
                    {STATUS[r.status]?.label}
                  </span>
                  {isFerma(r.status, r.updated_at) && (
                    <span className="badge badge-danger"
                      title={`Ferma da più di ${giorniFermaMax(r.status)} giorni: da gestire`}>
                      ⏰ ferma
                    </span>
                  )}
                  {r.status === 'prenotata' && r.appt_response === 'confermato' && (
                    <span className="badge badge-success">✓ confermato</span>
                  )}
                  {r.status === 'prenotata' && r.appt_response === 'disdetta_da_confermare' && (
                    <span className="badge badge-warn">⚠ disdetta da confermare</span>
                  )}
                  {r.status === 'prenotata' && r.appt_response === 'disdetto' && (
                    <span className="badge badge-danger">⚠ disdetto</span>
                  )}
                  {r.status === 'prenotata' && r.appuntamento_at ? (
                    <span className="meta">Appuntamento: {dataOra(r.appuntamento_at)}</span>
                  ) : (
                    <span className="meta">
                      {r.canale ? `${r.canale.toUpperCase()} · ` : ''}
                      in attesa da {giorniDa(r.created_at)} g
                    </span>
                  )}
                </div>
              </div>
            </Link>
            {next && (
              <div className="qrow-action">
                {SERVE_DETTAGLIO.has(r.status) ? (
                  <Link href={`/referral/${r.id}`} className="btn btn-small">
                    {NEXT_ACTION[r.status]}
                  </Link>
                ) : (
                  <form action={advanceStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="to" value={next} />
                    <button className="btn btn-small" type="submit">{NEXT_ACTION[r.status]}</button>
                  </form>
                )}
              </div>
            )}
          </li>
          );
        })}
      </ul>
      </>
      )}

      {vista === 'disdette' && (
        <>
          {slots.length === 0 && daConfermare.length === 0 && (
            <div className="empty">
              Nessuna disdetta da gestire. Quando un paziente disdice, lo slot compare qui
              con accanto chi richiamare per riempirlo.
            </div>
          )}

          {daConfermare.length > 0 && (
            <section className="prog-group">
              <h2 className="prog-doctor">
                Disdette segnalate da confermare <span className="badge badge-warn">{daConfermare.length}</span>
              </h2>
              <p className="muted">
                Il paziente ha segnalato la disdetta dal promemoria e doveva chiamare lo studio.
                Dopo la telefonata, apri la referral per confermare (o annullare) la disdetta.
              </p>
              <ul className="queue">
                {daConfermare.map((s) => (
                  <li key={s.id} className="qrow qrow-flex tone-warn">
                    <Link href={`/referral/${s.id}`} className="qrow-link">
                      <div className="qrow-main">
                        <div className="qrow-top">
                          <span className="pname">{s.cognome} {s.nome}</span>
                          <span className="badge badge-warn">⚠ da confermare</span>
                        </div>
                        <div className="qrow-meta">
                          <span className="meta">Appuntamento: {dataOra(s.appuntamento_at)}</span>
                          <span className="meta">{s.medico_nome ?? 'Medico non indicato'}</span>
                          {s.telefono && <span className="meta">☎ {s.telefono}</span>}
                        </div>
                      </div>
                    </Link>
                    <div className="qrow-action">
                      <Link href={`/referral/${s.id}`} className="btn btn-small">Conferma / annulla</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {slots.length > 0 && (
            <section className="prog-group">
              <h2 className="prog-doctor">
                Slot liberati da riassegnare <span className="badge badge-warn">{slots.length}</span>
              </h2>
              <p className="muted">
                Appuntamenti disdetti: lo slot è libero. Chiama il paziente suggerito qui sotto,
                poi apri la sua referral per assegnargli questa data.
              </p>
              <ul className="queue">
                {slots.map((s) => {
                  const candidato = suggerimenti.get(s.id);
                  return (
                    <li key={s.id} className="qrow tone-warn">
                      <div className="qrow-flex">
                        <Link href={`/referral/${s.id}`} className="qrow-link">
                          <div className="qrow-main">
                            <div className="qrow-top">
                              <span className="pname">{s.cognome} {s.nome}</span>
                              <span className="badge badge-danger">⚠ disdetto</span>
                            </div>
                            <div className="qrow-meta">
                              <span className="meta">Slot libero: {dataOra(s.appuntamento_at)}</span>
                              <span className="meta">{s.medico_nome ?? 'Medico non indicato'}</span>
                            </div>
                          </div>
                        </Link>
                        <div className="qrow-action">
                          <Link href={`/referral/${s.id}`} className="btn btn-small">Gestisci</Link>
                        </div>
                      </div>
                      {candidato && (
                        <div className="suggest-box">
                          <span className="suggest-text">
                            📅 Appuntamento disdetto il {dataOra(s.appuntamento_at)}: chiama{' '}
                            <strong>{candidato.cognome} {candidato.nome}</strong> per riempire il posto
                            {candidato.urgenza === 'urgente' ? ' (urgente)' : ''}.
                          </span>
                          <div className="suggest-actions">
                            {candidato.telefono ? (
                              <a className="btn btn-primary btn-small" href={`tel:${candidato.telefono.replace(/\s+/g, '')}`}>
                                ☎ {candidato.telefono}
                              </a>
                            ) : (
                              <span className="tmeta">telefono non registrato</span>
                            )}
                            <Link href={`/referral/${candidato.id}`} className="btn btn-ghost btn-small">Apri referral</Link>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
