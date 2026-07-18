import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { logout } from '../actions';

export const dynamic = 'force-dynamic';

const RUOLI: Record<string, string> = {
  segretaria: 'Segreteria',
  medico: 'Medico',
  admin: 'Amministratore',
  inviante: 'Medico inviante',
};

function iniziali(email: string): string {
  const parte = email.split('@')[0];
  const pezzi = parte.split(/[._-]+/).filter(Boolean);
  const testo = pezzi.length >= 2 ? pezzi[0][0] + pezzi[1][0] : parte.slice(0, 2);
  return testo.toUpperCase();
}

const Chevron = () => (
  <svg className="pf-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// Pagina Profilo (stile mockup: avatar, nome, lista di voci a scheda, Esci).
// Sostituisce il vecchio menu a tendina della foto profilo. Palette verde.
export default async function Profilo() {
  const session = await getSession();
  if (!session) redirect('/login');

  const isMedico = session.role === 'medico';
  const isAdmin = session.role === 'admin';
  const isInviante = session.role === 'inviante';

  // Nome del cardiologo collegato (se l'account è un medico interno).
  let providerNome: string | null = null;
  if (isMedico) {
    const [p] = await query<{ nome: string }>(
      'select nome from providers where user_id = $1 and studio_id = $2',
      [session.id, session.studioId]
    );
    providerNome = p?.nome ?? null;
  }

  const supportPhone = process.env.SUPPORT_PHONE;
  const supportEmail = process.env.SUPPORT_EMAIL;
  const owner = (process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
  const isOwner = !!owner && session.email.toLowerCase() === owner;

  const home = isInviante ? '/invii' : isMedico ? '/programma' : '/';
  const nome = providerNome ?? session.email;

  return (
    <main className="content pf">
      <div className="pf-top">
        <Link className="pf-icon-btn" href={home} aria-label="Indietro">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="pf-title">Profilo</h1>
        {isAdmin ? (
          <Link className="pf-icon-btn" href="/impostazioni/studio" aria-label="Impostazioni studio">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        ) : (
          <span className="pf-icon-btn pf-ghost" aria-hidden="true" />
        )}
      </div>

      <div className="pf-id">
        <div className="pf-avatar">{iniziali(session.email)}</div>
        <p className="pf-name">{nome}</p>
        <p className="pf-sub">{RUOLI[session.role] ?? session.role}{session.studioNome ? ` · ${session.studioNome}` : ''}</p>
        {providerNome && <p className="pf-email">{session.email}</p>}
      </div>

      <div className="pf-list">
        <Link className="pf-row" href="/sicurezza">
          <span className="pf-row-ic">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span className="pf-row-lb">Sicurezza dell&rsquo;account</span>
          <Chevron />
        </Link>

        {isAdmin && (
          <>
            <Link className="pf-row" href="/impostazioni/studio">
              <span className="pf-row-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                </svg>
              </span>
              <span className="pf-row-lb">Dati dello studio</span>
              <Chevron />
            </Link>
            <Link className="pf-row" href="/impostazioni/utenti">
              <span className="pf-row-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className="pf-row-lb">Utenti dello studio</span>
              <Chevron />
            </Link>
            <Link className="pf-row" href="/impostazioni/preparazioni">
              <span className="pf-row-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11H3v10h6zM21 3h-6v18h6zM15 7H9v14h6z" />
                </svg>
              </span>
              <span className="pf-row-lb">Preparazioni alla visita</span>
              <Chevron />
            </Link>
          </>
        )}

        {isOwner && (
          <Link className="pf-row" href="/piattaforma">
            <span className="pf-row-ic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
            </span>
            <span className="pf-row-lb">Piattaforma</span>
            <Chevron />
          </Link>
        )}

        {supportPhone && (
          <a className="pf-row" href={`tel:${supportPhone.replace(/\s+/g, '')}`}>
            <span className="pf-row-ic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <span className="pf-row-lb">Assistenza 24/7<span className="pf-row-meta">{supportPhone}</span></span>
            <Chevron />
          </a>
        )}
        {supportEmail && (
          <a className="pf-row" href={`mailto:${supportEmail}`}>
            <span className="pf-row-ic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
              </svg>
            </span>
            <span className="pf-row-lb">Scrivi all&rsquo;assistenza<span className="pf-row-meta">{supportEmail}</span></span>
            <Chevron />
          </a>
        )}
      </div>

      <form action={logout} className="pf-logout-form">
        <button className="btn btn-primary pf-logout" type="submit">Esci</button>
      </form>
    </main>
  );
}
