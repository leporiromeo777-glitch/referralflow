'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Avanzamento vivo della trascrizione: per ogni dettato in coda una riga con
// la barra di progresso e una finestra a scomparsa con le fasi. Si aggiorna da
// solo ogni pochi secondi; quando una bozza è pronta ricarica la pagina.

type Voce = {
  id: string; filename: string; stato: string; fase: string | null;
  fase_at: string | null; created_at: string; bozza_id: string | null;
};

// Le fasi nell'ordine reale della pipeline, con etichetta umana e avanzamento.
const FASI: Array<{ key: string; label: string; pct: number }> = [
  { key: 'in_coda',        label: 'In coda, in attesa del Mac dello studio', pct: 4 },
  { key: 'scaricato',      label: 'Preso in carico dal Mac',                 pct: 8 },
  { key: 'preprocessing',  label: 'Pulizia dell’audio',                 pct: 14 },
  { key: 'trascrizione_a', label: 'Prima trascrizione (whisper)',            pct: 30 },
  { key: 'trascrizione_b', label: 'Seconda trascrizione di controllo',       pct: 55 },
  { key: 'dizionario',     label: 'Dizionario dello studio',                 pct: 62 },
  { key: 'confronto',      label: 'Confronto tra le due trascrizioni',       pct: 66 },
  { key: 'correzione_llm', label: 'Correzione AI (termini medici)',          pct: 76 },
  { key: 'segreteria',     label: 'Segretaria AI (separa le istruzioni)',    pct: 82 },
  { key: 'ispezione_llm',  label: 'Ricerca dei punti dubbi',                 pct: 87 },
  { key: 'estrazione',     label: 'Estrazione dei campi',                    pct: 92 },
  { key: 'controlli',      label: 'Controlli numerici',                      pct: 95 },
  { key: 'invio',          label: 'Consegna della bozza',                    pct: 98 },
];

function indiceFase(v: Voce): number {
  const chiave = v.stato === 'in_coda' ? 'in_coda' : (v.fase ?? 'scaricato');
  const i = FASI.findIndex((f) => f.key === chiave);
  return i === -1 ? 1 : i;
}

function minutiDa(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min === 0 ? 'meno di un minuto' : min === 1 ? '1 minuto' : `${min} minuti`;
}

export function ProgressoTrascrizione({ iniziali }: { iniziali: Voce[] }) {
  const router = useRouter();
  const [voci, setVoci] = useState<Voce[]>(iniziali);

  useEffect(() => {
    let vivo = true;
    let pronte = new Set(iniziali.filter((v) => v.bozza_id).map((v) => v.id));
    const giro = async () => {
      try {
        const r = await fetch('/api/referti/stato', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!vivo || !Array.isArray(j?.voci)) return;
        setVoci(j.voci);
        // Una bozza nuova è arrivata: ricarica la parte server della pagina
        // (compare tra le voci da rivedere).
        const nuovePronte = j.voci.filter((v: Voce) => v.bozza_id && !pronte.has(v.id));
        if (nuovePronte.length > 0) {
          nuovePronte.forEach((v: Voce) => pronte.add(v.id));
          router.refresh();
        }
      } catch { /* rete assente: si riprova al giro dopo */ }
    };
    const t = setInterval(giro, 6000);
    return () => { vivo = false; clearInterval(t); };
  }, [router, iniziali]);

  const attive = voci.filter((v) => v.stato === 'in_coda' || v.stato === 'elaborazione');
  const errori = voci.filter((v) => v.stato === 'errore');

  if (attive.length === 0 && errori.length === 0) return null;

  return (
    <div className="card">
      <h2>In trascrizione</h2>
      <p className="muted">
        Il Mac dello studio li lavora uno alla volta: qui vedi a che punto è.
        La bozza compare da sola appena pronta.
      </p>
      <ul className="prog-tr-list">
        {attive.map((v) => {
          const i = indiceFase(v);
          const f = FASI[i];
          return (
            <li key={v.id}>
              <details className="prog-tr">
                <summary>
                  <span className="trasc-spin" aria-hidden="true"></span>
                  <span className="prog-tr-nome">{v.filename}</span>
                  <span className="prog-tr-fase">{f.label}</span>
                  <span className="prog-tr-pct">{f.pct}%</span>
                </summary>
                <div className="prog-tr-corpo">
                  <div className="prog-tr-barra" role="progressbar"
                    aria-valuenow={f.pct} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${f.pct}%` }}></span>
                  </div>
                  <ol className="prog-tr-fasi">
                    {FASI.map((fase, j) => (
                      <li key={fase.key}
                        className={j < i ? 'fatta' : j === i ? 'in-corso' : ''}>
                        {fase.label}
                        {j === i && v.fase_at ? (
                          <span className="muted"> · da {minutiDa(v.fase_at)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <p className="muted small">
                    Le due passate di whisper sono le fasi più lunghe: per un
                    dettato breve contano qualche minuto l&apos;una.
                  </p>
                </div>
              </details>
            </li>
          );
        })}
        {errori.map((v) => (
          <li key={v.id} className="prog-tr-errore">
            <span className="prog-tr-nome">{v.filename}</span>
            <span className="badge badge-danger">errore di trascrizione</span>
            <span className="muted small">
              Il Mac non è riuscito a lavorarlo: controlla il pannello locale (Errori → Riprova).
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
