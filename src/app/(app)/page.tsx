import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { NEXT_STATUS, NEXT_ACTION } from '@/lib/status';
import { eta, giorniDa, dataOra } from '@/lib/format';
import { advanceStatus } from './referral/[id]/actions';

export const dynamic = 'force-dynamic';

// «Oggi»: la schermata che si apre al mattino. Una sola lista di cose da fare,
// già in ordine di priorità, che unisce ciò che prima era sparso su più pagine
// (nuove richieste, prenotazioni, disdette, follow-up, consulti, bozze di
// referto) — e a fianco il programma del giorno. Il dettaglio di ogni area
// resta nelle sue pagine, raggiungibili dalla barra laterale.

const SERVE_DETTAGLIO = new Set(['da_prenotare', 'vista']);

type Task = {
  key: string;
  prio: number;            // 0 = più urgente
  tone: 'danger' | 'warn' | 'accent' | 'gray';
  tag: string;
  titolo: string;
  sub: string;
  href: string;
  // azione inline (solo per le referral che avanzano con un clic)
  advance?: { id: string; to: string; label: string };
  azione?: string;         // etichetta del bottone-link
};

function dataEstesa(d: Date): string {
  return d.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default async function Oggi() {
  const session = await getSession();
  if (!session) redirect('/login');
  const sid = session.studioId;

  // Referral da lavorare (nuove, triage, da prenotare).
  const refs = await query<{
    id: string; quesito: string | null; urgenza: string; status: string;
    created_at: string; cognome: string; nome: string; data_nascita: string | null;
    medico_nome: string | null; origin_studio_nome: string | null;
  }>(
    `select r.id, r.quesito, r.urgenza, r.status, r.created_at::text,
            p.cognome, p.nome, p.data_nascita,
            d.nome as medico_nome, os.nome as origin_studio_nome
       from referrals r
       join patients p on p.id = r.patient_id
       left join referring_doctors d on d.id = r.referring_doctor_id
       left join studios os on os.id = r.origin_studio_id
      where r.studio_id = $1 and r.status in ('ricevuta','triage','da_prenotare')
      order by case r.urgenza when 'urgente' then 0 when 'normale' then 1 else 2 end,
               r.created_at asc
      limit 20`,
    [sid]
  );

  // Disdette da confermare (slot da liberare dopo la telefonata).
  const disd = await query<{ id: string; appuntamento_at: string; cognome: string; nome: string }>(
    `select r.id, r.appuntamento_at::text, p.cognome, p.nome
       from referrals r join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.status = 'prenotata'
        and r.appt_response = 'disdetta_da_confermare'
      order by r.appuntamento_at asc`,
    [sid]
  );

  // Consulti rapidi in attesa di risposta.
  const cons = await query<{ id: string; medico: string; created_at: string }>(
    `select c.id, d.nome as medico, c.created_at::text
       from consulti c join referring_doctors d on d.id = c.referring_doctor_id
      where c.studio_id = $1 and c.stato = 'aperto'
      order by c.created_at asc`,
    [sid]
  );

  // Bozze di referto da rivedere.
  const boz = await query<{ id: string; created_at: string; paziente: string | null; allarmi: number }>(
    `select id, created_at::text,
            payload -> 'campi_estratti' ->> 'nome_paziente' as paziente,
            coalesce(jsonb_array_length(payload -> 'allarmi_numerici'), 0)::int as allarmi
       from referti_bozze
      where studio_id = $1 and stato = 'bozza'
      order by created_at asc`,
    [sid]
  );

  // Follow-up scaduti (referral + appuntamenti senza referral).
  const fups = await query<{ k: string; id: string; nome: string | null; cognome: string | null; due: string }>(
    `select 'ref' as k, r.id, p.cognome, p.nome, r.follow_up_due::text as due
       from referrals r join patients p on p.id = r.patient_id
      where r.studio_id = $1 and r.follow_up_due <= current_date and r.follow_up_done_at is null
     union all
     select 'app' as k, a.id, null as cognome, a.paziente_nome as nome, a.follow_up_due::text as due
       from appointments a
      where a.studio_id = $1 and a.referral_id is null
        and a.follow_up_due <= current_date and a.follow_up_done_at is null
     order by due asc
     limit 20`,
    [sid]
  );

  // Programma di oggi.
  const oggi = await query<{
    starts_at: string; paziente_nome: string | null; motivo: string | null;
    medico: string | null; completed: boolean;
  }>(
    `select a.starts_at::text, a.paziente_nome, a.motivo, pr.nome as medico,
            (a.completed_at is not null) as completed
       from appointments a left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.starts_at::date = current_date
      order by a.starts_at asc`,
    [sid]
  );

  // Conteggi complessivi per la striscia di riepilogo.
  const [c] = await query<{ urgenti: number; da_prenotare: number }>(
    `select count(*) filter (where status in ('ricevuta','triage','da_prenotare') and urgenza='urgente')::int as urgenti,
            count(*) filter (where status = 'da_prenotare')::int as da_prenotare
       from referrals where studio_id = $1 and status <> 'chiusa'`,
    [sid]
  );

  // ── Costruzione della lista unica ──
  const tasks: Task[] = [];

  for (const r of refs) {
    const urgente = r.urgenza === 'urgente';
    const chi = r.medico_nome ?? (r.origin_studio_nome ? `Da ${r.origin_studio_nome}` : 'Medico non indicato');
    const next = NEXT_STATUS[r.status];
    const t: Task = {
      key: `ref-${r.id}`,
      prio: urgente ? 0 : r.status === 'ricevuta' ? 3 : 4,
      tone: urgente ? 'danger' : 'gray',
      tag: urgente ? 'urgente' : r.status === 'ricevuta' ? 'nuova' : 'da prenotare',
      titolo: `${r.cognome} ${r.nome}${r.data_nascita ? `, ${eta(r.data_nascita)}` : ''}`,
      sub: `${chi}${r.quesito ? ` · ${r.quesito}` : ''} · in attesa da ${giorniDa(r.created_at)} g`,
      href: `/referral/${r.id}`,
    };
    if (next) {
      if (SERVE_DETTAGLIO.has(r.status)) t.azione = NEXT_ACTION[r.status];
      else t.advance = { id: r.id, to: next, label: NEXT_ACTION[r.status] };
    }
    tasks.push(t);
  }

  for (const d of disd) {
    tasks.push({
      key: `disd-${d.id}`, prio: 1, tone: 'warn', tag: 'disdetta',
      titolo: `${d.cognome} ${d.nome}`,
      sub: `Disdetta da confermare · appuntamento ${dataOra(d.appuntamento_at)}`,
      href: `/referral/${d.id}`, azione: 'Conferma / annulla',
    });
  }

  for (const b of boz) {
    tasks.push({
      key: `boz-${b.id}`, prio: b.allarmi > 0 ? 1 : 3, tone: 'accent', tag: 'referto',
      titolo: b.paziente && b.paziente !== 'non indicato' ? b.paziente : 'Bozza di referto',
      sub: `Bozza da rivedere${b.allarmi > 0 ? ` · ${b.allarmi} allarmi numerici` : ''}`,
      href: `/referti/${b.id}`, azione: 'Rivedi',
    });
  }

  for (const c2 of cons) {
    tasks.push({
      key: `cons-${c2.id}`, prio: 2, tone: 'accent', tag: 'consulto',
      titolo: c2.medico,
      sub: `Consulto rapido in attesa di risposta · da ${giorniDa(c2.created_at)} g`,
      href: '/consulti', azione: 'Rispondi',
    });
  }

  for (const f of fups) {
    tasks.push({
      key: `fup-${f.k}-${f.id}`, prio: 5, tone: 'warn', tag: 'richiamo',
      titolo: [f.cognome, f.nome].filter(Boolean).join(' ') || 'Paziente',
      sub: `Follow-up scaduto il ${dataOra(f.due)}`,
      href: '/richiami', azione: 'Gestisci',
    });
  }

  tasks.sort((a, b) => a.prio - b.prio);

  const nUrgenti = c?.urgenti ?? 0;
  const chips = [
    { label: 'urgenti', value: nUrgenti, tone: 'danger' as const },
    { label: 'da prenotare', value: c?.da_prenotare ?? 0, tone: 'warn' as const },
    { label: 'consulti', value: cons.length, tone: 'accent' as const },
    { label: 'bozze referto', value: boz.length, tone: 'accent' as const },
    { label: 'disdette', value: disd.length, tone: 'warn' as const },
    { label: 'visite oggi', value: oggi.length, tone: 'ok' as const },
  ];

  const prossimo = oggi.find((a) => !a.completed);

  return (
    <div className="oggi">
      <header className="oggi-head">
        <div>
          <span className="oggi-eyebrow">La tua giornata</span>
          <h1>Oggi</h1>
          <p className="oggi-lede">
            {tasks.length === 0
              ? 'Niente in sospeso: la coda è pulita.'
              : `${tasks.length} ${tasks.length === 1 ? 'cosa' : 'cose'} da fare, in ordine di priorità. Le più urgenti in cima.`}
          </p>
        </div>
        <span className="oggi-date">{dataEstesa(new Date())}</span>
      </header>

      <div className="oggi-chips">
        {chips.map((ch) => (
          <span key={ch.label} className={`ochip${ch.value > 0 ? ` ochip-${ch.tone}` : ''}`}>
            <b>{ch.value}</b> {ch.label}
          </span>
        ))}
      </div>

      <div className="oggi-cols">
        <section className="oggi-list">
          <div className="oggi-list-head">
            <h2>Da fare adesso</h2>
            <Link href="/coda" className="oggi-seelink">Coda completa →</Link>
          </div>

          {tasks.length === 0 && (
            <div className="empty">Tutto gestito. Buon lavoro.</div>
          )}

          <ul className="queue">
            {tasks.map((t) => (
              <li key={t.key} className={`qrow qrow-flex tone-${t.tone}`}>
                <Link href={t.href} className="qrow-link">
                  <div className="qrow-main">
                    <div className="qrow-top">
                      <span className="pname">{t.titolo}</span>
                      <span className={`badge badge-${t.tone === 'gray' ? 'accent' : t.tone}`}>
                        {t.tag}
                      </span>
                    </div>
                    <div className="qrow-sub">{t.sub}</div>
                  </div>
                </Link>
                {(t.advance || t.azione) && (
                  <div className="qrow-action">
                    {t.advance ? (
                      <form action={advanceStatus}>
                        <input type="hidden" name="id" value={t.advance.id} />
                        <input type="hidden" name="to" value={t.advance.to} />
                        <button className="btn btn-small" type="submit">{t.advance.label}</button>
                      </form>
                    ) : (
                      <Link href={t.href} className="btn btn-small">{t.azione}</Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <aside className="oggi-side">
          <div className="oggi-panel">
            <div className="oggi-panel-head">
              <h2>Programma di oggi</h2>
              <Link href="/programma" className="oggi-seelink">Apri →</Link>
            </div>
            {oggi.length === 0 ? (
              <p className="muted small">Nessun appuntamento in agenda per oggi.</p>
            ) : (
              <ul className="oggi-tl">
                {oggi.map((a, i) => (
                  <li key={i} className={`oggi-tl-item${a.completed ? ' done' : ''}${a === prossimo ? ' now' : ''}`}>
                    <span className="oggi-tl-ora">{dataOra(a.starts_at).slice(-5)}</span>
                    <span className="oggi-tl-body">
                      <b>{a.paziente_nome ?? '—'}</b>
                      <span>{[a.medico, a.motivo].filter(Boolean).join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
