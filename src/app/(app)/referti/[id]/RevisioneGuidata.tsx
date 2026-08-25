'use client';

import { useMemo, useState } from 'react';

// Revisione guidata della bozza (2026-08-25, su richiesta dell'utente: la
// pagina «tutto insieme» era diventata incasinata): un passo alla volta,
// ogni schermata mostra solo un tipo di lavoro. Il testo di lavoro è uno
// solo (le frasi), condiviso da tutti i passi; la casella finale (passo di
// rilettura) è quella che viene confermata. Gli input dei campi estratti
// restano montati in ogni passo (nascosti via CSS) così la conferma invia
// sempre tutto.

type FraseDaChiarire = { frase: string; proposta: string };
type FraseNonSupportata = { frase: string; motivo: string };

function spezzaInFrasi(testo: string): string[] {
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

export function RevisioneGuidata({
  testo,
  divagazioni,
  frasiDaChiarire,
  frasiNonSupportate,
  note,
  campi,
  valoriNumerici,
}: {
  testo: string;
  divagazioni: string[];
  frasiDaChiarire: FraseDaChiarire[];
  frasiNonSupportate: FraseNonSupportata[];
  note: string[];
  campi: Record<string, string>;
  valoriNumerici: Record<string, unknown> | null;
}) {
  const frasiIniziali = useMemo(() => spezzaInFrasi(testo), [testo]);
  const [frasi, setFrasi] = useState<string[]>(frasiIniziali);

  const spenteIniziali = useMemo(() => {
    const divNorm = divagazioni.map(normalizza).filter((d) => d.length >= 8);
    const s = new Set<number>();
    frasiIniziali.forEach((f, i) => {
      if (/\d/.test(f)) return; // regola d'oro: le frasi con cifre mai spente
      const n = normalizza(f);
      if (n.length >= 8 && divNorm.some((d) => d.includes(n) || n.includes(d))) s.add(i);
    });
    return s;
  }, [frasiIniziali, divagazioni]);
  const [spente, setSpente] = useState<Set<number>>(spenteIniziali);

  // Abbinamento segnalazioni → indice frase (sulla frase INIZIALE: le
  // modifiche non spostano gli indici).
  const trovaIndice = (citazione: string) => {
    const c = normalizza(citazione);
    if (c.length < 8) return -1;
    return frasiIniziali.findIndex((f) => {
      const n = normalizza(f);
      return n.includes(c) || c.includes(n);
    });
  };
  const rosse = useMemo(
    () => frasiNonSupportate.map((v, k) => ({ ...v, k, idx: trovaIndice(v.frase) })),
    [frasiNonSupportate] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const arancioni = useMemo(
    () => frasiDaChiarire.map((v, k) => ({ ...v, k, idx: trovaIndice(v.frase) })),
    [frasiDaChiarire] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [fatte, setFatte] = useState<Set<string>>(new Set());
  const segna = (id: string) => setFatte((prev) => new Set(prev).add(id));

  const [inModifica, setInModifica] = useState<number | null>(null);
  const [bozzaModifica, setBozzaModifica] = useState('');

  const componi = (fr: string[], esc: Set<number>) =>
    fr.filter((_, i) => !esc.has(i)).join('\n');
  const [testoLibero, setTestoLibero] = useState<string | null>(null);
  const testoAttuale = testoLibero ?? componi(frasi, spente);

  function salvaModifica(i: number) {
    setFrasi((prev) => prev.map((f, j) => (j === i ? bozzaModifica : f)));
    setInModifica(null);
  }
  function riaccendi(i: number) {
    setSpente((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }
  function inserisciNota(nota: string, id: string) {
    if (testoLibero !== null) setTestoLibero(testoLibero + '\n' + nota);
    else setFrasi((prev) => [...prev, nota]);
    segna(id);
  }

  // Passi presenti solo se hanno contenuto (i campi e la rilettura sempre).
  const passi: { chiave: string; titolo: string; conta?: number }[] = [];
  if (rosse.length > 0)
    passi.push({ chiave: 'rosse', titolo: 'Frasi da verificare col dettato', conta: rosse.length });
  if (arancioni.length > 0)
    passi.push({ chiave: 'arancioni', titolo: 'Frasi da chiarire', conta: arancioni.length });
  if (spenteIniziali.size > 0)
    passi.push({ chiave: 'spente', titolo: 'Frasi spente dall’AI', conta: spenteIniziali.size });
  if (note.length > 0)
    passi.push({ chiave: 'note', titolo: 'Note per la segreteria', conta: note.length });
  if (Object.keys(campi).filter((k) => typeof campi[k] === 'string').length > 0)
    passi.push({ chiave: 'campi', titolo: 'Campi estratti' });
  passi.push({ chiave: 'fine', titolo: 'Rileggi e conferma' });

  const [passo, setPasso] = useState(0);
  const attivo = passi[passo].chiave;
  const ultimo = passo === passi.length - 1;

  const cardFrase = (idx: number) =>
    idx >= 0 ? (
      inModifica === idx ? (
        <div className="rg-modifica">
          <textarea
            rows={3}
            value={bozzaModifica}
            onChange={(e) => setBozzaModifica(e.target.value)}
            style={{ width: '100%' }}
          />
          <div className="rg-azioni">
            <button type="button" className="btn btn-primary" onClick={() => salvaModifica(idx)}>
              Salva la frase
            </button>
            <button type="button" className="btn" onClick={() => setInModifica(null)}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <p className="rg-frase">{frasi[idx]}</p>
      )
    ) : (
      <p className="muted small">
        (La frase non si aggancia più al testo — probabilmente l&apos;hai già modificata:
        controllala nella rilettura finale.)
      </p>
    );

  return (
    <div className="rg">
      <div className="rg-testata">
        <div className="rg-passi">
          {passi.map((p, i) => (
            <button
              key={p.chiave}
              type="button"
              className={`rg-tab${i === passo ? ' attivo' : ''}${i < passo ? ' fatto' : ''}`}
              onClick={() => setPasso(i)}
            >
              <span className="rg-tab-num">{i + 1}</span> {p.titolo}
              {typeof p.conta === 'number' ? ` (${p.conta})` : ''}
            </button>
          ))}
        </div>
        <p className="muted small">
          Passo {passo + 1} di {passi.length} — sistemi una cosa alla volta; alla fine
          rileggi tutto e confermi. Niente si salva finché non confermi.
        </p>
      </div>

      {attivo === 'rosse' && (
        <div className="rg-corpo">
          <p className="muted">
            L&apos;avvocato del diavolo non trova queste frasi nel dettato: riascolta il
            punto (player qui sopra) e correggi, oppure conferma che va bene così.
          </p>
          {rosse.map((v) => (
            <div key={v.k} className={`rg-item rg-rossa${fatte.has(`r${v.k}`) ? ' rg-fatta' : ''}`}>
              {cardFrase(v.idx)}
              <p className="rg-motivo">→ {v.motivo || 'non trovata nel dettato'}</p>
              {!fatte.has(`r${v.k}`) && (
                <div className="rg-azioni">
                  {v.idx >= 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setInModifica(v.idx);
                        setBozzaModifica(frasi[v.idx]);
                      }}
                    >
                      ✏️ Correggi la frase
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`r${v.k}`)}>
                    ✓ Va bene così
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {attivo === 'arancioni' && (
        <div className="rg-corpo">
          <p className="muted">
            Per l&apos;AI queste frasi non hanno senso in italiano corretto. Dove c&apos;è
            una proposta dal glossario, applicala con un clic; altrimenti correggi o
            lascia com&apos;è.
          </p>
          {arancioni.map((v) => (
            <div key={v.k} className={`rg-item rg-arancione${fatte.has(`c${v.k}`) ? ' rg-fatta' : ''}`}>
              {cardFrase(v.idx)}
              {v.proposta && !fatte.has(`c${v.k}`) && (
                <p className="rg-motivo">Proposta: <strong>{v.proposta}</strong></p>
              )}
              {!fatte.has(`c${v.k}`) && (
                <div className="rg-azioni">
                  {v.proposta && v.idx >= 0 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setFrasi((prev) => prev.map((f, j) => (j === v.idx ? v.proposta : f)));
                        segna(`c${v.k}`);
                      }}
                    >
                      Applica la proposta
                    </button>
                  )}
                  {v.idx >= 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setInModifica(v.idx);
                        setBozzaModifica(frasi[v.idx]);
                      }}
                    >
                      ✏️ Correggi
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`c${v.k}`)}>
                    ✓ Va bene così
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {attivo === 'spente' && (
        <div className="rg-corpo">
          <p className="muted">
            L&apos;AI ha spento queste frasi come fuori tema: NON entreranno nel referto.
            Se una in realtà serve, riaccendila.
          </p>
          {[...spenteIniziali].map((i) => (
            <div key={i} className={`rg-item${spente.has(i) ? '' : ' rg-fatta'}`}>
              <p className={`rg-frase${spente.has(i) ? ' rg-spenta' : ''}`}>{frasi[i]}</p>
              <div className="rg-azioni">
                <button type="button" className="btn" onClick={() => riaccendi(i)}>
                  {spente.has(i) ? '💡 Riaccendi (entra nel referto)' : 'Rispegni'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {attivo === 'note' && (
        <div className="rg-corpo">
          <p className="muted">
            Frasi che il medico ha rivolto a voi: restano qui come promemoria. Se una
            in realtà è parte del referto, inseriscila nel testo.
          </p>
          {note.map((n, i) => (
            <div key={i} className={`rg-item${fatte.has(`n${i}`) ? ' rg-fatta' : ''}`}>
              <p className="rg-frase">«{n}»</p>
              {!fatte.has(`n${i}`) && (
                <div className="rg-azioni">
                  <button type="button" className="btn" onClick={() => inserisciNota(n, `n${i}`)}>
                    ↩︎ Inserisci nel testo
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => segna(`n${i}`)}>
                    ✓ È solo per noi
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* I campi restano montati sempre (il form li invia alla conferma);
          visibili solo nel loro passo. */}
      <div className="rg-corpo" style={{ display: attivo === 'campi' ? undefined : 'none' }}>
        <p className="muted">
          Estratti automaticamente, mai dedotti («non indicato» = nel dettato non
          c&apos;era). Correggi qui prima di confermare.
        </p>
        <div className="grid2">
          {Object.entries(campi)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => (
              <label key={k}>
                {k.replaceAll('_', ' ')}
                <input name={`campo__${k}`} maxLength={2000} defaultValue={String(v)} />
              </label>
            ))}
        </div>
        {valoriNumerici && Object.keys(valoriNumerici).length > 0 && (
          <>
            <h3>Valori numerici rilevati</h3>
            <ul>
              {Object.entries(valoriNumerici).map(([k, v]) => (
                <li key={k}>
                  <strong>{k.replaceAll('_', ' ')}</strong>:{' '}
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* La casella del testo resta montata sempre: è ciò che viene confermato. */}
      <div className="rg-corpo" style={{ display: attivo === 'fine' ? undefined : 'none' }}>
        <p className="muted">
          Il referto come uscirà, con tutte le correzioni dei passi precedenti.
          Ultima rilettura: puoi ancora ritoccare a mano qui.
        </p>
        <textarea
          name="testo"
          rows={18}
          required
          value={testoAttuale}
          onChange={(e) => setTestoLibero(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        {testoLibero !== null && (
          <p className="muted small">
            Hai ritoccato a mano: da qui in poi i passi precedenti non riscrivono più
            la casella.
          </p>
        )}
      </div>

      <div className="rg-nav">
        <button type="button" className="btn" disabled={passo === 0} onClick={() => setPasso(passo - 1)}>
          ← Indietro
        </button>
        {!ultimo ? (
          <button type="button" className="btn btn-primary" onClick={() => setPasso(passo + 1)}>
            Avanti →
          </button>
        ) : (
          <span className="muted small">Qui sotto: conferma o riorganizza.</span>
        )}
      </div>
    </div>
  );
}
