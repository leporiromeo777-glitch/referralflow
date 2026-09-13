---
tipo: piattaforma
aggiornata: 2026-09-13
---
# Organizzazione dello studio (grafo organizzativo)

Questa pagina è **letta dalla piattaforma** (`src/lib/organizzazione.ts`, cache di 5 minuti): le tabelle qui sotto sono il grafo organizzativo che il bot e le procedure usano per rispondere a «chi si occupa di…», «quando si fa…», «con quale procedura». Si cambia la pagina, non il codice. Regole: **solo ruoli, mai nomi di persone**; niente dati clinici; le colonne restano queste (il parser le legge per posizione); la colonna «procedura» porta il nome del registro (`src/lib/procedure-registro.ts`) o «—».

## Ruoli

| ruolo | descrizione |
|---|---|
| Segreteria | Riceve le referral, prenota, prepara la giornata, rivede le bozze dei referti, produce e spedisce le lettere, gestisce i richiami |
| Medico | Visita, detta i referti, conferma e firma le lettere, decide i richiami |
| Amministrazione | Utenti e permessi, dizionario confermato, numeri del mese, qualità dell'AI |

## Responsabilità

| ruolo | cosa | quando | procedura | note |
|---|---|---|---|---|
| Segreteria | Preparare la giornata: briefing di ogni paziente in agenda, mancanze in cima | ogni mattina prima delle visite | `preparazione_giornata` | le mancanze (ECG, eco, lettera precedente) si chiedono al paziente all'accoglienza |
| Segreteria | Briefing del singolo paziente quando arriva fuori agenda | al bisogno | `briefing_previsita` | — |
| Segreteria | Rivedere le bozze dei referti nella revisione guidata e chiudere le segnalazioni | entro il giorno dopo il dettato | `controllo_prefirma` | il controllo prima della firma dice se è pronto; la conferma resta nella piattaforma |
| Medico | Confermare e firmare i referti | entro 2 giorni dal dettato | `controllo_prefirma` | con presa d'atto se la catena ha verificato solo in parte |
| Segreteria | Produrre il Word e spedire le lettere | entro 3 giorni dalla conferma | `lettere_ritardo` | il lunedì si controllano le lettere in ritardo |
| Segreteria | Richiami: chiamare i pazienti in scadenza, segnare i fatti | ogni lunedì per la settimana, ogni inizio mese per il mese | `richiami_mese` | — |
| Medico | Decidere il richiamo alla chiusura della visita | alla visita | — | mesi di follow-up nella referral o nell'agenda |
| Medico | Vedere cosa è cambiato dall'ultima visita | prima della visita di controllo | `cambiamenti_ultima_visita` | — |
| Amministrazione | Chiusura mensile: numeri e punti aperti | primo giorno lavorativo del mese | `chiusura_mensile` | — |
| Amministrazione | Confermare a mano le voci di dizionario proposte, leggere le tracce | ogni settimana | — | cruscotto Qualità AI; le domande libere nelle tracce diventano procedure |

## Servizi e dati

| servizio | ruolo responsabile | dati | note |
|---|---|---|---|
| Agenda (robot MediOnline, sola lettura) | Segreteria | appuntamenti, nome del paziente, medico, motivo | il robot legge, non scrive |
| Cartella del paziente | Segreteria | documenti (ECG, eco, Holter, lettere…), referral, questionario | ogni apertura è nel registro accessi |
| Catena dei referti | Medico | audio del dittafono, bozze, fatti, fiducia | audio cancellato dopo la consegna |
| Lettere e Word | Segreteria | testo confermato, carta intestata del medico, allegati | lo scarico registra `word_scaricato` |
| Assistente e procedure | Amministrazione | tracce, grafo dei fatti | modello locale, nessun cloud |
