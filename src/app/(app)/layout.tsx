import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AutoRefresh } from './AutoRefresh';
import { NavLink } from './NavLink';

function iniziali(email: string): string {
  const parte = email.split('@')[0];
  const pezzi = parte.split(/[._-]+/).filter(Boolean);
  const testo = pezzi.length >= 2 ? pezzi[0][0] + pezzi[1][0] : parte.slice(0, 2);
  return testo.toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isMedico = session?.role === 'medico';
  const isAdmin = session?.role === 'admin';
  // L'inviante non ha studio: topbar minimale, nessuna query recintata.
  const isInviante = session?.role === 'inviante';

  // Nuove richieste da smistare (campanella) e richiami scaduti (badge
  // Follow-up), solo segreteria/admin. Le disdette hanno il loro badge sulla
  // scheda «Disdette» dentro la Coda.
  let nuove = 0;
  let richiamiScaduti = 0;
  if (session && !isMedico && !isInviante) {
    const [c] = await query<{ nuove: number; richiami: number }>(
      `select
         (select count(*) from referrals where status = 'ricevuta' and studio_id = $1)::int as nuove,
         ((select count(*) from referrals
            where studio_id = $1
              and follow_up_due <= current_date and follow_up_done_at is null)
          + (select count(*) from appointments
              where studio_id = $1
                and follow_up_due <= current_date and follow_up_done_at is null
                and referral_id is null))::int as richiami`,
      [session.studioId]
    );
    nuove = c?.nuove ?? 0;
    richiamiScaduti = c?.richiami ?? 0;
  }

  const supportEmail = process.env.SUPPORT_EMAIL;

  // Prova in scadenza: avviso discreto all'admin negli ultimi 14 giorni
  // (e dopo la scadenza). Nessun blocco: l'abbonamento si concorda a voce.
  let provaAvviso: { scadenza: string; scaduta: boolean } | null = null;
  if (session && isAdmin) {
    const [s] = await query<{ giorni: number | null; scadenza: string | null }>(
      `select (trial_until - current_date) as giorni,
              to_char(trial_until, 'DD.MM.YYYY') as scadenza
         from studios where id = $1 and abbonamento = 'prova' and trial_until is not null`,
      [session.studioId]
    );
    if (s?.scadenza && s.giorni !== null && s.giorni <= 14) {
      provaAvviso = { scadenza: s.scadenza, scaduta: s.giorni < 0 };
    }
  }

  return (
    <>
      <AutoRefresh seconds={60} />
      <header className="topbar">
        <div className="brand">
          <Link href={isInviante ? '/invii' : isMedico ? '/programma' : '/'}>Referral<span>Flow</span></Link>
          {isInviante ? <em>Area medici invianti</em>
            : session?.studioNome ? <em>{session.studioNome}</em> : null}
        </div>

        {/* Hamburger (solo mobile): checkbox CSS-only, le voci si aprono a tendina. */}
        {!isInviante && (
          <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Apri il menu" />
        )}

        <nav className="topnav">
          {/* L'inviante ha solo la sua area /invii: niente voci dello studio. */}
          {!isMedico && !isInviante && <NavLink href="/">Coda</NavLink>}
          {!isInviante && <NavLink href="/programma">Programma</NavLink>}
          {!isMedico && !isInviante && (
            <NavLink href="/richiami">
              Follow-up{richiamiScaduti > 0 ? <span className="nav-count">{richiamiScaduti}</span> : null}
            </NavLink>
          )}
          {!isMedico && !isInviante && <NavLink href="/inviati">Pazienti inviati</NavLink>}
          {!isMedico && !isInviante && <NavLink href="/medici">Medici invianti</NavLink>}
          {!isMedico && !isInviante && <NavLink href="/statistiche">Statistiche</NavLink>}
          {!isMedico && !isInviante && (
            <NavLink className="btn btn-primary" href="/referral/nuova">+ Nuova referral</NavLink>
          )}
        </nav>

        {/* Sempre visibili, anche su mobile: campanella, profilo, hamburger. */}
        <div className="topbar-actions">
          {!isMedico && !isInviante && (
            <Link className="bell" href="/" title={`${nuove} nuove richieste da smistare`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {nuove > 0 && <span className="bell-badge">{nuove}</span>}
            </Link>
          )}

          {session && (
            <Link className="avatar" href="/profilo" title={session.email}>
              {iniziali(session.email)}
            </Link>
          )}

          {!isInviante && (
            <label htmlFor="navtoggle" className="hamburger" aria-hidden="true">
              <span></span><span></span><span></span>
            </label>
          )}
        </div>
      </header>
      <main className="content">
        {provaAvviso && (
          <div className="card notice" style={{ marginBottom: 16 }}>
            <p className="muted">
              {provaAvviso.scaduta
                ? <>La prova gratuita è terminata il {provaAvviso.scadenza}. Lo studio
                    resta operativo: vi contatteremo per l'abbonamento — oppure scriveteci voi
                    {supportEmail ? <> a <a href={`mailto:${supportEmail}`}>{supportEmail}</a></> : null}.</>
                : <>Prova gratuita fino al {provaAvviso.scadenza}. Poi l'abbonamento si
                    concorda con noi — nessun rinnovo automatico, nessun blocco improvviso.</>}
            </p>
          </div>
        )}
        {children}
      </main>
    </>
  );
}
