'use client';

import { segnalaDisdetta } from './actions';

// «Devo disdire — chiama lo studio»: al tocco parte la telefonata (tel:) e in
// parallelo si registra la segnalazione di disdetta, che la segreteria dovrà
// confermare. Se il telefono non è configurato, mostra solo l'istruzione.

export function CallButton({ token, telefono }: { token: string; telefono: string | null }) {
  if (!telefono) {
    return (
      <p className="muted">
        Per disdire chiami la segreteria dello studio: registreremo la sua richiesta.
      </p>
    );
  }
  const tel = telefono.replace(/\s+/g, '');
  return (
    <a
      className="btn"
      href={`tel:${tel}`}
      onClick={() => {
        // Non blocca la telefonata: la registrazione avviene in parallelo.
        void segnalaDisdetta(token);
      }}
    >
      Devo disdire — chiama lo studio ({telefono})
    </a>
  );
}
