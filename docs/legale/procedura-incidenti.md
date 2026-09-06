# Procedura per incidenti e violazioni dei dati (Ricerca 17 §17.8)

Bozza del 6.9.2026, da validare col legale. Vale per: perdita o esposizione di audio, fuga di dati identificativi verso il cloud, compromissione delle chiavi (`~/.referralflow-esterno.conf`, token referti), instradamento verso un fornitore sbagliato, backup esposti, accessi non autorizzati al Mac o all'app.

1. **Rilevazione**: chi si accorge scrive subito al titolare e al referente tecnico. Il servizio segnala nel log `esito=rifiutato motivo=fornitore_non_autorizzato` e `dato_sopravvissuto`: sono segnali da controllare.
2. **Contenimento** (entro un'ora): revocare il token referti dall'app (impostazioni studio), rigenerare le chiavi del fornitore, spegnere il percorso esterno (`attivo=0` nella config: la catena continua in locale), isolare il Mac dalla rete se compromesso.
3. **Perimetro**: quali dati, quante persone, da quando; i registri (`referti_eventi`, `servizio.log`, `document_access_log`) danno le tracce senza contenuti.
4. **Valutazione del rischio**: rischio elevato per gli interessati? (dati sanitari fuori controllo = di regola sì).
5. **Notifica**: IFPDT «il più presto possibile» (art. 24 LPD) se il rischio è elevato; interessati se necessario alla loro protezione. Decisione col legale, documentata.
6. **Analisi a posteriori**: cause, correzioni, aggiornamento della DSFA e di questa procedura.

Contatti da compilare: titolare, legale, IFPDT, fornitore cloud.
