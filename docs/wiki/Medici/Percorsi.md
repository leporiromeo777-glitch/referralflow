---
tipo: medici
aggiornata: 2026-09-14
---
# Percorsi diagnostico-terapeutici (sequenze standard per indicazione)

Questa pagina è **letta dalla piattaforma** (`src/lib/percorsi.ts`, cache di 5 minuti) e mostrata nell'interfaccia nuova alla voce «Percorsi»; il bot la conosce per nome. Si cambia la pagina, non il codice. Regole: un percorso per sezione `##`; i campi in elenco puntato con la chiave in testa (`Indicazione`, `Urgenza`, `Durata`, `Dove`, `Tempi`, `Stato`, `Prestazioni`, `Nota`, `Fonti`); le prestazioni numerate sotto `Prestazioni`, con la condizione dopo il trattino lungo. `Stato` è `proposta` finché il medico non la rilegge e la porta a `validato`. Niente dati clinici di pazienti: qui stanno solo sequenze e criteri generali.

**Tutti i percorsi qui sotto sono una proposta iniziale** scritta dalle linee guida per uno studio ambulatoriale: durate, tempi e criteri li valida il cardiologo che li usa. Le prestazioni «esterne» non si eseguono in studio: si prescrivono e si segue il ritorno del referto.

## Dolore toracico stabile
- Indicazione: sospetta cardiopatia ischemica cronica, dolore toracico non acuto
- Urgenza: no
- Durata: 60'
- Dove: Ambulatorio
- Tempi: entro 7 giorni; in giornata se il dolore è recente o in peggioramento
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre, con stima della probabilità pre-test
  2. ECG a riposo — sempre
  3. Ecocardiogramma — sempre (funzione ventricolare, valvole, cinetica)
  4. Ergometria — se l'ECG a riposo è interpretabile e il paziente può pedalare
  5. TAC coronarica (esterna) — probabilità bassa-intermedia con test non conclusivo
  6. Coronarografia (esterna) — probabilità alta o ischemia documentata
- Nota: il dolore toracico acuto in corso non è un percorso ambulatoriale (144). Ergometria dubbia: TAC nel rischio basso-intermedio, coronarografia nel rischio alto.
- Fonti: ESC 2024 sindromi coronariche croniche

## Cardiopatia ischemica cronica nota
- Indicazione: controllo periodico dopo infarto, PCI o bypass, angina stabile in terapia
- Urgenza: no
- Durata: 45'
- Dove: Ambulatorio
- Tempi: controllo annuale, anticipato se i sintomi cambiano
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre, con revisione della terapia e dei fattori di rischio
  2. ECG a riposo — sempre
  3. Ecocardiogramma — ogni 1-2 anni o se cambiano i sintomi
  4. Ergometria — se sintomi nuovi o per fissare il carico di allenamento
  5. Laboratorio — profilo lipidico, creatinina, HbA1c secondo terapia
  6. Coronarografia (esterna) — solo con ischemia documentata o sintomi refrattari
- Nota: senza ischemia documentata la rivascolarizzazione non ha indicazione.
- Fonti: ESC 2024 sindromi coronariche croniche

