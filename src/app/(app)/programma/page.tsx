import Link from 'next/link';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { URGENZA } from '@/lib/status';
import { dataOra } from '@/lib/format';
import { schedeProgramma } from '@/lib/patient-history';
import { syncNow, assignProvider, completaAppuntamento, annullaCompletamento } from './actions';
import { PageHero } from '../PageHero';

export const dynamic = 'force-dynamic';

type Appt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  titolo: string | null;
  paziente_nome: string | null;
  motivo: string | null;
  luogo: string | null;
  provider_id: string | null;
  provider_nome: string | null;
  referral_id: string | null;
  urgenza: string | null;
  quesito: string | null;
  medico_nome: string | null;
  prep_nome: string | null;
  prep_inviata: boolean;
  completed_at: string | null;
  follow_up_months: number | null;
  questionario: { motivo?: string; farmaci?: string; allergie?: string; note?: string } | null;
};
type Provider = { id: string; nome: string };
type Feed = { id: string; nome: string; last_synced_at: string | null; last_status: string | null };

function ora(date: string): string {
  return new Date(date).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' });
}

// Giorno locale YYYY-MM-DD (per default e per i confini della query).
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

function labelGiorno(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('it-CH', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// I sette giorni (lun→dom) della settimana che contiene `day`, per la striscia
// calendario in cima al Programma.
function settimanaDi(day: string): string[] {
  const d = new Date(`${day}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // lunedì = 0
  const lunedi = new Date(d);
  lunedi.setDate(d.getDate() - dow);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(lunedi);
    x.setDate(lunedi.getDate() + i);
    out.push(localDay(x));
  }
  return out;
}
function dowBreve(day: string): string {
  return new Date(`${day}T12:00:00`)
    .toLocaleDateString('it-CH', { weekday: 'short' })
    .replace('.', '');
}
function numGiorno(day: string): number {
  return new Date(`${day}T12:00:00`).getDate();
}
function meseAnno(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('it-CH', { month: 'long', year: 'numeric' });
}

export default async function Programma({
  searchParams,
}: {
  searchParams: { d?: string; m?: string; err?: string };
}) {
  const session = await getSession();
  const oggi = localDay(new Date());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? '') ? searchParams.d! : oggi;
  const sid = session?.studioId ?? '';

  // Filtro per medico (?m=<id> | 'na' = da assegnare): la timeline resta una,
  // ma un clic mostra il programma del singolo medico.
  const medicoParam = /^[0-9a-f-]{36}$/.test(searchParams.m ?? '')
    ? searchParams.m!
    : searchParams.m === 'na'
      ? 'na'
      : null;
  const conFiltro = (d: string) => `/programma?d=${d}${medicoParam ? `&m=${medicoParam}` : ''}`;

  // Vista ristretta per il ruolo medico collegato a un provider.
  let restrictProviderId: string | null = null;
  if (session?.role === 'medico') {
    const [own] = await query<{ id: string }>(
      'select id from providers where user_id = $1 and studio_id = $2',
      [session.id, sid]
    );
    if (own) restrictProviderId = own.id;
  }

  const appts = await query<Appt>(
    `select a.id, a.starts_at, a.ends_at, a.titolo, a.paziente_nome, a.motivo, a.luogo,
            a.provider_id, pr.nome as provider_nome,
            a.referral_id, r.urgenza::text as urgenza, r.quesito,
            d.nome as medico_nome,
            pp.nome as prep_nome,
            (r.preparazione_sent_at is not null) as prep_inviata,
            r.questionario,
            a.completed_at::text, a.follow_up_months
       from appointments a
       left join providers pr on pr.id = a.provider_id
       left join referrals r on r.id = a.referral_id
       left join referring_doctors d on d.id = r.referring_doctor_id
       left join preparazioni pp on pp.id = r.preparazione_id
      where a.studio_id = $1
        and a.starts_at >= $2::date
        and a.starts_at < ($2::date + interval '1 day')
        ${restrictProviderId ? 'and a.provider_id = $3' : ''}
      order by pr.nome nulls last, a.starts_at asc`,
    restrictProviderId ? [sid, day, restrictProviderId] : [sid, day]
  );

  // Scheda pre-visita: allegati e numero di visite precedenti per le referral
  // collegate agli appuntamenti del giorno (in batch, poche query).
  const refIds = appts.map((a) => a.referral_id).filter((x): x is string => !!x);
  const schede = await schedeProgramma(sid, refIds);

  const providers = await query<Provider>(
    'select id, nome from providers where attivo = true and studio_id = $1 order by nome',
    [sid]
  );
  const feeds = await query<Feed>(
    `select id, nome, last_synced_at, last_status from agenda_feeds
      where attivo = true and studio_id = $1 order by nome`,
    [sid]
  );

  // Conteggio appuntamenti per giorno della settimana visibile: un puntino
  // sotto i giorni che hanno qualcosa in agenda (rispetta la vista del medico).
  const settimana = settimanaDi(day);
  const conteggi = await query<{ d: string; n: number }>(
    `select a.starts_at::date::text as d, count(*)::int as n
       from appointments a
      where a.studio_id = $1
        and a.starts_at >= $2::date
        and a.starts_at < ($3::date + interval '1 day')
        ${restrictProviderId ? 'and a.provider_id = $4' : ''}
      group by 1`,
    restrictProviderId
      ? [sid, settimana[0], settimana[6], restrictProviderId]
      : [sid, settimana[0], settimana[6]]
  );
  const perGiorno = new Map(conteggi.map((c) => [c.d, c.n]));

  // Timeline del giorno: appuntamenti assegnati in ordine di orario; il
  // «prossimo» (primo non ancora completato) è la card verde in evidenza.
  // I non assegnati restano in una sezione a parte, sotto.
  const tutti = appts
    .filter((a) => a.provider_id)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
  const tuttiUnassigned = appts.filter((a) => !a.provider_id);

  // Conteggi del giorno per i chip dei medici (dalla lista già caricata).
  const perMedico = new Map<string, { nome: string; n: number }>();
  for (const a of tutti) {
    if (!a.provider_id) continue;
    const voce = perMedico.get(a.provider_id) ?? { nome: a.provider_nome ?? '—', n: 0 };
    voce.n++;
    perMedico.set(a.provider_id, voce);
  }

  const assigned =
    medicoParam && medicoParam !== 'na' ? tutti.filter((a) => a.provider_id === medicoParam) : medicoParam === 'na' ? [] : tutti;
  const unassigned = medicoParam && medicoParam !== 'na' ? [] : tuttiUnassigned;
  const featuredId = assigned.find((a) => !a.completed_at)?.id ?? null;

  const lastSync = feeds
    .map((f) => f.last_synced_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <>
      <PageHero zone="green" eyebrow="Agenda del giorno" title="Programma del giorno">
        Gli appuntamenti del giorno in ordine d'orario, con la scheda del paziente
        pronta prima della visita. A visita conclusa, tocca «✓ Completa».
      </PageHero>

      <div className="cal">
        <div className="cal-head">
          <span className="cal-month">{meseAnno(day)}</span>
          <div className="cal-nav">
            <Link className="cal-arrow" href={conFiltro(shiftDay(day, -7))}
              aria-label="Settimana precedente">←</Link>
            {day !== oggi && <Link className="btn btn-ghost btn-small" href={conFiltro(oggi)}>Oggi</Link>}
            <Link className="cal-arrow" href={conFiltro(shiftDay(day, 7))}
              aria-label="Settimana successiva">→</Link>
          </div>
        </div>
        <div className="cal-strip">
          {settimana.map((g) => {
            const n = perGiorno.get(g) ?? 0;
            return (
              <Link key={g} href={conFiltro(g)}
                className={`cal-day${g === day ? ' sel' : ''}${g === oggi ? ' today' : ''}`}
                title={n > 0 ? `${n} appuntamenti` : 'Nessun appuntamento'}>
                <span className="cal-num">{numGiorno(g)}</span>
                <span className="cal-dow">{dowBreve(g)}</span>
                <span className={`cal-count${n > 0 ? '' : ' cal-count-empty'}`} />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="day-sub">
        <strong className="day-label">{labelGiorno(day)}</strong>
        <form action={syncNow} className="sync-form">
          <button className="btn btn-small" type="submit">Sincronizza ora</button>
          <span className="tmeta">
            {lastSync ? `Ultimo aggiornamento: ${dataOra(lastSync)}` : 'Mai sincronizzato'}
          </span>
        </form>
      </div>

      {/* Un programma per medico, senza perdere il colpo d'occhio: chip di
          filtro (solo dove c'è più di un medico in agenda; il ruolo medico
          vede già soltanto il suo). */}
      {!restrictProviderId && (perMedico.size > 1 || (perMedico.size > 0 && tuttiUnassigned.length > 0)) && (
        <div className="mchips">
          <Link href={`/programma?d=${day}`} className={`mchip${!medicoParam ? ' active' : ''}`}>
            Tutti ({tutti.length + tuttiUnassigned.length})
          </Link>
          {[...perMedico.entries()]
            .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
            .map(([id, v]) => (
              <Link key={id} href={`/programma?d=${day}&m=${id}`}
                className={`mchip${medicoParam === id ? ' active' : ''}`}>
                {v.nome} ({v.n})
              </Link>
            ))}
          {tuttiUnassigned.length > 0 && (
            <Link href={`/programma?d=${day}&m=na`}
              className={`mchip${medicoParam === 'na' ? ' active' : ''}`}>
              Da assegnare ({tuttiUnassigned.length})
            </Link>
          )}
        </div>
      )}

      {searchParams.err === 'followup' && (
        <p className="error">
          Per completare la visita indica se il paziente è da rivedere
          (e tra quanti mesi, se scegli «Altro»).
        </p>
      )}

      {feeds.length === 0 && (
        <div className="empty">
          Nessun feed agenda configurato. <Link href="/programma/feed">Configura il feed iCal</Link> della
          Cassa dei Medici per importare gli appuntamenti.
        </div>
      )}

      {feeds.length > 0 && appts.length === 0 && (
        <div className="empty">
          Nessun appuntamento per questo giorno. Prova «Sincronizza ora» per aggiornare l'agenda.
        </div>
      )}

      {appts.length > 0 && assigned.length === 0 && unassigned.length === 0 && (
        <div className="empty">Nessun appuntamento per questo medico in questo giorno.</div>
      )}

      {assigned.length > 0 && (
        <ol className="tl">
          {assigned.map((a) => {
            const featured = a.id === featuredId;
            const s = a.referral_id ? schede.get(a.referral_id) : undefined;
            return (
              <li key={a.id} className={`tl-item${a.completed_at ? ' done' : ''}`}>
                <span className={`tl-node${featured ? ' filled' : ''}${a.completed_at ? ' done' : ''}`} />
                <div className={`tl-body${featured ? ' tl-card' : ''}`}>
                  <div className="tl-head">
                    <span className="tl-name">{a.paziente_nome || a.titolo || 'Appuntamento'}</span>
                    <span className="tl-time">{ora(a.starts_at)}{a.ends_at ? `–${ora(a.ends_at)}` : ''}</span>
                  </div>
                  <div className="tl-sub">
                    {a.provider_nome ?? '—'}
                    {a.motivo ? ` · ${a.motivo}` : a.quesito ? ` · ${a.quesito}` : ''}
                    {a.completed_at
                      ? ` · ${a.follow_up_months ? `da rivedere tra ${a.follow_up_months} mesi` : 'non da rivedere'}`
                      : ''}
                  </div>
                  <div className="tl-row">
                    <div className="tl-tags">
                      {a.completed_at ? (
                        <span className="badge badge-success">✓ Visto</span>
                      ) : a.urgenza ? (
                        <span className={`badge badge-${URGENZA[a.urgenza]?.tone}`}>
                          {URGENZA[a.urgenza]?.label}
                        </span>
                      ) : null}
                      {a.referral_id && (
                        <details className="scheda">
                          <summary className="scheda-toggle">Scheda paziente</summary>
                          <div className="scheda-body">
                            {s?.riassuntoAi && (
                              <div className="ai-box">
                                <p className="quest-title">Riassunto pre-visita — AI locale</p>
                                <p className="ai-testo">{s.riassuntoAi}</p>
                              </div>
                            )}
                            <p><strong>Motivo:</strong> {a.quesito ?? '—'}</p>
                            <p><strong>Inviata da:</strong> {a.medico_nome ?? 'medico non indicato'}</p>
                            {s && s.visitePrecedenti > 0 && (
                              <p><strong>Visite precedenti:</strong> {s.visitePrecedenti} (già seguito qui)</p>
                            )}
                            {a.questionario && (a.questionario.motivo || a.questionario.farmaci
                              || a.questionario.allergie || a.questionario.note) && (
                              <div className="quest-box">
                                <p className="quest-title">Questionario del paziente</p>
                                {a.questionario.motivo && <p><strong>Disturbi:</strong> {a.questionario.motivo}</p>}
                                {a.questionario.farmaci && <p><strong>Farmaci:</strong> {a.questionario.farmaci}</p>}
                                {a.questionario.allergie && <p><strong>Allergie:</strong> {a.questionario.allergie}</p>}
                                {a.questionario.note && <p><strong>Altro:</strong> {a.questionario.note}</p>}
                              </div>
                            )}
                            {a.prep_nome && (
                              <p>
                                <strong>Preparazione:</strong> {a.prep_nome}
                                {' '}{a.prep_inviata ? '(inviata al paziente ✓)' : '(non ancora inviata)'}
                              </p>
                            )}
                            {s && s.allegati.length > 0 ? (
                              <p>
                                <strong>Allegati:</strong>{' '}
                                {s.allegati.map((al, i) => (
                                  <span key={al.id}>
                                    {i > 0 ? ', ' : ''}
                                    <a href={`/api/attachments/${al.id}`} target="_blank" rel="noreferrer">
                                      {al.filename}
                                    </a>
                                  </span>
                                ))}
                              </p>
                            ) : (
                              <p className="tmeta">Nessun allegato</p>
                            )}
                            <Link href={`/referral/${a.referral_id}`} className="reflink">
                              Apri la referral completa →
                            </Link>
                          </div>
                        </details>
                      )}
                    </div>
                    <div className="tl-act">
                      {a.completed_at ? (
                        <form action={annullaCompletamento}>
                          <input type="hidden" name="appointment_id" value={a.id} />
                          <button className="btn btn-ghost btn-small" type="submit">Annulla</button>
                        </form>
                      ) : (
                        <details className="complete">
                          <summary className="btn btn-small">✓ Completa</summary>
                          <form action={completaAppuntamento} className="complete-form card">
                            <input type="hidden" name="appointment_id" value={a.id} />
                            <p className="complete-title">Il paziente è da rivedere?</p>
                            <label className="radio">
                              <input type="radio" name="follow_up" value="no" required /> Non è da rivedere
                            </label>
                            <label className="radio">
                              <input type="radio" name="follow_up" value="6" /> Tra 6 mesi
                            </label>
                            <label className="radio">
                              <input type="radio" name="follow_up" value="12" /> Tra 12 mesi
                            </label>
                            <label className="radio">
                              <input type="radio" name="follow_up" value="altro" /> Altro:
                              <input type="number" name="follow_up_mesi" min={1} max={120}
                                placeholder="mesi" className="fup-mesi" />
                              mesi
                            </label>
                            <button className="btn btn-primary btn-small" type="submit">Conferma visita ✓</button>
                          </form>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {unassigned.length > 0 && !restrictProviderId && (
        <section className="prog-group">
          <h2 className="prog-doctor">Da assegnare <span className="badge badge-warn">{unassigned.length}</span></h2>
          <p className="muted">
            Appuntamenti del calendario non riconducibili a un medico. Assegnali qui: con «ricorda»
            l'associazione viene imparata per le prossime sincronizzazioni.
          </p>
          <ul className="queue">
            {unassigned.map((a) => (
              <li key={a.id} className="qrow tone-gray">
                <div className="qrow-main">
                  <div className="qrow-top">
                    <span className="ptime">{ora(a.starts_at)}</span>
                    <span className="pname">{a.titolo || a.paziente_nome || 'Appuntamento'}</span>
                  </div>
                  <form action={assignProvider} className="assign-form">
                    <input type="hidden" name="appointment_id" value={a.id} />
                    <select name="provider_id" required defaultValue="">
                      <option value="" disabled>Assegna a…</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                    <label className="check">
                      <input type="checkbox" name="remember" defaultChecked /> ricorda
                    </label>
                    <button className="btn" type="submit">Assegna</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!restrictProviderId && (
        <p className="muted">
          <Link href="/programma/feed">Configura feed e medici →</Link>
        </p>
      )}
    </>
  );
}
