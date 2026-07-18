# Prompt d'avvio per Claude Code

Incolla questo come primo messaggio in una nuova sessione di Claude Code, dentro la cartella del progetto.

---

Questo è ReferralFlow, un gestionale di referral per uno studio di cardiologia (cliente reale).
Prima di fare qualsiasi cosa, leggi `CLAUDE.md`, `README.md` e `db/schema.sql` per capire
architettura, comandi e vincoli.

Poi aiutami a far girare il progetto in locale: guidami passo-passo su install, `.env`, creazione
dello schema sul database e primo utente, e avvio del dev server. Se qualcosa non parte, diagnostica
l'errore prima di cambiare codice.

Regole:
- Non modificare la configurazione dei pacchetti nativi in `next.config.mjs`.
- Non importare `src/lib/auth.ts` o `src/lib/storage.ts` in componenti client.
- Rispetta i vincoli nLPD descritti in `CLAUDE.md` (dati in Svizzera, niente dati clinici in chiaro).

Quando gira, il primo intervento che voglio fare è: <DESCRIVI QUI>.

---

## Varianti pronte per il primo intervento (scegline una al posto di <DESCRIVI QUI>)

- "aggiungere un filtro per stato e urgenza sulla dashboard, mantenendo il rendering server-side."
- "collegare l'invio reale delle notifiche all'inviante quando la referral passa a prenotata,
   partendo da un avviso neutro via email con link al portale (niente dati clinici nel messaggio)."
- "aggiungere scadenza e rotazione ai token dei link pubblici /invia e /portale."
- "aggiungere l'export CSV nella pagina statistiche."