## Scompenso cardiaco
- Indicazione: sospetto o diagnosi di scompenso, controllo della titolazione
- Urgenza: no
- Durata: 45'
- Dove: Ambulatorio
- Tempi: visita ed ecocardiogramma all'ingresso; poi controllo ogni 2-4 settimane durante la titolazione, ogni 3-6 mesi a terapia stabile
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: peso, pressione, congestione, classe NYHA
  2. ECG a riposo — sempre
  3. Ecocardiogramma — alla diagnosi e a ogni cambiamento clinico (frazione d'eiezione)
  4. Laboratorio — NT-proBNP, creatinina, potassio, emocromo, ferro
  5. Holter ECG 24h — se palpitazioni, sincope o sospetta aritmia
  6. RM cardiaca (esterna) — se l'eziologia resta aperta
- Nota: la titolazione dei quattro pilastri si segue con peso, pressione e potassio; il peso che sale di 2 kg in 3 giorni è un segnale da chiamare.
- Fonti: ESC 2021 scompenso cardiaco e aggiornamento 2023

## Fibrillazione atriale
- Indicazione: fibrillazione atriale di nuovo riscontro o nota, flutter
- Urgenza: no
- Durata: 45'
- Dove: Ambulatorio
- Tempi: valutazione entro 2 settimane dal riscontro; Holter di controllo a 3 e 12 mesi dopo un cambio di strategia
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: CHA₂DS₂-VA, sanguinamento, sintomi, scelta ritmo o frequenza
  2. ECG a riposo — sempre
  3. Ecocardiogramma — sempre (atrio sinistro, valvole, funzione ventricolare)
  4. Laboratorio — creatinina, emocromo, TSH, funzione epatica prima dell'anticoagulazione
  5. Holter ECG 24h — carico aritmico e controllo della frequenza
  6. Ecocardiogramma transesofageo (esterno) — prima di una cardioversione se l'aritmia dura da più di 48 ore senza anticoagulazione documentata
  7. Cardioversione o ablazione (esterna) — secondo la strategia di ritmo
- Nota: l'anticoagulazione si decide sul rischio tromboembolico, non sul tipo di fibrillazione.
- Fonti: ESC 2024 fibrillazione atriale

## Ipertensione arteriosa
- Indicazione: ipertensione di nuovo riscontro, resistente o da confermare
- Urgenza: no
- Durata: 30'
- Dove: Ambulatorio
- Tempi: Holter pressorio all'ingresso e a ogni cambio di terapia; visita ogni 6 mesi a valori controllati
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: misura in studio, rischio globale, danno d'organo
  2. Holter pressorio 24h — sempre alla diagnosi (conferma fuori dallo studio)
  3. ECG a riposo — sempre (ipertrofia, aritmie)
  4. Ecocardiogramma — se ECG alterato, ipertensione di lunga data o resistente
  5. Laboratorio — creatinina, potassio, sodio, glicemia, lipidi, albuminuria
  6. Duplex renale o screening secondario (esterno) — se resistente o insorgenza in età giovane
- Nota: la diagnosi si fa sulla misura fuori dallo studio; l'ipertensione da camice bianco non si tratta.
- Fonti: ESC 2024 pressione arteriosa elevata e ipertensione

## Valvulopatia
- Indicazione: stenosi o insufficienza valvolare nota o sospetta (soffio)
- Urgenza: no
- Durata: 45'
- Dove: Ambulatorio
- Tempi: sorveglianza ogni 6-12 mesi secondo la gravità; ogni 2-3 anni nelle forme lievi
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: sintomi, anche quelli che il paziente evita riducendo l'attività
  2. Ecocardiogramma — sempre: gravità, ventricolo, pressioni polmonari
  3. ECG a riposo — sempre
  4. Ergometria — nel paziente che si dice asintomatico con vizio serrato
  5. Laboratorio — NT-proBNP nelle forme severe
  6. Ecocardiogramma transesofageo, TAC o coronarografia (esterni) — prima di un intervento
- Nota: nel vizio severo asintomatico l'ergometria smaschera i sintomi.
- Fonti: ESC/EACTS 2021 valvulopatie

## Sincope da chiarire
- Indicazione: perdita di coscienza transitoria, presincope ripetuta
- Urgenza: sì se sotto sforzo, con ECG alterato o cardiopatia nota
- Durata: 45'
- Dove: Ambulatorio
- Tempi: entro 7 giorni; Holter subito se l'ECG è anomalo
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: anamnesi dell'episodio, misura in piedi e sdraiato
  2. ECG a riposo — sempre
  3. Ecocardiogramma — se soffio, cardiopatia nota o ECG alterato
  4. Holter ECG 24h — se episodi frequenti o sospetta aritmia
  5. Ergometria — se la sincope è sotto sforzo o subito dopo
  6. Loop recorder o studio elettrofisiologico (esterno) — sincope inspiegata con cardiopatia
- Nota: sincope sotto sforzo o con ECG alterato ha precedenza assoluta.
- Fonti: ESC 2018 sincope

## Palpitazioni e aritmie
- Indicazione: palpitazioni, extrasistolia, tachicardia documentata o riferita
- Urgenza: sì se sincope associata, cardiopatia strutturale o familiarità per morte improvvisa
- Durata: 30'
- Dove: Ambulatorio
- Tempi: entro 2 settimane; urgente nei casi con bandiera rossa
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre
  2. ECG a riposo — sempre (preeccitazione, QT, ripolarizzazione)
  3. Holter ECG 24h — sempre; registratore più lungo se gli episodi sono rari
  4. Ecocardiogramma — se sospetta cardiopatia strutturale
  5. Ergometria — se le palpitazioni compaiono sotto sforzo
  6. RM cardiaca o studio elettrofisiologico (esterni) — aritmie ventricolari o cardiopatia sospetta
- Nota: la RM cerca la cicatrice: separa l'aritmia benigna dall'indicazione al defibrillatore.
- Fonti: ESC 2022 aritmie ventricolari e morte improvvisa; ESC 2019 tachicardie sopraventricolari

## Prevenzione e rischio cardiovascolare
- Indicazione: valutazione del rischio, familiarità, dislipidemia, diabete, fumo
- Urgenza: no
- Durata: 30'
- Dove: Ambulatorio
- Tempi: rivalutazione ogni 2 anni; annuale sopra i 60 anni o con familiarità
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: calcolo del rischio (AGLA / SCORE2) e colloquio sui fattori modificabili
  2. ECG a riposo — sempre
  3. Laboratorio — lipidi, glicemia, HbA1c, creatinina, Lp(a) una volta nella vita
  4. Ergometria — se il rischio calcolato è intermedio o il paziente inizia un'attività intensa
  5. Duplex carotideo — se rischio intermedio, per riclassificare
  6. Ecocardiogramma — se ECG alterato o soffio
- Nota: il test da sforzo non è di routine nel rischio basso.
- Fonti: ESC 2021 prevenzione; AGLA (Gruppo di lavoro svizzero lipidi e aterosclerosi)

## Cardiomiopatia e familiarità
- Indicazione: cardiomiopatia nota o sospetta, parente di primo grado di un caso
- Urgenza: no
- Durata: 60'
- Dove: Ambulatorio
- Tempi: ecocardiogramma e RM alla diagnosi; rivalutazione annuale con ecocardiogramma; screening dei familiari di primo grado
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: albero familiare a tre generazioni
  2. ECG a riposo — sempre
  3. Ecocardiogramma — sempre
  4. Holter ECG 24h — sempre alla diagnosi (aritmie, rischio di morte improvvisa)
  5. RM cardiaca (esterna) — alla diagnosi (tessuto, cicatrice)
  6. Test genetico e consulenza (esterni) — secondo fenotipo
- Nota: nelle forme familiari il percorso si estende ai parenti di primo grado con ECG ed ecocardiogramma.
- Fonti: ESC 2023 cardiomiopatie

## Controllo dopo ricovero
- Indicazione: dimissione dopo infarto, PCI, bypass, ricovero per scompenso o aritmia
- Urgenza: no
- Durata: 45'
- Dove: Ambulatorio
- Tempi: prima visita entro 2-4 settimane dalla dimissione; poi secondo il percorso della malattia di base
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: lettera di dimissione, terapia, aderenza, riabilitazione avviata
  2. ECG a riposo — sempre
  3. Ecocardiogramma — a 6-12 settimane dopo infarto (funzione ventricolare per la decisione sul defibrillatore)
  4. Laboratorio — lipidi a 4-6 settimane per il bersaglio di LDL
  5. Ergometria — a fine riabilitazione o prima della ripresa dell'attività
- Nota: la lettera di dimissione va nella cartella prima della visita; la terapia della dimissione è quella da cui si parte.
- Fonti: ESC 2023 sindromi coronariche acute; ESC 2021 prevenzione

## Idoneità sportiva e valutazione pre-operatoria
- Indicazione: certificato di idoneità, valutazione del rischio prima di un intervento non cardiaco
- Urgenza: no
- Durata: 45'
- Dove: Ambulatorio
- Tempi: secondo la data dell'intervento o della competizione
- Stato: proposta
- Prestazioni:
  1. Visita cardiologica — sempre: capacità funzionale, rischio dell'intervento, sintomi
  2. ECG a riposo — sempre
  3. Ecocardiogramma — se soffio, sintomi, cardiopatia nota o ECG alterato
  4. Ergometria — sport intenso sopra i 35 anni o con fattori di rischio; chirurgia a rischio alto con capacità funzionale bassa
  5. Laboratorio — NT-proBNP e troponina prima di chirurgia a rischio alto nei pazienti a rischio
- Nota: la capacità funzionale in MET decide gran parte della valutazione pre-operatoria.
- Fonti: ESC 2022 valutazione cardiovascolare in chirurgia non cardiaca; ESC 2020 cardiologia dello sport
