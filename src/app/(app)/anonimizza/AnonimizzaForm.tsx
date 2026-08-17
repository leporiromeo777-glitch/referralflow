'use client';

import { useRef, useState, useTransition } from 'react';
import { anonimizzaDocumento, type RispostaAnonimizza } from './actions';

// Tutta l'interattività della pagina: incolla/carica → anonimizza → rivedi e
// copia. I .txt vengono letti direttamente nel browser (il file non viaggia
// nemmeno verso il server); PDF e Word vanno al server locale per l'estrazione del
// testo, in memoria e senza salvataggi.

export function AnonimizzaForm() {
  const [testo, setTesto] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [risposta, setRisposta] = useState<RispostaAnonimizza | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [inCorso, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function scegliFile(f: File | undefined) {
    setRisposta(null);
    setCopiato(false);
    if (!f) { setDocFile(null); return; }
    if (/\.(pdf|docx|doc)$/i.test(f.name)) {
      setDocFile(f);
      setTesto('');
      return;
    }
    // File di testo: letto qui nel browser.
    setDocFile(null);
    const lettore = new FileReader();
    lettore.onload = () => setTesto(String(lettore.result ?? ''));
    lettore.readAsText(f);
  }

  function invia() {
    const dati = new FormData();
    dati.set('testo', testo);
    if (docFile) dati.set('file', docFile);
    setRisposta(null);
    setCopiato(false);
    startTransition(async () => {
      setRisposta(await anonimizzaDocumento(dati));
    });
  }

  function scarica() {
    if (!risposta?.ok) return;
    let blob: Blob;
    let nome: string;
    if (risposta.file) {
      // Word: il documento ORIGINALE coi soli dati sostituiti (logo,
      // intestazione e impaginazione intatti).
      const bytes = Uint8Array.from(atob(risposta.file.base64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: risposta.file.mime });
      nome = risposta.file.nome;
    } else {
      blob = new Blob([risposta.esito.testo], { type: 'text/plain;charset=utf-8' });
      // Nome neutro: mai quello del file originale (spesso contiene il paziente).
      nome = 'documento-anonimizzato.txt';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copia() {
    if (risposta?.ok) {
      await navigator.clipboard.writeText(risposta.esito.testo);
      setCopiato(true);
    }
  }

  const pronto = (testo.trim().length > 0 || docFile) && !inCorso;

  return (
    <div className="anon-wrap">
      <div className="card">
        <label className="anon-label" htmlFor="anon-testo">Testo da anonimizzare</label>
        <textarea
          id="anon-testo"
          rows={12}
          placeholder="Incolla qui il testo, oppure carica un file qui sotto…"
          value={docFile ? `File selezionato: ${docFile.name}` : testo}
          disabled={!!docFile}
          onChange={(e) => { setTesto(e.target.value); setRisposta(null); setCopiato(false); }}
        />
        <div className="anon-controls">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => scegliFile(e.target.files?.[0])}
          />
          {docFile && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setDocFile(null); if (fileRef.current) fileRef.current.value = ''; }}
            >
              Togli il file
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!pronto} onClick={invia}>
            {inCorso ? 'Anonimizzo… (può richiedere un minuto)' : 'Anonimizza'}
          </button>
        </div>
      </div>

      {risposta && !risposta.ok && <p className="error">{risposta.errore}</p>}

      {risposta?.ok && (
        <div className="card anon-result">
          <div className="anon-result-head">
            <h2>Risultato</h2>
            <div className="anon-result-btns">
              <button type="button" className="btn" onClick={copia}>
                {copiato ? 'Copiato ✓' : 'Copia il testo'}
              </button>
              <button type="button" className="btn btn-primary" onClick={scarica}>
                Scarica il file
              </button>
            </div>
          </div>
          <p className="anon-avviso">
            Rileggi prima di condividere: l&apos;AI può lasciarsi sfuggire un dato.
            Sostituzioni fatte: {risposta.esito.sostituzioni.length} (modello locale {risposta.esito.modello}).
            {risposta.file && (
              <> «Scarica il file» dà il documento Word originale coi soli dati sostituiti
              (logo e impaginazione intatti); le correzioni fatte qui sotto valgono solo per «Copia il testo».</>
            )}
          </p>
          <textarea
            rows={12}
            value={risposta.esito.testo}
            onChange={(e) =>
              setRisposta({ ok: true, esito: { ...risposta.esito, testo: e.target.value } })
            }
          />
          {risposta.esito.sostituzioni.length > 0 && (
            <details className="anon-dettagli">
              <summary>Cosa è stato sostituito</summary>
              <ul>
                {risposta.esito.sostituzioni.map((s, i) => (
                  <li key={i}>
                    <span className="anon-orig">{s.originale}</span> → <strong>{s.segnaposto}</strong>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
