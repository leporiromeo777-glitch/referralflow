import { ReactNode } from 'react';

// Intestazione di pagina «premium»: fascia tenue con un'etichetta di zona
// (eyebrow), il titolo e la riga di spiegazione. Ogni area dell'app ha il suo
// accento — così le pagine non si somigliano tutte pur restando coerenti.
// Le zone usano solo i colori già in palette (verde/ambra/blu/ardesia).
type Zone = 'green' | 'amber' | 'blue' | 'slate';

export function PageHero({
  zone,
  eyebrow,
  title,
  action,
  children,
}: {
  zone: Zone;
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={`page-hero hero-${zone}`}>
      <div className="hero-top">
        <span className="hero-eyebrow">{eyebrow}</span>
        {action}
      </div>
      <h1>{title}</h1>
      {children && <p className="hero-lede">{children}</p>}
    </header>
  );
}

// Riepilogo compatto su una riga: alternativa alle «caselle» metriche per le
// pagine dove il contenuto principale sono le liste (Lista d'attesa, Inviati).
// Numeri in linea con divisori, non tre card separate.
export function StatStrip({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: 'alert' | 'warn' }[];
}) {
  return (
    <div className="statbar">
      {items.map((it, i) => (
        <div key={i} className={`statbar-item${it.tone ? ` ${it.tone}` : ''}`}>
          <span className="statbar-num">{it.value}</span>
          <span className="statbar-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
