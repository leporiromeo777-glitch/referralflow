import { TERMS_VERSION } from '@/lib/terms';

// Pagina pubblica «Condizioni di servizio». Per ora è una BOZZA segnaposto:
// il testo definitivo lo fornirà il legale e sostituirà questo contenuto.
// Quando cambia, alzare TERMS_VERSION in src/lib/terms.ts.
export default function Termini() {
  return (
    <main className="public legal">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <div className="card">
        <p className="legal-draft">
          ⚠️ Bozza provvisoria — testo in attesa di validazione legale.
          Versione&nbsp;<code>{TERMS_VERSION}</code>.
        </p>
        <h1>Condizioni di servizio</h1>
        <p className="muted">
          Questo documento regolerà l&rsquo;uso di ReferralFlow da parte dello studio
          cliente. Il testo definitivo sarà inserito qui dopo la validazione di un
          legale. Le sezioni previste:
        </p>
        <ul className="muted">
          <li>Oggetto del servizio e ruolo delle parti.</li>
          <li>Natura dello strumento: ReferralFlow è un supporto organizzativo,
            non un dispositivo medico e non sostituisce il giudizio clinico.</li>
          <li>Abbonamento, prezzi, durata e disdetta.</li>
          <li>Obblighi dello studio (uso corretto, accessi, dati inseriti).</li>
          <li>Limitazione di responsabilità e garanzie.</li>
          <li>Protezione dei dati (rimando al contratto di trattamento dati).</li>
          <li>Legge applicabile e foro competente (Svizzera).</li>
        </ul>
        <p className="muted small">
          Vedi anche il <a href="/trattamento-dati">contratto di trattamento dati</a> e
          l&rsquo;<a href="/privacy">informativa privacy</a>.
        </p>
      </div>
      <p className="muted small center"><a href="/attiva">← Torna all&rsquo;attivazione</a></p>
    </main>
  );
}
