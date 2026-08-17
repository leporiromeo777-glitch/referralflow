'use client';

import { useMemo, useState } from 'react';

// L'evidenziatore del referto: il testo è spezzato in frasi; quelle accese
// (evidenziate) entrano nel «Testo da confermare», quelle spente — le
// divagazioni segnalate dall'AI o quelle che spegni tu — restano visibili
// qui ma fuori dal referto. Un clic su una frase la accende/spegne e la
// casella qui sotto si riscrive di conseguenza. Le proposte della fase
// «senso» si applicano con un bottone, sempre a scelta della persona.

type FraseDaChiarire = { frase: string; proposta: string };

function spezzaInFrasi(testo: string): string[] {
  // Confini: fine frase o riga nuova, tenendo i separatori attaccati alla
  // frase che chiudono (stessa logica della pipeline).
  const pezzi: string[] = [];
  let corrente = '';
  for (const riga of testo.replace(/\r\n/g, '\n').split('\n')) {
    const frasi = riga.split(/(?<=[.!?;])\s+/);
    for (const f of frasi) {
      corrente = corrente ? `${corrente} ${f}` : f;
      if (/[.!?;]["»)]?$/.test(f.trim())) {
        pezzi.push(corrente);
        corrente = '';
      }
    }
    if (corrente) {
      pezzi.push(corrente);
      corrente = '';
    }
  }
  return pezzi.filter((p) => p.trim());
}

function normalizza(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
}

export function EvidenziatoreTesto({
  testo,
  divagazioni,
  frasiDaChiarire,
}: {
  testo: string;
  divagazioni: string[];
  frasiDaChiarire: FraseDaChiarire[];
}) {
  const frasi = useMemo(() => spezzaInFrasi(testo), [testo]);
  const spenteIniziali = useMemo(() => {
    const divNorm = divagazioni.map(normalizza).filter((d) => d.length >= 8);
    const spente = new Set<number>();
    frasi.forEach((f, i) => {
      const n = normalizza(f);
      if (n.length >= 8 && divNorm.some((d) => d.includes(n) || n.includes(d))) spente.add(i);
    });
    return spente;
  }, [frasi, divagazioni]);

  const [spente, setSpente] = useState<Set<number>>(spenteIniziali);
  const componi = (esc: Set<number>) => frasi.filter((_, i) => !esc.has(i)).join('\n');
  const [valore, setValore] = useState<string>(() => componi(spenteIniziali));

  function commuta(i: number) {
    const nuovo = new Set(spente);
    if (nuovo.has(i)) nuovo.delete(i);
    else nuovo.add(i);
    setSpente(nuovo);
    setValore(componi(nuovo));
  }

  function applicaProposta(frase: string, proposta: string) {
    if (!proposta) return;
    setValore((v) => (v.includes(frase) ? v.replace(frase, proposta) : v));
  }

  const daChiarireNorm = useMemo(
    () => frasiDaChiarire.map((v) => normalizza(v.frase)),
    [frasiDaChiarire]
  );

  return (
    <>
      {(frasi.length > 1 || divagazioni.length > 0) && (
        <div className="evid-box">
          <p className="muted">
            <strong>Evidenziatore</strong>: entra nel referto solo ciò che è evidenziato.
            L&apos;AI ha spento {spenteIniziali.size > 0 ? `${spenteIniziali.size} frasi fuori tema` : 'niente'};
            un clic su una frase la accende o la spegne, e la casella qui sotto si aggiorna.
          </p>
          <div className="evid-testo">
            {frasi.map((f, i) => {
              const chiarire = daChiarireNorm.some((n) => {
                const fn = normalizza(f);
                return n.length >= 8 && (fn.includes(n) || n.includes(fn));
              });
              return (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  className={`evid-frase${spente.has(i) ? ' spenta' : ''}${chiarire ? ' da-chiarire' : ''}`}
                  onClick={() => commuta(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commuta(i); } }}
                >
                  {f}{' '}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {frasiDaChiarire.length > 0 && (
        <div className="evid-box evid-senso">
          <p className="muted">
            <strong>Frasi da chiarire</strong> (sottolineate qui sopra): per l&apos;AI non hanno
            senso in italiano corretto. Dove c&apos;è una proposta dal glossario dello studio,
            puoi applicarla — oppure correggi a mano nella casella.
          </p>
          <ul>
            {frasiDaChiarire.map((v, i) => (
              <li key={i}>
                <span className="evid-orig">{v.frase}</span>
                {v.proposta ? (
                  <>
                    {' '}→ <strong>{v.proposta}</strong>{' '}
                    <button type="button" className="btn btn-ghost evid-applica"
                      onClick={() => applicaProposta(v.frase, v.proposta)}>
                      Applica
                    </button>
                  </>
                ) : (
                  <span className="muted"> (nessuna proposta: da riascoltare)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <textarea
        name="testo"
        rows={16}
        required
        value={valore}
        onChange={(e) => setValore(e.target.value)}
        style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.5 }}
      />
      <p className="muted small">
        I ritocchi fatti a mano qui sopra restano finché non cambi la selezione
        dell&apos;evidenziatore (che riscrive la casella dalle frasi accese).
      </p>
    </>
  );
}
