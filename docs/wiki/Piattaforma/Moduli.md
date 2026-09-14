---
tipo: piattaforma
aggiornata: 2026-09-14
---
# Moduli dello studio (versione digitale)

Questa pagina è **letta dalla piattaforma** (`src/lib/moduli.ts`, cache di 5 minuti) e diventa la voce «Moduli» dell'interfaccia nuova: ogni sezione `##` è un modulo compilabile e stampabile, le compilazioni si salvano nel dossier del paziente (`moduli_compilazioni`, migrazione 039) con il registro di chi le apre. Si cambia la pagina, non il codice.

Regole del formato: titolo `## CODICE — Titolo`; campi in elenco puntato con la chiave in testa (`Chi compila`, `Quando`, `Nota`); sotto `Campi` le domande numerate come `N. Etichetta — tipo — obbligatorio`. Tipi: `testo`, `testo lungo`, `numero`, `data`, `sì/no`, `scelta: a | b | c`. Il campo con etichetta «Apparecchio» propone gli apparecchi registrati in Studio. Niente dati di pazienti in questa pagina: solo le domande.

I moduli qui sotto sono una **proposta iniziale** per uno studio cardiologico ambulatoriale: lo studio li riscrive con le sue parole e i suoi codici.

## M 001 — Anamnesi pre-visita
- Chi compila: il paziente all'accoglienza, o la segreteria con il paziente
- Quando: prima della prima visita, o se dall'ultima sono passati più di 12 mesi
- Nota: le risposte servono al medico per arrivare preparato; il medico le verifica a voce durante la visita.
- Campi:
  1. Motivo della visita — testo lungo — obbligatorio
  2. Sintomi attuali (dolore al petto, affanno, palpitazioni, svenimenti, gonfiore alle gambe) — testo lungo
  3. Farmaci in corso, con la dose — testo lungo — obbligatorio
  4. Allergie o intolleranze a farmaci — testo
  5. Fumo — scelta: no | sì | ex fumatore
  6. Malattie di cuore in famiglia prima dei 60 anni — scelta: no | sì | non so
  7. Interventi, ricoveri o esami cardiologici precedenti — testo lungo
  8. Peso (kg) — numero
  9. Altezza (cm) — numero
  10. Altro che il medico deve sapere — testo lungo

## M 002 — Consenso al trattamento e alla trasmissione dei dati
- Chi compila: il paziente, con la segreteria
- Quando: alla prima visita; da rinnovare se cambiano i medici curanti
- Nota: la base legale della trasmissione ai medici curanti è l'art. 64 cpv. 2 LSan TI e l'art. 321 CP; la copia firmata si carica nella cartella come documento «consenso».
- Campi:
  1. Medico curante a cui inviare referti e lettere — testo — obbligatorio
  2. Altri medici o strutture a cui trasmettere — testo
  3. Acconsento alla trasmissione dei referti ai medici indicati — sì/no — obbligatorio
  4. Acconsento a ricevere referti e promemoria via e-mail — sì/no
  5. Acconsento a ricevere promemoria via SMS — sì/no
  6. Persona di riferimento (nome e telefono) — testo
  7. Data della firma — data — obbligatorio

## M 003 — Scheda ergometria
- Chi compila: l'aiuto medico prima e durante il test, il medico al termine
- Quando: a ogni test da sforzo
- Nota: le misure numeriche di questa scheda restano nel dossier; il referto lo detta il medico.
- Campi:
  1. Peso (kg) — numero — obbligatorio
  2. Pressione a riposo (mmHg) — testo — obbligatorio
  3. Frequenza a riposo (bpm) — numero — obbligatorio
  4. Farmaci sospesi per il test — scelta: nessuno | beta-bloccante | altro
  5. Quali e da quando — testo
  6. ECG di base letto dal medico prima di iniziare — sì/no — obbligatorio
  7. Protocollo — scelta: Bruce | Bruce modificato | cicloergometro a rampa | altro
  8. Motivo di interruzione — scelta: esaurimento | frequenza raggiunta | sintomi | alterazioni ECG | pressione | altro
  9. Pressione massima (mmHg) — testo
  10. Frequenza massima (bpm) — numero
  11. Sintomi durante il test — testo lungo
  12. Recupero completo prima della dimissione — sì/no — obbligatorio

## M 004 — Consegna e ritiro Holter
- Chi compila: la segreteria o l'aiuto medico
- Quando: alla consegna dell'apparecchio e al ritiro
- Nota: l'apparecchio si sceglie tra quelli registrati in Studio → Apparecchi; il diario del paziente si consegna sempre.
- Campi:
  1. Tipo di registrazione — scelta: Holter ECG 24 ore | Holter ECG 48-72 ore | Holter pressorio 24 ore — obbligatorio
  2. Apparecchio — testo — obbligatorio
  3. Consegnato il — data — obbligatorio
  4. Ritiro previsto il — data — obbligatorio
  5. Diario consegnato e spiegato — sì/no — obbligatorio
  6. Istruzioni date (doccia, elettrodi, cosa annotare) — sì/no
  7. Ritirato il — data
  8. Apparecchio integro al ritiro — sì/no
  9. Note — testo lungo

## M 005 — Controllo prima dell'ecocardiogramma da stress
- Chi compila: l'aiuto medico
- Quando: all'arrivo del paziente, prima dell'esame
- Nota: se una voce obbligatoria è «no», si chiama il medico prima di iniziare.
- Campi:
  1. A digiuno da almeno 3 ore — sì/no — obbligatorio
  2. Beta-bloccante sospeso come da istruzioni — scelta: sì | no | non lo prende — obbligatorio
  3. Consenso all'esame firmato — sì/no — obbligatorio
  4. Accesso venoso posizionato (se farmacologico) — scelta: sì | no | non serve
  5. Pressione all'arrivo (mmHg) — testo — obbligatorio
  6. Frequenza all'arrivo (bpm) — numero — obbligatorio
  7. Note — testo lungo
