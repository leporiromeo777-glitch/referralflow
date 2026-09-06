# Valutazione d'impatto sulla protezione dei dati (DSFA / art. 22 LPD) — bozza

Trattamento: **dettatura e redazione assistita dei referti** (catena
«referti» sul Mac dello studio + app ReferralFlow). Stato: scheletro da
completare col legale, 5 settembre 2026. Perché serve: nuova tecnologia
(modelli AI) applicata a dati sanitari (art. 5 lett. c LPD) di molte persone
→ rischio elevato presumibile ex art. 22 cpv. 2 LPD.

## 1. Descrizione del trattamento

| Passo | Dove gira | Dati trattati | Esce dal Mac? |
|---|---|---|---|
| Registrazione del dettato (dittafono) | studio | voce del medico, dati clinici del paziente | no |
| Trascrizione (whisper large-v3, doppia passata Voxtral) | Mac dello studio | audio → testo | no |
| Correzioni da dizionario, deloop, punteggiatura | Mac dello studio | testo | no |
| Anonimizzazione dal codice (Persona N, [data N], [dato N]) + controprova | Mac dello studio | testo | no |
| Correzione/ispezione/bella copia/struttura/fusione via modello linguistico | **Infomaniak (Svizzera)**, API OpenAI-compatibile | **solo testo anonimizzato**, senza audio | sì, testo anonimizzato |
| Ricomposizione, guardie numeriche, allarmi | Mac dello studio | testo | no |
| Bozza nell'app ReferralFlow, revisione umana, PDF/Word | server dello studio (LAN) | referto | no (LAN) |
| Cancellazione dell'audio dopo la consegna della bozza | Mac dello studio | — | — |

Basi legali: contratto di cura + art. 31 cpv. 2 lett. b LPD (esecuzione del
contratto), segreto professionale art. 321 CP; la pseudonimizzazione è
documentata nel codice (`_anonimizza_per_esterno`) e nel registro.

## 2. Necessità e proporzionalità

- Perché il cloud: i modelli locali (gemma3:27b) non reggono le fasi di
  lettura clinica alla qualità misurata (banco correttori: gemma-4-31B
  Infomaniak 10 consensi vs modelli locali molto sotto); l'unica cosa che
  viaggia è testo già pseudonimizzato (dato personale per la LPD, trattato come tale) e frammentato in giri brevi.
- Minimizzazione: audio mai; nomi, date, luoghi, numeri identificativi
  sostituiti da segnaposto numerati; controprova che REDIGE il sospetto;
  finestra di gettoni limitata (1600 sull'anonimizzatore).
- Conservazione: audio cancellato dopo la bozza; testo nel DB dello studio
  (in Svizzera, LAN); log senza contenuti clinici.
- Alternativa senza cloud: catena locale (tag `catena-locale-v1`) attivabile
  in un minuto se il legale non validasse il percorso esterno.

## 3. Rischi e misure

| Rischio | Probabilità | Gravità | Misure |
|---|---|---|---|
| Re-identificazione dal testo pseudonimizzato al fornitore | bassa | alta | segnaposto numerati per tutto, redazione dei sospetti, frammentazione dei giri, nessun audio; DPA con Infomaniak; hosting CH |
| Il fornitore conserva i prompt / li usa per addestrare | media (da chiarire) | alta | **domanda formale a Infomaniak** (vedi email-infomaniak.md); clausola contrattuale; in mancanza, ritorno alla catena locale |
| Errore del modello che altera il senso clinico | media | alta | guardie deterministiche (numeri, unità, negazioni, ribaltamenti), provenienza per riga, revisione umana obbligatoria, misura della revisione |
| Accesso indebito al Mac / DB | bassa | alta | account dedicato, disco cifrato, 2FA sull'app, backup cifrati, chiavi chmod 600 fuori dal repo |
| Perdita di disponibilità (cloud giù) | media | bassa | fallback: la catena continua in locale con qualità ridotta e lo segnala |

## 4. Da completare col legale

- [ ] Contratto di trattamento (DPA) Infomaniak: conferma no-training,
      ritenzione prompt/log (giorni?), sub-responsabili, luogo dei server.
- [ ] Informativa ai pazienti: una riga sull'uso di strumenti di
      trascrizione/redazione assistita rivista dal medico (il rapporto
      Zurigo/UZH la considera sufficiente per l'uso amministrativo).
- [ ] Registro delle attività di trattamento (art. 12 LPD: obbligatorio
      sopra 250 collaboratori, consigliato comunque).
- [ ] Parere sul perimetro dispositivo medico: vedi destinazione-uso-ai.md.
- [ ] Data di revisione: ogni cambio di fornitore o di funzione AI.
