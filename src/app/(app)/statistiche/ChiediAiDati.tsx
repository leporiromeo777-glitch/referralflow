'use client';

import { useState } from 'react';

// «Chiedi ai tuoi dati»: casella di domanda in cima alle statistiche.
// La risposta arriva dall'AI locale, calcolata SOLO sugli aggregati dello
// studio — vedi /api/statistiche/chiedi.

const ESEMPI = [
  'Quante referral abbiamo ricevuto negli ultimi mesi?',
  'Chi sono i medici che ci inviano più pazienti?',
  'Quanto ci mettiamo in media a prenotare?',
];

type Props = {
  // Esito del ping fatto dalla pagina (server). Quando è falso il riquadro
  // resta VISIBILE e spiega perché: prima spariva in silenzio.
  attiva?: boolean;
  motivo?: string | null;
};

export function ChiediAiDati({ attiva = true, motivo = null }: Props) {
  const [domanda, setDomanda] = useState('');
  const [risposta, setRisposta] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  async function chiedi(testo: string) {
    const d = testo.trim();
    if (!d || inCorso) return;
    setInCorso(true);
    setErrore('');
    setRisposta('');
    try {
      const r = await fetch('/api/statistiche/chiedi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domanda: d }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErrore([j?.errore, j?.dettaglio].filter(Boolean).join(' — ') || 'Qualcosa è andato storto: riprova.');
      else setRisposta(j.risposta ?? '');
    } catch {
      setErrore('Rete non raggiungibile: riprova.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="card ai-box chiedi">
      <p className="quest-title">Chiedi ai tuoi dati — AI locale</p>
      <p className="muted small">
        Una domanda in italiano sui numeri dello studio: l&apos;AI risponde solo dagli
        aggregati (mai dati di singoli pazienti), tutto sul Mac dello studio.
      </p>
      {!attiva && (
        <p className="error">
          {motivo ?? 'AI locale non raggiungibile.'}{' '}
          <a href="/api/ai/diagnostica" target="_blank" rel="noreferrer">Vedi la diagnostica</a>
        </p>
      )}
      <form
        className="chiedi-form"
        onSubmit={(e) => { e.preventDefault(); void chiedi(domanda); }}
      >
        <input
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          placeholder="Es. quante referral urgenti abbiamo avuto quest'anno?"
          maxLength={400}
          disabled={!attiva}
        />
        <button className="btn btn-primary btn-small" type="submit" disabled={inCorso || !attiva}>
          {inCorso ? 'Ci penso…' : 'Chiedi'}
        </button>
      </form>
      <div className="chiedi-esempi">
        {ESEMPI.map((e) => (
          <button key={e} type="button" className="chiedi-esempio" disabled={!attiva}
            onClick={() => { setDomanda(e); void chiedi(e); }}>
            {e}
          </button>
        ))}
      </div>
      {inCorso && <p className="muted small">L&apos;AI locale sta leggendo i numeri…</p>}
      {errore && <p className="error">{errore}</p>}
      {risposta && <p className="ai-testo">{risposta}</p>}
    </div>
  );
}
