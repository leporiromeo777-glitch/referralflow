'use client';

import { useState } from 'react';

// Aiuti per l'attivazione da telefono: copia della chiave con un tocco e
// apertura diretta nell'app di autenticazione (link otpauth://). Il segreto
// e l'URI arrivano già pronti dal server: qui non si genera nulla.
export function SetupHelpers({ secret, uri }: { secret: string; uri: string }) {
  const [copiato, setCopiato] = useState(false);

  const copia = async () => {
    let fatto = false;
    try {
      await navigator.clipboard.writeText(secret);
      fatto = true;
    } catch {
      // Metodo di riserva dove l'API clipboard è bloccata (contesti non sicuri,
      // permessi negati): textarea temporanea + execCommand('copy').
      try {
        const ta = document.createElement('textarea');
        ta.value = secret;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        fatto = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        fatto = false;
      }
    }
    if (fatto) {
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1800);
    }
    // Se nemmeno il riserva funziona, la chiave resta visibile e selezionabile a mano.
  };

  return (
    <div className="setup-helpers">
      <button type="button" className={`btn btn-small${copiato ? ' copied' : ''}`} onClick={copia}>
        {copiato ? 'Chiave copiata ✓' : 'Copia la chiave'}
      </button>
      <a className="btn btn-small btn-primary" href={uri}>Apri nell&rsquo;app di autenticazione</a>
    </div>
  );
}
