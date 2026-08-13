'use client';

import { useRef } from 'react';

// Player del dettato: il player nativo (col pallino trascinabile per tornare
// indietro, ora che la rotta supporta le richieste Range) più due salti rapidi
// comodi durante il controllo del testo.

export function AudioDettato({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);

  const salta = (secondi: number) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime + secondi);
    if (a.paused) void a.play().catch(() => {});
  };

  return (
    <div className="audio-dettato">
      <audio ref={ref} controls preload="metadata" src={src} />
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
