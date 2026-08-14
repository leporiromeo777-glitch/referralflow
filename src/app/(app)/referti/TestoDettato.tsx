'use client';

import { useEffect, useMemo, useState } from 'react';

// Testo del referto sincronizzato con l'audio: mentre il dettato scorre, la
// parola che si sta sentendo si illumina; un clic su una parola porta l'audio
// in quel punto. I tempi arrivano dalla pipeline (payload.parole, allineati
// al testo finale); il player è l'<audio id="audio-dettato"> della pagina.
// Le evidenziazioni gialle/rosse (punti da ricontrollare) restano identiche.

export type RangeSegnalato = { start: number; end: number; tipo: string; spiega?: string };

export function TestoDettato({
  testo,
  parole,
  ranges,
}: {
  testo: string;
  parole: [string, number][];
  ranges: RangeSegnalato[];
}) {
  const [attiva, setAttiva] = useState(-1);

  // Le parole del testo con i loro offset (stesso split su spazi usato dalla
  // pipeline per allineare i tempi: gli indici combaciano per costruzione).
  const pezzi = useMemo(() => {
    const out: { w: string; start: number; end: number }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(testo))) out.push({ w: m[0], start: m.index, end: m.index + m[0].length });
    return out;
  }, [testo]);

  useEffect(() => {
    const a = document.getElementById('audio-dettato') as HTMLAudioElement | null;
    if (!a) return;
    const tick = () => {
      const t = a.currentTime;
      let i = -1;
      for (let k = 0; k < parole.length; k++) {
        if (parole[k][1] <= t + 0.05) i = k;
        else break;
      }
      setAttiva(t === 0 && a.paused ? -1 : i);
    };
    a.addEventListener('timeupdate', tick);
    a.addEventListener('seeked', tick);
    a.addEventListener('ended', () => setAttiva(-1));
    return () => {
      a.removeEventListener('timeupdate', tick);
      a.removeEventListener('seeked', tick);
    };
  }, [parole]);

  const vai = (idx: number) => {
    const a = document.getElementById('audio-dettato') as HTMLAudioElement | null;
    if (!a || !parole[idx]) return;
    a.currentTime = Math.max(0, parole[idx][1]);
    void a.play().catch(() => {});
  };

  const nodi: React.ReactNode[] = [];
  let pos = 0;
  pezzi.forEach((p, idx) => {
    if (p.start > pos) nodi.push(testo.slice(pos, p.start));
    const r = ranges.find((r) => p.start < r.end && p.end > r.start);
    const classi = ['parola'];
    if (r) classi.push(r.tipo === 'dubbio' ? 'ref-mark-dubbio' : 'ref-mark-div');
    if (idx === attiva) classi.push('parola-attiva');
    nodi.push(
      <span key={idx} className={classi.join(' ')} title={r?.spiega} onClick={() => vai(idx)}>
        {p.w}
      </span>
    );
    pos = p.end;
  });
  nodi.push(testo.slice(pos));

  return (
    <>
      <p className="muted">
        Premi play e segui la parola illuminata; con un clic su una parola l&apos;audio
        salta in quel punto — comodo sui punti evidenziati.
      </p>
      <div className="testo-sync" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {nodi}
      </div>
    </>
  );
}
