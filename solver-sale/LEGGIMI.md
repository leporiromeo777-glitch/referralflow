# solver-sale

Il solver delle sale (OR-Tools CP-SAT) come servizio locale del Mac, su `127.0.0.1:8711`.
Progetto in `docs/wiki/Piattaforma/Orchestrazione sale.md` (§5, §6, §12).

- `installa.sh` crea l'ambiente Python isolato in `.venv` (non tocca la catena dei referti), installa OR-Tools e carica il servizio launchd `ch.referralflow.solver-sale`.
- `solver.py` è il modello; `servizio.py` l'HTTP. `POST /risolvi` con il JSON della richiesta, `GET /vivo` per il ping.
- Nessun accesso al database, nessun testo clinico: nel JSON entrano id, prestazioni, minuti e stanze.
- Se il servizio non risponde entro il limite, la piattaforma usa il riparatore in TypeScript e lo dice.
