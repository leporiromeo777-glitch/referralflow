import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AutoRefresh } from './AutoRefresh';
import { NavLink } from './NavLink';
import { SideNav, Zona } from './SideNav';

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
  const isInviante = session?.role === 'inviante';
  const full = !!session && !isMedico && !isInviante;

  let nuove = 0;
  let richiamiScaduti = 0;
  let refertiBozze = 0;
  let refertiAttivi = false;
  let consultiAperti = 0;
  let oggiCount = 0;
  if (full) {
    const [c] = await query<{
      nuove: number; richiami: number; referti: number; referti_attivi: boolean;
      consulti: number; da_prenotare: number; disdette: number;
    }>(
      `select
         (select count(*) from referrals where status = 'ricevuta' and studio_id = $1)::int as nuove,
         (select count(*) from referti_bozze where studio_id = $1 and stato = 'bozza')::int as referti,
         (select referti_token_set_at is not null from studios where id = $1) as referti_attivi,
         (select count(*) from consulti where studio_id = $1 and stato = 'aperto')::int as consulti,
         (select count(*) from referrals where studio_id = $1 and status = 'da_prenotare')::int as da_prenotare,
         (select count(*) from referrals where studio_id = $1 and status = 'prenotata'
            and appt_response in ('disdetto','disdetta_da_confermare'))::int as disdette,
         ((select count(*) from referrals
            where studio_id = $1
              and follow_up_due <= current_date and follow_up_done_at is null)
          + (select count(*) from appointments
              where studio_id = $1
                and follow_up_due <= current_date and follow_up_done_at is null
                and referral_id is null))::int as richiami`,
      [session!.studioId]
    );
    nuove = c?.nuove ?? 0;
    richiamiScaduti = c?.richiami ?? 0;
    refertiBozze = c?.referti ?? 0;
    refertiAttivi = c?.referti_attivi ?? false;
    consultiAperti = c?.consulti ?? 0;
    // «Oggi» raccoglie tutto ciò che è azionabile: badge complessivo.
    oggiCount = nuove + (c?.da_prenotare ?? 0) + (c?.disdette ?? 0) + richiamiScaduti + consultiAperti + refertiBozze;
  }

  const supportEmail = process.env.SUPPORT_EMAIL;

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

  const home = isInviante ? '/invii' : isMedico ? '/programma' : '/';

  // Le quattro zone della barra laterale (fisarmonica). I badge di zona sono la
  // somma dei badge delle voci, così da chiusa si vede quanto c'è da fare.
  const zoneOggi: Zona['voci'] = [
    { label: 'Panoramica', href: '/' },
    { label: 'Coda', href: '/coda' },
    { label: 'Programma', href: '/programma' },
    { label: 'Follow-up', href: '/richiami', badge: richiamiScaduti },
    { label: 'Consulti', href: '/consulti', badge: consultiAperti },
    // Sempre visibile: da qui si caricano i dettati (drag & drop) anche se il
    // Mac della trascrizione non è ancora configurato.
    { label: 'Referti', href: '/referti', badge: refertiBozze },
    { label: 'Visite', href: '/visite' },
  ];
  const zones: Zona[] = [
    { key: 'oggi', label: 'Oggi', badge: oggiCount, voci: zoneOggi },
    { key: 'pazienti', label: 'Pazienti', voci: [
      { label: 'Cerca paziente', href: '/pazienti' },
    ] },
    { key: 'rete', label: 'Rete', voci: [
      { label: 'Medici invianti', href: '/medici' },
      { label: 'Pazienti inviati', href: '/inviati' },
      { label: 'Affida paziente', href: '/affida' },
    ] },
    { key: 'studio', label: 'Studio', voci: [
      { label: 'Statistiche', href: '/statistiche' },
      { label: 'Anonimizza documenti', href: '/anonimizza' },
      ...(isAdmin ? [{ label: 'Impostazioni', href: '/impostazioni/studio' }] : []),
    ] },
  ];

  return (
    <div className="shell">
      <AutoRefresh seconds={60} />

      {/* Hamburger (mobile): checkbox CSS-only che apre la barra laterale. */}
      <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Apri il menu" />

      <aside className="side">
        <div className="side-brand">
          <Link href={home}>Referral<span>Flow</span></Link>
          {isInviante ? <em>Area medici invianti</em>
            : session?.studioNome ? <em>{session.studioNome}</em> : null}
        </div>

        {full && <SideNav zones={zones} />}

        {isMedico && (
          <nav className="side-nav">
            <div className="side-group">
              <NavLink href="/programma" className="side-link">Programma</NavLink>
            </div>
          </nav>
        )}

        {full && (
          <Link href="/referral/nuova" className="btn btn-primary side-cta">+ Nuova referral</Link>
        )}
      </aside>

      <div className="main-col">
        <header className="mtop">
          <label htmlFor="navtoggle" className="hamburger" aria-hidden="true">
            <span></span><span></span><span></span>
          </label>
          <div className="mtop-brand">
            <Link href={home}>Referral<span>Flow</span></Link>
          </div>
          <div className="mtop-actions">
            {full && (
              <Link className="bell" href="/coda?stato=ricevuta" title={`${nuove} nuove richieste da smistare`}>
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
          </div>
        </header>

        {/* Copertura mobile: tocca fuori per chiudere il menu. */}
        <label htmlFor="navtoggle" className="nav-scrim" aria-hidden="true"></label>

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
      </div>
    </div>
  );
}
