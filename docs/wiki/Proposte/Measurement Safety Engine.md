---
tipo: proposta
aggiornata: 2026-09-19
stato: tutte le fasi fatte (1-5-7-8 il 19.9.2026; 3, 4, 6, 9 il 20.9.2026); ogni funzione nuova è in validazione
---
# Measurement Safety Engine — analisi, architettura, piano

Risposta alla specifica del 19.9.2026 («fail closed», sei strati, nove fasi). Prima di scrivere codice, come chiesto al punto 20: che cosa c'è già, dove sono i rischi, che cosa manca, e in che ordine conviene farlo. **Il righello di oggi (Decisioni/Registro 19.9.2026) è la fase 2 di questo piano già fatta e validata**: il piano non ricomincia da zero, lo irrobustisce.

Due avvertenze prima di tutto:

1. **La specifica è scritta per un PACS generico. ReferralFlow non lo è.** È un ambulatorio di cardiologia con un ecografo Philips; TAC e RM arrivano su CD da fuori. Le priorità reali sono: ecografia (regioni), multiframe/cine, tracciabilità. La trasformazione in spazio paziente (IOP/IPP/Frame of Reference) serve solo a MPR e 3D, che la specifica stessa rimanda alla fase 9.
2. **Ogni strumento oltre la distanza riapre il fascicolo in-house** (`docs/legale/dispositivo-in-house/`): destinazione d'uso, analisi dei rischi, validazione clinica. Le fasi 3, 4, 6 e 9 non sono «funzioni da aggiungere»: sono modifiche del dispositivo. Le fasi 1, 5, 7, 8 invece rafforzano la distanza già dichiarata e si fanno dentro il fascicolo attuale.

## 1. Che cosa c'è oggi (analisi della base di codice)

| Strato della specifica | Oggi | File |
|---|---|---|
| A. DICOM data layer | pydicom 3.0.2 in un processo separato; `meta` (identificatori, Rows/Columns, frame, finestra), `calibrazione` (regioni US in cm → mm/px; PixelSpacing riga/colonna anche da SharedFunctionalGroups; ImagerPixelSpacing distinto), `misure` (SR), `png` | `imaging/leggi-dicom.py` |
| B. Geometry engine | schermo → pixel nativi con scala = colonne native / larghezza mostrata (`versoNativo`); pixel → mm per asse (regione US o PixelSpacing) | `public/prototipo/misura.js` |
| C. Measurement engine | **solo distanza**: √((Δx·sx)² + (Δy·sy)²) | `misura.js` |
| D. Validation & safety | stati impliciti: `ok` / `non_calibrata` / `rivelatore` / `fuori_regione` / `regioni_diverse` / `fuori_immagine` / `punti_uguali`; fail closed (senza calibrazione niente numero); il server ricalcola dai punti | `misura.js`, `api/prototipo/imaging/misure` |
| E. Viewer | PNG già finestrato + canvas sopra; il browser non fa calcoli se non chiamando la libreria; nessuno zoom/pan/rotazione ancora | `bridge/11-immagini.js` (`rfMis*`) |
| F. Storage/audit | `imaging_misure_manuali`: punti nativi, valore non arrotondato, calibrazione copiata, `versione_calcolo`, chi, quando; annullamento tracciato, nessuna cancellazione; registro accessi «misurato»; CSV di validazione | migrazione 068 |

**Come si renderizza**: il server disegna un PNG (modality LUT → VOI → 8 bit, rimpicciolito oltre 2048 px), il browser lo mostra con `max-width:100%`. Nessuna libreria DICOM nel browser. **Come si gestiscono le coordinate**: il canvas copre l'immagine mostrata; `getBoundingClientRect` a ogni evento; DPR gestito nel disegno, non nella misura. **Come si caricano CT/MR/US**: stesso percorso; la modalità cambia solo le finestre proposte e la fonte della calibrazione.

## 2. Rischi e limiti dell'architettura attuale (trovati oggi, onesti)

