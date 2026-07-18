// Striscia di fiducia: mostra a colpo d'occhio le garanzie che contano in
// ambito medico. È solo presentazione di ciò che la piattaforma già fa
// (hosting CH, nLPD, registro accessi, backup) — alza la serietà percepita.
export function TrustStrip() {
  const badge = [
    ['🇨🇭', 'Dati in Svizzera'],
    ['🔒', 'Conforme nLPD'],
    ['📋', 'Accessi tracciati'],
    ['💾', 'Backup cifrati'],
  ];
  return (
    <ul className="trust-strip" aria-label="Garanzie di sicurezza e conformità">
      {badge.map(([icona, testo]) => (
        <li key={testo}><span aria-hidden="true">{icona}</span> {testo}</li>
      ))}
    </ul>
  );
}
