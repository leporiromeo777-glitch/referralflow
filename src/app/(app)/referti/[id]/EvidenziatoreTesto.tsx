'use client';

import { useMemo, useState } from 'react';

// L'evidenziatore del referto: il testo è spezzato in frasi; quelle accese
// (evidenziate) entrano nel «Testo da confermare», quelle spente — le
// divagazioni segnalate dall'AI o quelle che spegni tu — restano visibili
// qui ma fuori dal referto. Un clic su una frase la accende/spegne e la
// casella qui sotto si riscrive di conseguenza. Le proposte della fase
// «senso» si applicano con un bottone, sempre a scelta della persona.

type FraseDaChiarire = { frase: string; proposta: string };
type FraseNonSupportata = { frase: string; motivo: string };

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
  frasiNonSupportate = [],
}: {
  testo: string;
  divagazioni: string[];
  frasiDaChiarire: FraseDaChiarire[];
  frasiNonSupportate?: FraseNonSupportata[];
}) {
  const frasi = useMemo(() => spezzaInFrasi(testo), [testo]);
  const spenteIniziali = useMemo(() => {
    const divNorm = divagazioni.map(normalizza).filter((d) => d.length >= 8);
    const spente = new Set<number>();
    frasi.forEach((f, i) => {
      // Regola d'oro anche qui: una frase che contiene cifre porta quasi
      // sempre un dato clinico — non parte mai spenta, decide la persona.
      if (/\d/.test(f)) return;
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
  const nonSupportate = useMemo(
    () => frasiNonSupportate.map((v) => ({ n: normalizza(v.frase), motivo: v.motivo })),
    [frasiNonSupportate]
  );

  return (
    <>
      {(frasi.length > 1 || divagazioni.length > 0) && (
        <div className="evid-box">
          <p className="muted">
            Le frasi <span style={{ textDecoration: 'line-through' }}>barrate in grigio</span> NON
            entrano nel referto ({spenteIniziali.size > 0 ? `l'AI ne ha spente ${spenteIniziali.size} come fuori tema` : 'per ora nessuna'});
            un clic su una frase la spegne o la riaccende. I numerini rimandano agli elenchi
            qui sotto: <span className="ns-num">rossi</span> = da verificare col dettato,{' '}
            <span className="dc-num">arancioni</span> = da chiarire.
          </p>
          <div className="evid-testo">
            {frasi.map((f, i) => {
              const fn = normalizza(f);
              const kChiarire = daChiarireNorm.findIndex(
                (n) => n.length >= 8 && (fn.includes(n) || n.includes(fn))
              );
              const chiarire = kChiarire >= 0;
              const kSospetta = nonSupportate.findIndex(
                (v) => v.n.length >= 8 && (fn.includes(v.n) || v.n.includes(fn))
              );
              const sospetta = kSospetta >= 0 ? nonSupportate[kSospetta] : null;
              return (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  className={`evid-frase${spente.has(i) ? ' spenta' : ''}${chiarire ? ' da-chiarire' : ''}${sospetta ? ' non-supportata' : ''}`}
                  title={sospetta ? `Avvocato del diavolo [${kSospetta + 1}]: ${sospetta.motivo || 'non trovata nel dettato'}` : undefined}
                  onClick={() => commuta(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commuta(i); } }}
                >
                  {f}
                  {sospetta ? <sup className="ns-num">{kSospetta + 1}</sup> : null}
                  {chiarire ? <sup className="dc-num">{`C${kChiarire + 1}`}</sup> : null}{' '}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {frasiDaChiarire.length > 0 && (
        <div className="evid-box evid-senso">
          <p className="muted">
            <strong>Frasi da chiarire</strong> (ondina arancione e numerino C1, C2… qui
            sopra): per l&apos;AI non hanno senso in italiano corretto. Dove c&apos;è una
            proposta dal glossario dello studio, puoi applicarla — oppure correggi a
            mano nella casella.
          </p>
          <ul className="dc-lista">
            {frasiDaChiarire.map((v, i) => (
              <li key={i}>
                <span className="dc-num-eti">C{i + 1}</span>{' '}
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
