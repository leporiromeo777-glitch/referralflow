'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Chiude il menu hamburger (mobile) dopo il tocco su una voce.
function chiudiMenu() {
  const t = document.getElementById('navtoggle') as HTMLInputElement | null;
  if (t) t.checked = false;
}

// Voce di navigazione con stato attivo (evidenzia la sezione corrente).
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // La coda (/) comprende anche il dettaglio delle referral.
  const active = href === '/'
    ? pathname === '/' || pathname.startsWith('/referral')
    : pathname.startsWith(href);
  return (
    <Link
      className={className ?? `navlink${active ? ' active' : ''}`}
      href={href}
      onClick={chiudiMenu}
    >
      {children}
    </Link>
  );
}
