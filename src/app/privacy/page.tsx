export const dynamic = 'force-dynamic';

// Informativa sul trattamento dei dati (art. 19 e segg. nLPD).
// Pagina pubblica, raggiungibile da tutti i moduli e le pagine per pazienti
// e medici invianti. Bozza tecnica: da far validare da un legale prima
// della commercializzazione a studi terzi.

export default function Privacy() {
  const email = process.env.SUPPORT_EMAIL;
  const phone = process.env.SUPPORT_PHONE;
  return (
    <main className="public wide privacy">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">Informativa sul trattamento dei dati personali</p>

      <div className="card">
        <p className="tmeta">Ultimo aggiornamento: 16 luglio 2026 · ai sensi della Legge federale
          sulla protezione dei dati (nLPD)</p>

        <h2>1. Chi tratta i suoi dati</h2>
        <p>
          ReferralFlow è una piattaforma che aiuta gli studi medici svizzeri a gestire
          le richieste di visita (referral) inviate da altri medici. Il <strong>titolare
          del trattamento</strong> dei dati sanitari è lo <strong>studio medico
          destinatario</strong> della richiesta: è lo studio che decide come e perché i
          dati vengono trattati, nell'ambito della presa in carico del paziente.
          ReferralFlow agisce quale <strong>responsabile del trattamento</strong> per
          conto dello studio: fornisce e gestisce l'infrastruttura tecnica.
        </p>

        <h2>2. Quali dati e perché</h2>
        <p>
          Tramite la piattaforma vengono trattati: dati identificativi del paziente
          (cognome, nome, data di nascita, recapito telefonico), dati sanitari necessari
          alla presa in carico (motivo dell'invio, urgenza, eventuali documenti allegati
          come ECG o lettere), e i dati di contatto del medico inviante. Le finalità sono
          esclusivamente legate alla cura: presa in carico della richiesta, prenotazione
          e promemoria dell'appuntamento, comunicazione tra i professionisti coinvolti,
          organizzazione dei controlli successivi.
        </p>

        <h2>3. Base del trattamento</h2>
        <p>
          Il trattamento avviene nel contesto della presa in carico sanitaria, da parte di
          professionisti della salute soggetti al segreto professionale (art. 321 CP), su
          richiesta del medico curante e nell'interesse della continuità delle cure.
        </p>

        <h2>4. Dove sono conservati i dati</h2>
        <p>
          Tutti i dati — applicazione, banca dati, documenti allegati e copie di
          sicurezza — sono conservati su server situati <strong>in Svizzera</strong>.
          Non avviene alcun trasferimento di dati all'estero.
        </p>

        <h2>5. Sicurezza</h2>
        <p>
          Le comunicazioni sono cifrate (TLS). Ogni studio accede esclusivamente ai
          propri dati. Le pagine riservate per medici invianti e pazienti sono protette
          da collegamenti individuali a scadenza automatica. Le email e gli SMS di
          notifica <strong>non contengono mai dati clinici</strong>: solo avvisi neutri
          con l'invito a consultare le pagine riservate. Copie di sicurezza cifrate
          vengono eseguite quotidianamente, anche in un secondo data center svizzero.
        </p>

        <h2>6. A chi vengono comunicati i dati</h2>
        <p>
          I dati sono visibili al personale dello studio destinatario e al medico
          inviante (limitatamente ai propri pazienti). Se lo studio affida un paziente a
          un altro studio, i dati necessari vengono resi accessibili a quest'ultimo
          tramite collegamento riservato, sempre nell'ambito della cura. Non avviene
          alcuna comunicazione a terzi per fini commerciali, né alcuna vendita di dati.
        </p>

        <h2>7. Conservazione</h2>
        <p>
          I dati sono conservati per la durata della presa in carico e successivamente
          secondo gli obblighi di conservazione della documentazione sanitaria previsti
          dal diritto svizzero e cantonale applicabile allo studio titolare.
        </p>

        <h2>8. I suoi diritti</h2>
        <p>
          Lei può chiedere in ogni momento l'accesso ai suoi dati, la loro rettifica o —
          nei limiti degli obblighi legali di conservazione — la loro cancellazione.
          Per esercitare questi diritti si rivolga allo studio medico che la segue
          (titolare del trattamento). Per questioni tecniche relative alla piattaforma
          può contattare ReferralFlow{email ? <>: <a href={`mailto:${email}`}>{email}</a></> : null}
          {phone ? <> · <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a></> : null}.
          Ha inoltre il diritto di rivolgersi all'Incaricato federale della protezione
          dei dati e della trasparenza (IFPDT).
        </p>
      </div>

      <p className="muted small center">
        <a href="/">ReferralFlow</a> — piattaforma svizzera per le referral tra studi medici
      </p>
    </main>
  );
}
