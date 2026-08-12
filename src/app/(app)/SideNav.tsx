'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Barra laterale a fisarmonica: all'inizio si vedono solo le quattro zone
// (Oggi, Pazienti, Rete, Studio); cliccandone una si aprono le sue voci, e le
// altre si richiudono. La zona della pagina corrente resta evidenziata anche da
// chiusa.

export type Voce = { label: string; href: string; badge?: number };
export type Zona = { key: string; label: string; badge?: number; voci: Voce[] };

function chiudiMenu() {
  const t = document.getElementById('navtoggle') as HTMLInputElement | null;
  if (t) t.checked = false;
}

export function SideNav({ zones }: { zones: Zona[] }) {
  const pathname = usePathname();
  const attiva = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);
  const zonaAttiva = zones.find((z) => z.voci.some((v) => attiva(v.href)))?.key ?? null;

  // All'avvio sulla home non si apre nulla (solo le quattro zone); entrando in
  // una pagina, la sua zona è già aperta così non ci si perde.
  const [aperta, setAperta] = useState<string | null>(
    pathname === '/' ? null : zonaAttiva
  );

  return (
    <nav className="side-nav">
      {zones.map((z) => {
        const isOpen = aperta === z.key;
        const isActive = z.key === zonaAttiva;
        return (
          <div className={`side-zone${isOpen ? ' open' : ''}`} key={z.key}>
            <button
              type="button"
              className={`side-zonehead${isActive ? ' active' : ''}`}
              aria-expanded={isOpen}
              onClick={() => setAperta(isOpen ? null : z.key)}
            >
              <span className="side-zonelabel">{z.label}</span>
              {!isOpen && z.badge ? <span className="side-count">{z.badge}</span> : null}
              <svg className="side-chev" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {isOpen && (
              <div className="side-voci">
                {z.voci.map((v) => (
                  <Link
                    key={v.href}
                    href={v.href}
                    onClick={chiudiMenu}
                    className={`side-link${attiva(v.href) ? ' active' : ''}`}
                  >
                    {v.label}
                    {v.badge ? <span className="side-count">{v.badge}</span> : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
