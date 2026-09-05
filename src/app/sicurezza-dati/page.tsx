export const dynamic = 'force-dynamic';

// Pagina pubblica «Come proteggiamo i dati» (2026-09-06): le quattro promesse
// della catena dei referti, dette in modo verificabile. Nasce dall'analisi
// dei concorrenti: nessuno di Abridge, Heidi, Nabla o DeepMed le promette
// tutte e quattro insieme. Testo tecnico: la parte legale (DSFA, contratto
// di trattamento, informativa) resta da validare col legale prima della
// vendita a studi terzi.

export default function SicurezzaDati() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <main className="public wide privacy">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">Come proteggiamo i dati nella dettatura dei referti</p>

      <div className="card">
        <p className="tmeta">Aggiornato il 6 settembre 2026 · descrizione tecnica del funzionamento</p>

        <h2>Quattro promesse, verificabili</h2>
        <ol>
          <li><strong>L&apos;audio e i nomi non lasciano lo studio.</strong> La voce del medico viene
            trascritta sul computer dello studio. Prima che un testo esca verso un servizio
            esterno, un programma sostituisce nomi, date di nascita, indirizzi e contatti con
            segnaposto numerati; la corrispondenza resta solo nella memoria del computer dello
            studio e non viene mai salvata né inviata.</li>
          <li><strong>Il servizio esterno è in Svizzera e vede solo testo anonimizzato.</strong> Le
            fasi che richiedono un modello linguistico grande usano un fornitore con server in
            Svizzera; nessun audio, nessun nome, nessun documento intero quando bastano poche
            frasi.</li>
          <li><strong>La lettera precedente resta identica al carattere.</strong> Quando il medico
            detta solo gli aggiornamenti, le parti non ridettate vengono ricopiate dal programma,
            non riscritte da un modello; ogni riga del nuovo referto dice da dove viene: dettata
            oggi, dalla lettera precedente, aggiornata coi valori nuovi.</li>
          <li><strong>Nessun numero cambia senza che qualcuno lo veda.</strong> Ogni valore, dose e
            data è confrontato tra due trascrizioni indipendenti e con un terzo controllo sulle
            sole cifre; ciò che non torna viene mostrato al medico con il punto esatto dell&apos;audio
            da riascoltare. Un modello linguistico non può modificare un numero: i numeri li tiene
            il programma.</li>
        </ol>

        <h2>Come funziona, in breve</h2>
        <p>
          Il medico detta. Due motori di riconoscimento vocale trascrivono in modo indipendente sul
          computer dello studio. Il programma confronta le due versioni, applica il dizionario dello
          studio e segnala ogni punto in cui i due motori non sono d&apos;accordo. Le correzioni proposte
          da un modello linguistico entrano una per una, dopo controlli fissi su numeri, unità di
          misura, negazioni e lateralità, e restano tutte visibili e annullabili. Il medico rivede
          la bozza in una schermata guidata che mette in cima ciò che può fare danno, e firma.
          Nessun referto esce senza la sua conferma.
        </p>

        <h2>Cosa il sistema non fa</h2>
        <ul>
          <li>Non formula diagnosi, non propone terapie, non calcola valori clinici.</li>
          <li>Non decide nulla da solo: ogni proposta è rivista da una persona.</li>
          <li>Non usa i dati dei pazienti per addestrare modelli, né propri né di terzi.</li>
        </ul>

        <h2>Tracciabilità</h2>
        <p>
          Per ogni referto restano registrate le versioni intermedie del testo e chi ha fatto ogni
          trasformazione (programma, modello, medico), così da poter ricostruire a posteriori
          come si è arrivati alla lettera firmata. I registri tecnici non contengono mai testo
          clinico né nomi.
        </p>

        <h2>Stato dei documenti</h2>
        <p>
          Descrizione della destinazione d&apos;uso delle funzioni assistite, valutazione d&apos;impatto
          sulla protezione dei dati e contratto di trattamento col fornitore svizzero sono in
          preparazione e verranno validati da un legale prima dell&apos;offerta ad altri studi.
        </p>
        {email && <p className="muted small">Domande: {email}</p>}
        <p className="muted small"><a href="/privacy">Informativa privacy</a> · <a href="/login">Accedi</a></p>
      </div>
    </main>
  );
}
