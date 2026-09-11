---
tipo: tappa
aggiornata: 2026-09-11
---
# Pannello locale della catena (`pannello.py`)

Strumento d'esercizio dello studio, ammesso dalla SPEC (§10, revisione del 24.7.2026): pagina unica su `http://127.0.0.1:8737`, servizio launchd `ch.referralflow.referti-pannello`. Ascolta SOLO in locale: non è raggiungibile dalla rete, quindi può mostrare contenuti clinici (audio e bozze non ancora inviate), che non lasciano mai il Mac (disco cifrato con FileVault). **La revisione clinica e la conferma restano in ReferralFlow.**

## Che cosa fa
- **Carica dettati** (`/carica`): trascina dentro i file audio (.wav, .mp3, .m4a, .dss, .ds2) scegliendo chi ha dettato (obbligatorio quando i profili ci sono, vedi [[Catena/Profili per medico]]) → finiscono in `~/referti/ingresso` col marcatore `medico-<id>--`.
- **Coda ed errori**: stato dei file in lavorazione, quelli in `errori/` con il log accanto (mai contenuti), «Riprova» (`/riprova`).
- **Bozze non ancora inviate** con riascolto dell'audio (`/audio`, con conversione al volo dei DSS/DS2).
- **Dizionario dello studio** (`/dizionario/aggiungi`, `/dizionario/rimuovi`) → `correzioni-locali.json`, ricaricato dal servizio a ogni giro; mai cifre. I suggerimenti (`/suggerimenti/aggiungi`) alimentano il vocabolario.
- Legge `medici.json` a ogni richiesta: non serve riavviarlo quando cambia un profilo.

## Che cosa NON fa
Niente conferme, niente modifiche al testo, niente invio manuale: l'invio a ReferralFlow lo fa il servizio da solo. Per i dettati caricati dalla pagina Referti dell'app (drag & drop) il pannello non serve: la catena li scarica dalla coda della piattaforma.
