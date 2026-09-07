'use client';

import { useRef, useState } from 'react';

// Messaggio chiaro quando il browser non riesce a riprodurre la traccia
// (invece di un player muto): il codice aiuta a capire dove si ferma.
const ERRORI: Record<number, string> = {
  1: 'caricamento interrotto',
  2: 'errore di rete durante il caricamento',
  3: 'il browser non riesce a decodificare questo audio',
  4: 'formato audio non supportato da questo browser',
};

// Player del dettato: il player nativo (col pallino trascinabile per tornare
// indietro, ora che la rotta supporta le richieste Range) più due salti rapidi
// comodi durante il controllo del testo.

export function AudioDettato({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [errore, setErrore] = useState('');

  const salta = (secondi: number) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime + secondi);
    if (a.paused) void a.play().catch(() => {});
  };

  return (
    <div className="audio-dettato">
      {/* L'id serve al testo sincronizzato (TestoDettato) per pilotare il player. */}
      <audio
        ref={ref}
        id="audio-dettato"
        controls
        preload="metadata"
        src={src}
        onError={() => {
          const code = ref.current?.error?.code ?? 0;
          setErrore(`Audio non riproducibile: ${ERRORI[code] ?? 'errore sconosciuto'} (codice ${code}).`);
        }}
        onCanPlay={() => setErrore('')}
      />
      {errore && <p className="error" style={{ marginTop: 6 }}>{errore}</p>}
      <div className="audio-salti">
        <button type="button" className="btn btn-small" onClick={() => salta(-10)}>
          ⏪ Indietro 10 s
        </button>
        <button type="button" className="btn btn-small" onClick={() => salta(10)}>
          Avanti 10 s ⏩
        </button>
      </div>
    </div>
  );
}
