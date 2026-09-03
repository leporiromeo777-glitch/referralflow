'use client';

import { useEffect, useRef, useState } from 'react';

// Bottone «Riorganizza nel formato standard (AI)» con percentuale vera:
// avvia il lavoro via API e interroga l'avanzamento ogni 2 secondi.
// Il modello locale impiega minuti: la barra dice a che punto è, e
// ripremere non accoda un secondo lavoro (lo impedisce il server).

type Stato =
  | { fase: 'fermo' }
  | { fase: 'lavora'; percento: number }
  | { fase: 'errore'; messaggio: string };

const MESSAGGI: Record<string, string> = {
  numeri: 'Proposta scartata: la riorganizzazione avrebbe cambiato dei numeri.',
  troppo_corto: 'Proposta scartata: il risultato perdeva contenuto.',
  ai_non_risponde: "L'AI locale non ha risposto: riprova tra qualche minuto.",
};

export default function RiorganizzaAI({ bozzaId }: { bozzaId: string }) {
  const [stato, setStato] = useState<Stato>({ fase: 'fermo' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function sorveglia() {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/referti/struttura?id=${bozzaId}`, { cache: 'no-store' });
        if (!r.ok) return;
        const s = await r.json();
        if (s.stato === 'lavora') {
          setStato({ fase: 'lavora', percento: s.percento ?? 1 });
        } else if (s.stato === 'fatto') {
          if (timer.current) clearInterval(timer.current);
          window.location.assign(`/referti/${bozzaId}?ok=strutturato`);
        } else if (s.stato === 'errore') {
          if (timer.current) clearInterval(timer.current);
          setStato({ fase: 'errore', messaggio: MESSAGGI[s.motivo ?? ''] ?? MESSAGGI.ai_non_risponde });
        }
      } catch { /* rete assente per un attimo: si riprova al giro dopo */ }
    }, 2000);
  }

  async function avvia(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const form = e.currentTarget.form;
    const casella = form?.elements.namedItem('testo') as HTMLTextAreaElement | null;
    setStato({ fase: 'lavora', percento: 1 });
    try {
      const r = await fetch('/api/referti/struttura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bozzaId, testo: casella?.value ?? '' }),
      });
      if (!r.ok) throw new Error();
      sorveglia();
    } catch {
      setStato({ fase: 'errore', messaggio: MESSAGGI.ai_non_risponde });
    }
  }

  if (stato.fase === 'lavora') {
    const p = stato.percento;
    return (
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
          <span>{p < 5 ? 'Il modello sta leggendo il referto…' : 'Riorganizzazione in corso…'}</span>
          <strong>{p}%</strong>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(13,92,72,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(p, 2)}%`, borderRadius: 999, background: 'var(--cta)', transition: 'width 0.6s ease' }} />
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          Richiede qualche minuto (modello locale). Puoi restare su questa pagina.
        </div>
      </div>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <button className="btn" type="button" onClick={avvia}>
        Riorganizza nel formato standard (AI)
      </button>
      {stato.fase === 'errore' && (
        <span className="muted small" role="alert">{stato.messaggio}</span>
      )}
    </span>
  );
}