| # | Rischio | Gravità | Dove si risolve |
|---|---|---|---|
| A1 | **Pixel Aspect Ratio (0028,0034) ignorato**: un'immagine a pixel non quadrati si mostra distorta. La *misura* resta giusta (mm per asse), la *vista* no, e il punto si mette peggio | media | fase 1 (lettura) + viewer (scala per asse) |
| A2 | **Verifica indipendente assente**: browser e server usano lo stesso file per scelta (un solo codice). È coerenza, non doppio controllo (punto 14 della specifica) | media | fase 7: ricalcolo in Python/numpy sul server, confronto con tolleranza |
| A3 | Stati di validazione impliciti nelle stringhe di rifiuto; manca lo stato **CAUTION** e mancano gli **avvisi** conservati con la misura | media | fase 1/7: Validation Gate esplicito |
| A4 | Provenienza incompleta: manca `software_version` (hash git), `algoritmo`, `valore_mostrato`, avvisi | bassa | fase 8 |
| A5 | **Nessuna lettura di**: IOP/IPP/FoR, SliceThickness/SpacingBetweenSlices, RescaleSlope/Intercept nel dato di calibrazione, ImageType DERIVED, PixelSpacingCalibrationType, per-frame functional groups | media | fase 1 |
| A6 | Enhanced multiframe con spacing per fotogramma → oggi «nessuna» (fail closed, giusto) ma senza motivo esplicito | bassa | fase 1/6 |
| A7 | US con **PixelSpacing e regioni entrambi presenti**: oggi vincono le regioni senza segnalare il conflitto | bassa | fase 5: CAUTION se discordano |
| A8 | Nessun test automatico dell'invarianza a zoom/pan/DPR/rotazione (non esistono ancora zoom/pan/rotazione) | media | fase 7, insieme al viewer |
| A9 | Modifica di una misura = annulla + nuova (niente sovrascrittura silenziosa, bene) ma senza legame «sostituisce la n.» | bassa | fase 8 |
| A10 | Calibrazione salvata come JSON copiato: giusto; ma non c'è checksum del file DICOM di origine (il file è immutabile per costruzione) | bassa | fase 8: SHA-256 del file in `imaging_immagini` |

Nessuno di questi produce oggi un numero sbagliato: producono al massimo un rifiuto o una vista distorta. È il motivo per cui il righello ha potuto entrare in validazione.

## 3. Architettura proposta (sei strati, un solo calcolo, viewer sostituibile)

```
 browser (viewer qualsiasi)                          server (Node)                       lettore (Python)
 ────────────────────────                           ─────────────                       ────────────────
 gesto → punti schermo                                                                  leggi-dicom.py geometria
   │  trasformazione del viewer (zoom, pan,                                              → JSON per immagine
   │  rotazione, DPR): matrice 3×3 nota                                                  (fase 1)
   ▼                                                                                          │
 punti immagine (pixel nativi, frazionari)                                                    ▼
   │                                                    imaging_immagini.geometria  ◄─── salvato all'ingestione
   ▼                                                            │
 mse/geometria.js ─ pixel → mm (regione US | spacing)  ◄────────┘  stesso file, caricato in vm
 mse/validazione.js ─ Gate: VALIDATED | CAUTION | NOT_MEASURABLE + motivi + avvisi
 mse/misure.js ─ distanza (poi: polilinea, angolo, area…)   ← puro, senza DOM, testabile
   │  (anteprima a schermo, MAI salvata)
   ▼
 POST punti + immagine + frame  ──────────────►  server: ricalcolo con gli stessi tre moduli
                                                  + verifica indipendente (Python/numpy, fase 7)
                                                  + Gate di nuovo (lo stato lo decide il server)
                                                  + provenienza completa → imaging_misure_manuali
                                                  + evento → imaging_misure_eventi
                                                  ◄──────── risposta: valore, stato, avvisi
 UI mostra SOLO ciò che il server ha risposto
```

Regole architetturali, verificabili con un test ciascuna:

- `mse/*.js` non contiene `document`, `window`, `fetch`: si carica in Node con `vm` (già così per `misura.js`).
- Il viewer passa alla libreria **una matrice** schermo→immagine; la libreria non sa che cosa sia un canvas. Cambiare viewer = cambiare chi produce la matrice.
- Il valore mostrato in anteprima e quello salvato nascono dallo stesso codice; ma **solo il salvato è «validato»**, perché solo il server ha eseguito il Gate e la verifica indipendente.
- Il Gate restituisce sempre uno stato e la lista dei motivi; la UI non ha un ramo che ignori `NOT_MEASURABLE`.

### Modello dati

`imaging_immagini.geometria` (jsonb, sostituisce ed estende `calibrazione`):

