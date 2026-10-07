# Analisi dei rischi — Proposte di orario

Versione 1.0 · 7 ottobre 2026 · bozza. Scala: gravità (lieve, media, grave) × probabilità
(rara, possibile, frequente), valutate DOPO le misure.

| # | Che cosa può andare storto | Conseguenza | Misure nel software | Misure d'uso | Residuo |
|---|---|---|---|---|---|
| 1 | Uno spostamento verso sera abbassa troppo la pressione di notte | ipotensione notturna, cadute, ipoperfusione | nessuna proposta che nella stima porta un'ora sotto il valore basso o il calo oltre il 20%; il punteggio toglie punti alle ore basse | nuovo monitoraggio dopo lo spostamento; soglia «bassa» alzata dal medico nei pazienti fragili | media × rara |
| 2 | Diuretico proposto alla sera | nicturia, sonno disturbato, cadute | un diuretico non si propone dopo le 14 | — | lieve × rara |
| 3 | Numeri della tabella sbagliati (inizio, picco, durata) | finestra disegnata male, proposta infondata | una riga vale solo dopo la conferma di un medico; cambiare un numero toglie la conferma; controlli di coerenza | conferma sul testo ufficiale del prodotto, non a memoria | media × possibile |
| 4 | L'ipotesi «10/6 mmHg per tutti» è lontana dal paziente | stima ottimista o pessimista | l'ipotesi è scritta in ogni proposta; la proposta si chiama «stima» | la conferma è il monitoraggio successivo | media × possibile |
| 5 | Il medico accetta senza rifare il ragionamento | decisione non pensata | ogni proposta mostra i numeri da cui nasce; resta scritto chi ha deciso | la validazione misura quante proposte vengono modificate o scartate | media × possibile |
| 6 | Farmaco riconosciuto male dal nome scritto | finestra del principio sbagliato | il principio riconosciuto è mostrato accanto al nome; ciò che non si riconosce resta senza finestra | il medico rilegge la riga | media × rara |
| 7 | Orari scritti diversi da quelli reali del paziente | proposta su una terapia che il paziente non segue | — | chiedere al paziente gli orari veri prima di scrivere la terapia | media × possibile |
| 8 | Notte del paziente diversa da 22–07 (turni) | giorno e notte scambiati | sveglia e ora di andare a letto per profilo | impostarle prima di leggere il profilo | media × rara |
| 9 | Registrazione povera | conclusioni su pochi dati | nessuna proposta se la registrazione non è affidabile | — | lieve × rara |
| 10 | L'avviso «resta sopra soglia» letto come «terapia insufficiente» | cambio di terapia affrettato | frase fissa che descrive i dati e rimanda al medico; nessuna parola sulla terapia | — | lieve × possibile |
| 11 | Modifica alle regole senza nuova validazione | proposte diverse senza che nessuno lo sappia | versione delle regole salvata in ogni proposta; prove automatiche | controllo delle modifiche (descrizione tecnica §5) | media × rara |
| 12 | Proposta fatta arrivare al paziente senza il medico | il paziente cambia orario da solo | nessuna funzione di invio o stampa per il paziente | — | grave × rara |

**Rischio che il software non copre**: che spostare l'orario non porti alcun beneficio
sugli esiti (vedi README, «Il punto debole»). È dichiarato nella destinazione d'uso.
