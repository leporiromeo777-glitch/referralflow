'use client';

import { useState } from 'react';

// Widget di cattura AI: carica una foto o un PDF dell'impegnativa, chiede al
// server di estrarre i campi e li scrive nel modulo (che l'inviante rivede).
// I valori non passano mai da URL: la risposta JSON torna a questo stesso
// browser e riempie i campi del form vicino.
type Campi = {
  cognome?: string; nome?: string; data_nascita?: string;
  telefono?: string; quesito?: string; urgenza?: string;
};

function setField(name: string, value: string | undefined) {
  if (!value) return;
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[name="${name}"]`
  );
  if (el) el.value = value;
}

export function CatturaImpegnativa({ token }: { token: string }) {
  const [stato, setStato] = useState<'idle' | 'invio' | 'ok' | 'errore'>('idle');
  const [messaggio, setMessaggio] = useState('');

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStato('invio');
    setMessaggio('Sto leggendo l’impegnativa…');

    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/invia/${token}/cattura`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setStato('errore');
        setMessaggio(data.errore || 'Lettura non riuscita: compili i campi a mano.');
        return;
      }

      const c: Campi = data.campi;
      setField('cognome', c.cognome);
      setField('nome', c.nome);
      setField('data_nascita', c.data_nascita);
      setField('telefono', c.telefono);
      setField('quesito', c.quesito);
      setField('urgenza', c.urgenza);
      setStato('ok');
      setMessaggio('Campi compilati dall’AI: controlli e corregga prima di inviare.');
    } catch {
      setStato('errore');
      setMessaggio('Lettura non riuscita: compili i campi a mano.');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="cattura">
      <div className="cattura-head">
        <strong>Compila dall’impegnativa</strong>
        <span className="muted small">foto o PDF · l’AI riempie i campi, lei controlla</span>
      </div>
      <label className={`btn btn-ghost btn-small cattura-btn${stato === 'invio' ? ' is-busy' : ''}`}>
        {stato === 'invio' ? 'Lettura in corso…' : '📄 Carica e leggi con l’AI'}
        <input
          type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={onChange}
          disabled={stato === 'invio'} style={{ display: 'none' }}
        />
      </label>
      {messaggio && (
        <p className={stato === 'errore' ? 'error' : stato === 'ok' ? 'success' : 'muted small'}>
          {messaggio}
        </p>
      )}
    </div>
  );
}