```
{ versione: 1,
  identita: { sop_class, sop_uid, serie_uid, studio_uid, modalita, frame_totali },
  pixel: { righe, colonne, aspect: [v, h] | null, rescale: { slope, intercept, tipo } | null,
           fotometria, bit },
  spaziatura: { fonte: 'PixelSpacing' | 'ImagerPixelSpacing' | 'FunctionalGroups' | null,
                dy_mm, dx_mm, per_frame: bool, calibrazione_tipo: 'GEOMETRY'|'FIDUCIAL'|null,
                calibrazione_descrizione },
  regioni_us: [ { x0,y0,x1,y1, formato, tipo_dati, unita_x, unita_y, delta_x, delta_y,
                  rif_x0, rif_y0, rif_fisico_x, rif_fisico_y, flags } ],   // TUTTE, non solo le 2D
  spazio: { iop: [6], ipp: [3], frame_of_reference, spessore_mm, distanza_slice_mm } | null,
  derivata: bool, image_type: [...],
  avvisi_lettura: [ 'pixel_spacing_e_imager_discordanti', ... ],
  sha256_file }
```

`imaging_misure_manuali` (estensione della 068): `tipo` ('distanza' | 'polilinea' | 'angolo' | 'roi_rettangolo' | 'roi_ellisse' | 'poligono' | 'punto'), `punti` (immagine), `punti_fisici` (mm, nel sistema scelto), `valore` (non arrotondato), `valore_mostrato`, `unita`, `algoritmo`, `versione_algoritmo`, `versione_software` (hash git), `stato_validazione` (VALIDATED | CAUTION), `avvisi` (jsonb), `verifica_indipendente` ({ valore_b, scarto, tolleranza, esito }), `geometria` (copia), `sostituisce_id` (per le modifiche), `annullata_at/da`.

`imaging_misure_eventi` (nuova): `misura_id`, `evento` ('creata' | 'etichettata' | 'riferimento' | 'annullata' | 'sostituita'), `user_id`, `quando`, `prima` (jsonb), `dopo` (jsonb), `versione_software`. Solo inserimenti.

### Matrice dei metadati richiesti per modalità

| Attributo | CT/MR | Enhanced CT/MR | US | US multiframe | CR/DX | SC/OT |
|---|---|---|---|---|---|---|
| Rows/Columns (0028,0010/0011) | obbligatorio | obbligatorio | obbligatorio | obbligatorio | — | — |
| Pixel Spacing (0028,0030) | **fonte della misura** | in Shared/PerFrame Functional Groups (Pixel Measures) | facoltativo; se presente con regioni discordanti → CAUTION | idem | presente solo se calibrato (Calibration Type) | non si misura |
| Imager Pixel Spacing (0018,1164) | — | — | — | — | non è calibrazione paziente → NOT_MEASURABLE salvo Pixel Spacing calibrato (fase successiva, CAUTION) | — |
| Pixel Spacing Calibration Type/Description (0028,0A02/0A04) | — | — | — | — | GEOMETRY / FIDUCIAL: decide se CAUTION | — |
| Sequence of Ultrasound Regions (0018,6011) | — | — | **fonte della misura** (solo formato 2D, unità cm/cm) | idem, uguale per tutti i fotogrammi | — | — |
| Pixel Aspect Ratio (0028,0034) | vista | vista | vista (spesso ≠ 1:1) | vista | vista | — |
| IOP/IPP (0020,0037/0032), FoR (0020,0052) | fase 9 (MPR/3D); per la distanza in piano **non servono** | idem, per frame | — | — | — | — |
| Slice Thickness (0018,0050), Spacing Between Slices (0018,0088) | fase 9; la distanza reale fra fette si ricava da IPP adiacenti, mai da Slice Thickness | idem | — | — | — | — |
| Rescale Slope/Intercept/Type (0028,1053/1052/1054) | fase 4 (HU solo se CT e tipo HU) | idem | — | — | — | — |
| Number of Frames (0028,0008) | — | obbligatorio | — | obbligatorio | — | — |
| Image Type (0008,0008) DERIVED | avviso → CAUTION | idem | idem | idem | idem | — |

**Perché la distanza in piano non ha bisogno di IOP/IPP**: Pixel Spacing è, per definizione dello standard (PS3.3, 10.7), «la distanza fisica nel paziente fra i centri dei pixel adiacenti» lungo riga e colonna. Una distanza fra due punti *sulla stessa immagine* è quindi esatta in mm con la sola spaziatura, qualunque sia l'orientamento del piano (obliquo compreso). IOP/IPP servono quando due punti stanno su immagini diverse. Questo va scritto nella documentazione dell'algoritmo, perché la specifica al punto 3 lo chiede e la risposta è «non necessario per la fase 2, necessario per la 9».

