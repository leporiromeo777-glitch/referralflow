# Diritti degli interessati (Ricerca 17 §17.14)

Bozza del 6.9.2026. Richieste di accesso, rettifica, esportazione o cancellazione da parte di pazienti o medici.

1. **Identità**: verifica dell'identità del richiedente (di persona o documento).
2. **Inventario**: dove stanno i dati di quella persona: referral e cartella (app), referti firmati, bozze e versioni intermedie, eventuale audio nel dataset (solo se opt-in), backup (14/60 giorni), fornitore cloud (nessun dato identificativo per costruzione).
3. **Verifica legale**: il referto firmato è documentazione clinica obbligatoria (≥10 anni): non si cancella; si può annotare una rettifica. Bozze, versioni intermedie e audio del dataset sono cancellabili.
4. **Azione**: entro 30 giorni; esportazione in formato leggibile (PDF/Word del referto, JSON dei campi).
5. **Registro**: la richiesta e l'esito si annotano (senza contenuti) in `referti_eventi` con azione `diritti_*`.

Da predisporre nell'app: ricerca per paziente che elenchi tutte le sedi dei dati (oggi: cartella + referral + bozze per nome/data di nascita).
