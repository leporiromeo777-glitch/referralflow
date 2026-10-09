# Dividi cartella

Che cosa è vero oggi (9.10.2026). Una cartella completa arriva spesso come **un PDF solo** — la cartella cartacea scansionata, l'esportazione di un altro programma — con dentro lettere, referti, laboratori, ECG. La pagina **Dividi cartella** (menu «Clinico», sotto Documenti) la separa nei suoi documenti, **ognuno un PDF a sé nella cartella del paziente**. L'originale resta com'è.

## Come si usa

1. **Il PDF e di chi è, in qualunque ordine.** Si può **trascinare subito il PDF**, anche di un paziente che in ReferralFlow **non c'è ancora**: il file aspetta nel browser, dalle prime dodici pagine si leggono nome e data di nascita (`leggiPaziente`: righe «Concerne: Signora …, nata il …», «Paziente: …», «Data di nascita: …»; vince il nome scritto più volte) e
   - se combaciano con **una persona sola** già in piattaforma, la pagina la propone («È …: usa la sua cartella»);
   - se no mostra cognome, nome e data di nascita **già scritti, da controllare** (cognome e nome possono essere scambiati) e «Crea la cartella e continua»; se il PDF non ha testo, i tre campi si scrivono a mano;
   - oppure si cerca a mano qualcuno che c'è già.
   Finché non si conferma di chi è, sul server non arriva né il file né un paziente nuovo; il testo delle pagine serve solo a quella proposta e non resta da nessuna parte. Se la persona esiste già con gli stessi tre dati si usa la sua cartella: mai un doppione.
   In alternativa si parte dal paziente (cercato per cognome) e gli si carica il PDF o se ne prende uno già nella sua cartella.
2. **Il file** (fino a 50 MB) entra nella cartella come documento «cartella completa, da dividere»; se è una scansione senza testo va in coda per l'OCR come ogni altro documento.
3. **La proposta**: la piattaforma mostra i documenti trovati, ognuno con le miniature delle sue pagine, il tipo, la data e il nome proposti.
4. **Si corregge**: ✂ fra due pagine taglia; «Unisci al precedente» incolla; «Lascia fuori» esclude le pagine bianche o doppie; tipo, data e nome si riscrivono (finché il nome è quello proposto segue tipo e data). Una pagina si apre in grande con un clic, e da lì si scorre con le frecce e si taglia o si unisce.
5. **«Crea N documenti»**: nascono nella cartella del paziente, col tipo scelto e la nota «dalla cartella completa, pagine a–b». Si aprono, si scaricano uno per uno o **tutti in uno .zip**.

## Chi decide i tagli

**Regole, non un modello** (`src/lib/dividi/tagli.ts`, puro): si misurano, danno lo stesso risultato a ogni giro, e il testo clinico non va da nessuna parte. Dal testo di ogni pagina:
- segnali di **inizio**: «pagina 1 di N» (+4), un saluto in cima («Egregio collega», «Sehr geehrter…») (+3), «Luogo, data» (+3), un titolo d'esame nelle prime tre righe (+3) o una parola come «referto» nelle prime otto (+2), un oggetto («Concerne:») (+2), la pagina scritta precedente che chiude coi saluti (+2), una data in cima (+1);
- segnali di **seguito**: «pagina 2 di N» (−6), una pagina quasi vuota — il retro del foglio — (resta col documento prima), una riga che comincia in minuscolo (−2);
- si taglia da **3 punti** in su; da 5 la proposta è «sicura», fra 3 e 4 è «da guardare»;
- la **stessa testata ripetuta** (un laboratorio di tre fogli) con lo stesso tipo e la stessa data non fa un documento per foglio;
- **tipo** dal titolo in cima (dimissione, consenso, laboratorio, Holter, prova da sforzo, ecocardiogramma, ECG, imaging), poi «lettera» se c'è un saluto, poi «referto», altrimenti «documento»; «ECG» scritto nel corpo di una lettera non ne fa un ECG;
- **data** da «Luogo, data», se no la prima in cima che non sia una data di nascita. Non si inventa: se non c'è, resta vuota.

Un PDF **senza testo** (scansione non ancora letta dall'OCR) è proposto come un pezzo solo, e la pagina lo dice: i tagli li mette la persona, o si riprova quando il Mac ha finito di leggerlo.

**La conferma è sempre di una persona.** Una regola che taglia male divide una lettera in due o ne incolla due: per questo niente nasce prima di «Crea».

## Il lato server

- `src/lib/dividi/server.ts`: testo pagina per pagina con `pdf-parse`, taglio con `qpdf` (le pagine si copiano tali e quali, testo OCR compreso), zip con `/usr/bin/zip` senza compressione. Tetto di 1500 pagine per volta e 300 documenti.
- Rotta `/api/prototipo/dividi` (GET `?paziente=`, GET `?documento=`, POST `crea`, POST `zip`, POST `chi` — di chi è un PDF, dal testo che manda il browser). Sezione `dividi` in `src/lib/permessi.ts`: la vedono gli stessi ruoli che vedono i Documenti (medico, aiuto medico, segreteria, amministrazione, tecnico).
- **Registro**: ogni proposta è una lettura dell'originale; ogni pezzo un caricamento («diviso da …»); alla conferma si annota **quanti documenti, quanti proposti e quanti rimasti uguali** — solo numeri, mai titoli né testo. È la misura con cui si giudicano le regole.
- In pagina (`bridge/16-dividi.js`) il PDF si apre una volta nel browser con pdf.js per le miniature; mentre si corregge si ridisegna solo l'elenco dei pezzi, non la pagina (che tornerebbe in cima a ogni clic). Niente si salva nel browser: ricaricando la pagina si riparte dalla proposta.

## Quello che non è stato misurato

Le regole sono state scritte e provate su testi **inventati**: non si leggono cartelle vere per metterle a punto. Quanto indovinano su una cartella vera dello studio — scansioni storte, timbri, fax, pagine scritte a mano — **non si sa ancora**; lo diranno i numeri del registro («proposti / rimasti uguali») dopo le prime cartelle. Se la proposta sbaglia spesso si ritoccano i pesi (e, se non basta, si prova il modello locale per i casi dubbi).

## Quello che ancora non c'è

- File oltre i 50 MB (vanno divisi prima).
- Riprendere una divisione lasciata a metà.
- Riordinare le pagine o ruotarle.
- Sostituire l'originale coi pezzi: resta in cartella, lo toglie chi vuole.

## Prove

`src/lib/prove-dividi.test.ts` (7, con la lettura del paziente dal PDF: cartella di otto pagine in quattro documenti con tipi e date, segnali, testata ripetuta, niente inventato, PDF senza testo, controllo dei pezzi confermati). `scripts/e2e/prova-dividi.ts` (7, sul demo con una cartella fatta con ghostscript): caricamento e proposta, permessi e intervalli sbagliati, creazione con una correzione, pezzi veri con le loro pagine e originale intatto, registro coi soli numeri, zip.