**Definizioni verificate oggi sullo standard corrente (PS3.3 2026c)** — non a memoria:
- Regioni US (C.8.5.5): Spatial Format 1 = 2D, 2 = M-mode, 3 = spettrale, 4 = waveform, 5 = grafica; Data Type 1 = tessuto, 2 = color flow, 3/4 = Doppler PW/CW; Physical Units 3 = cm, 4 = secondi, 7 = cm/s, 12 = gradi; Physical Delta = incremento fisico per pixel (**può essere negativo**, tipico dell'asse Y Doppler); Reference Pixel + Ref Pixel Physical Value legano un pixel a un valore fisico assoluto (serve per tempo/velocità, non per le distanze); Region Location = angoli in pixel con origine in alto a sinistra dell'intera immagine; Region Flags bit 0 priorità, bit 1 protezione scala, bit 2 tipo scala Doppler, bit 3-4 scorrimento.
- Pixel Spacing Calibration Type (10.7): GEOMETRY = corretto per ingrandimento assunto o noto, a profondità non specificata; FIDUCIAL = calibrato su un oggetto di dimensione nota visibile nell'immagine. Pixel Spacing è «calibrato» quando differisce da Imager Pixel Spacing.

**Dubbi da chiarire sullo standard prima di implementarli** (non si inventa): il segno di Spacing Between Slices; il comportamento con Pixel Aspect Ratio in presenza di regioni US (le regioni sono in pixel: l'aspect ratio non le tocca, ma va provato su file veri); Per-Frame Functional Groups con Pixel Measures diversi per fotogramma (raro: → NOT_MEASURABLE finché non validato).

## 4. Validation Gate — le regole

| Controllo | Esito se fallisce |
|---|---|
| geometria presente e `versione` conosciuta | NOT_MEASURABLE «geometria non letta» |
| righe/colonne > 0, numeri finiti; punti dentro l'immagine | NOT_MEASURABLE |
| fotogramma esistente | NOT_MEASURABLE |
| modalità in {CT, MR, US, e Enhanced} | NOT_MEASURABLE «modalità non validata» |
| fonte di calibrazione: regione US 2D cm/cm oppure Pixel Spacing paziente | NOT_MEASURABLE «calibrazione fisica non verificabile» |
| spacing > 0 finito; delta regioni ≠ 0 finiti | NOT_MEASURABLE «calibrazione non valida» |
| tutti i punti nella stessa regione US | NOT_MEASURABLE «punti in regioni diverse / fuori regione» |
| Pixel Spacing e regioni US presenti e discordanti (> 1%) | CAUTION «due calibrazioni nel file» |
| Imager Pixel Spacing come unica fonte | NOT_MEASURABLE «spaziatura del rivelatore» |
| Pixel Spacing calibrato GEOMETRY | CAUTION «ingrandimento assunto» (solo se validato nel V&V) |
| Image Type DERIVED / SECONDARY | CAUTION «immagine derivata» |
| Pixel Aspect Ratio ≠ 1:1 | CAUTION «pixel non quadrati» finché il viewer non lo compensa |
| spacing per fotogramma (Per-Frame Groups) | NOT_MEASURABLE finché non validato |
| verifica indipendente: |A − B| > tolleranza | NOT_MEASURABLE «i due calcoli non coincidono» + log di errore |

**CAUTION** si salva e si mostra con il segno ⚠ solo se quel caso è nella lista «validati» del piano di V&V (una tabella nel fascicolo, letta dal codice); altrimenti si comporta come NOT_MEASURABLE.

## 5. Piano di test

| Categoria | Come | Fase |
|---|---|---|
| Geometria sintetica (pydicom) | estende `imaging/prova-calibrazione.py`: 100 px × 0,5 = 50 mm; X≠Y; oblique (IOP ruotata: la distanza in piano non cambia); ruotate; CT multiframe; MR enhanced con Shared e con Per-Frame; US una regione, più regioni, senza; metadati mancanti, contraddittori (PixelSpacing vs regioni), nulli, negativi, fuori immagine, DERIVED, serie con IPP non uniforme | 1, 5, 6 |
| Motore puro (node:test su `mse/*.js` via vm) | ogni algoritmo con valori noti; overflow/NaN/Infinity; punti fuori | 2, 3, 4 |
| Gate | una prova per riga della tabella §4, stato e motivo attesi | 7 |
| Invarianza | la libreria riceve matrici di viewer diverse (zoom 0,25–8×, pan, rotazione 90/180/270 e arbitraria, DPR 1–3, finestra 320–3840 px): stessi punti immagine → stesso valore alla 12ª cifra | 7 |
| Verifica indipendente | Python/numpy ricalcola dai punti salvati: |A−B| ≤ 1e-9 relativo su 1000 casi casuali | 7 |
| End-to-end (server di prova, DB demo) | `scripts/prova-righello-e2e.py` esteso: stati, avvisi, eventi, CSV | 7, 8 |
| Riferimento | tabella *Test · Ground truth · Risultato · Errore assoluto · Errore relativo · PASS/FAIL* generata dal CSV di validazione (misure legate a quelle dell'apparecchio), fantoccio, comparatore certificato (OsiriX MD, solo come riferimento). **Le soglie non le sceglie il codice**: le scrive e firma il responsabile clinico nel piano di V&V (oggi nel fascicolo c'è una proposta, marcata come tale) | 7 |
| Regressione fra versioni | le misure salvate con `versione_algoritmo` N si ricalcolano con N+1 in un banco; ogni differenza > tolleranza blocca la distribuzione | 8 |

## 6. Le fasi

Per ciascuna: file, architettura, prove, failure mode, accettazione. Il codice si scrive **una fase alla volta, dopo il via**, e ogni fase finisce con banchi verdi, wiki e Registro aggiornati.

### Fase 1 — DICOM Geometry Engine — **fatta il 19.9.2026**
- **Crea** `imaging/geometria.py` (funzione `geometria_di(ds)`, chiamata da `meta` e da un comando `geometria`); `db/migrations/069_imaging_geometria.sql` (colonna `geometria`, `sha256`; `calibrazione` resta per compatibilità e si popola da `geometria`); `public/prototipo/mse/geometria.js` (pixel → mm; regioni; matrice viewer → immagine); `src/lib/mse.ts` (caricatore vm dei moduli `mse/`).
- **Modifica** `leggi-dicom.py` (delega), `imaging-ingest.ts`, `imaging-ordina.ts`, rotta calibrazione (→ geometria).
- **Prove**: `prova-calibrazione.py` esteso (≥ 25 casi), `prove-mse-geometria.test.ts`.
- **Failure mode**: riga/colonna invertite; unità; regioni non 2D accettate; Per-Frame ignorati; aspect ratio; DERIVED non letto.
- **Accettazione**: ogni attributo della matrice §3 letto o dichiarato assente; nessuna stima; il righello di oggi produce gli stessi numeri (banco di regressione sulle misure sintetiche).

### Fase 2 — Distanza — **fatta il 19.9.2026** (v163)
Resta da spostare `misura.js` in `mse/misure.js` senza cambiare il calcolo (la versione dell'algoritmo resta 1.0 se il numero non cambia: lo prova il banco di regressione).

### Fase 3 — Polilinea, angolo, ROI rettangolare/ellittica, poligono, perimetro, punto — **fatta il 20.9.2026** (fascicolo riaperto: destinazione d'uso 1.1, rischi R29–R35, validazione per strumento)
- **Crea** `mse/misure.js` (una funzione per strumento, tutte su coordinate in mm); UI: strumenti nel menu «Misura».
- **Prove**: valori noti (quadrato 10×10 mm = 100 mm²; ellisse πab; angolo 90°; poligono concavo; poligono autointersecante → rifiuto).
- **Failure mode**: area su regioni US diverse; poligono aperto; angolo con vertici coincidenti; ellisse fuori immagine.
- **Accettazione**: **riapre il fascicolo** — nuova destinazione d'uso, rischi per strumento, validazione clinica per strumento. Da fare solo se il medico chiede davvero aree e angoli (in ecocardiografia: area atriale, angoli quasi mai).

### Fase 4 — Valori CT (HU) e statistiche ROI — **fatta il 20.9.2026**
- **Crea** comando `statistiche` in Python (numpy su pixel originali con Rescale; HU solo se `Modality = CT` e `RescaleType` assente o HU); risposta con min/max/media/deviazione standard, numero di pixel, e la maschera usata.
- **Failure mode**: Rescale mancante; ROI a cavallo del bordo; MR presentata come HU; immagine derivata.
- **Accettazione**: fantoccio di densità o confronto con la console TAC; **riapre il fascicolo**. Per uno studio di cardiologia senza TAC propria: bassa priorità.

### Fase 5 — Ultrasound Region Calibration completa — **fatta il 19.9.2026** (tempo/velocità predisposti nei dati, non attivi)
- **Modifica** `geometria.py` (tutte le regioni con tutti i campi, incluso Reference Pixel e Flags), `mse/geometria.js` (regione per punto; unità per asse; rifiuto M-mode/spettrale per le distanze; predisposizione tempo/velocità senza attivarle), Gate (conflitto PixelSpacing/regioni).
- **Prove**: regioni sovrapposte con priorità; Delta Y negativo; unità miste (cm/sec); regione 2D dentro una spettrale; file veri dell'ecografo dello studio (senza dati nel repo).
- **Failure mode**: punto su regione color flow con delta diversi dal tessuto; regione grafica scambiata per tessuto.
- **Accettazione**: dentro il fascicolo attuale (è la distanza, fatta meglio); la validazione clinica del piano §3 vale come prova.

### Fase 6 — Multiframe / cine — **fatta il 20.9.2026** (spaziatura per fotogramma come CAUTION da validare)
- **Modifica** viewer (scorrimento fotogrammi già c'è) e Gate (fotogramma esistente; spacing per fotogramma → NOT_MEASURABLE finché non validato); misure legate al fotogramma (già così).
- **Prove**: US cine 60 fotogrammi, misura sul 37; Enhanced con Per-Frame Pixel Measures diversi → rifiuto.
- **Accettazione**: dentro il fascicolo per US cine (stessa calibrazione su tutti i fotogrammi); Enhanced per-frame resta rifiutato.

### Fase 7 — Validation Suite, Gate, verifica indipendente, invarianza — **fatta il 19.9.2026**
- **Crea** `mse/validazione.js` (Gate, §4), `imaging/verifica-indipendente.py` (numpy, chiamato dal server a ogni salvataggio), banco di invarianza, tabella di riferimento generata dal CSV, lista «CAUTION validati» nel fascicolo letta dal codice.
- **Modifica** rotta misure (stato + avvisi + verifica), viewer (indicatore ✓ ⚠ ✕, «Dettagli calibrazione», motivo al posto del tasto spento).
- **Accettazione**: nessun salvataggio senza esito del Gate e della verifica; ogni riga di §4 provata; invarianza alla 12ª cifra.

### Fase 8 — Audit trail e provenienza — **fatta il 19.9.2026**
- **Crea** `db/migrations/070_imaging_misure_eventi.sql`; `versione_software` (hash git letto a build) e `valore_mostrato`, `algoritmo`, `avvisi`, `sostituisce_id` nelle misure; esportazione della provenienza completa in JSON per misura («da dove arriva questo numero?»).
- **Modifica** rotta misure (eventi a ogni azione), scheda misure (storia di una misura).
- **Accettazione**: per ogni misura salvata si ricostruisce il numero da soli dati in tabella; nessun aggiornamento del software cambia un numero salvato (il banco di regressione lo dimostra e blocca la distribuzione se no).

### Fase 9 — MPR / 3D / volumi — **fatta il 20.9.2026** (geometria di serie, distanza 3D, volume per somma di fette, piani sagittale/coronale; niente obliqui né rendering)
Spazio paziente (IOP/IPP/FoR), distanza fra fette da IPP adiacenti, volumi mai da area × Slice Thickness. Per questo studio oggi non c'è il caso d'uso.

## 7. Ordine consigliato, e perché

**1 → 5 → 7 → 8**: sono tutte «la distanza, fatta come la specifica vuole», restano dentro il fascicolo firmato oggi e non cambiano la destinazione d'uso. Stima: due o tre settimane di lavoro, misurate banco per banco.

**3, 4, 6-Enhanced, 9**: ognuna riapre destinazione d'uso, rischi e validazione clinica. Si decidono una per una, quando un medico dello studio dice «mi serve questa misura», non prima.

**AI**: nessuna. Il piano non prevede che un modello tocchi la conversione pixel → mm; se un giorno un assistente proporrà i punti, il numero lo farà comunque `mse/misure.js` e il Gate lo giudicherà come qualunque altro.

## 8. Che cosa aspetto prima di scrivere codice

Un «vai» sulla fase 1 (o sull'ordine 1-5-7-8), e la conferma che aree, angoli e HU restano fuori finché non li chiede un medico. Il resto — file, prove, failure mode, criteri — è sopra.
