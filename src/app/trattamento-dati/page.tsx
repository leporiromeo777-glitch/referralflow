import { TERMS_VERSION } from '@/lib/terms';

// Pagina pubblica «Contratto di trattamento dati» (DPA). BOZZA segnaposto:
// il testo definitivo (modello FMH validato dal legale) sostituirà questo
// contenuto. Esiste già una bozza in docs/legale/ da far validare.
export default function TrattamentoDati() {
  return (
    <main className="public legal">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <div className="card">
        <p className="legal-draft">
          ⚠️ Bozza provvisoria — testo in attesa di validazione legale.
          Versione&nbsp;<code>{TERMS_VERSION}</code>.
        </p>
        <h1>Contratto di trattamento dati su incarico</h1>
        <p className="muted">
          Regola il trattamento dei dati dei pazienti che lo studio (titolare)
          affida a ReferralFlow (fornitore). Il testo definitivo, sul modello FMH
          e validato da un legale, sarà inserito qui. Le sezioni previste:
        </p>
        <ul className="muted">
          <li>Ruoli: lo studio è titolare del trattamento, ReferralFlow è fornitore
            che tratta i dati solo su istruzione dello studio.</li>
          <li>Categorie di dati e finalità (gestione delle referral e dei documenti).</li>
          <li>Ubicazione dei dati: hosting in Svizzera, conforme nLPD.</li>
          <li>Misure di sicurezza: cifratura at-rest, verifica in due passaggi,
            registro degli accessi, backup.</li>
          <li>Sub-fornitori (es. hosting) e loro obblighi.</li>
          <li>Gestione degli incidenti di sicurezza (data breach) e notifiche.</li>
          <li>Restituzione o cancellazione dei dati a fine rapporto.</li>
        </ul>
        <p className="muted small">
          Vedi anche le <a href="/termini">condizioni di servizio</a> e
          l&rsquo;<a href="/privacy">informativa privacy</a>.
        </p>
      </div>
      <p className="muted small center"><a href="/attiva">← Torna all&rsquo;attivazione</a></p>
    </main>
  );
}
