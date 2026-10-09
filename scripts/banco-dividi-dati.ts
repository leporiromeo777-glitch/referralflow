// La cartella INVENTATA dei banchi di «Dividi cartella» (31 pagine, cinque sezioni, quindici documenti) e la sua misura.
// Niente di vero: testi scritti apposta. La usano banco-dividi.ts (regole contro modello) e banco-dividi-velocita.ts.
import { componi, type Risposta } from '../src/lib/dividi/sezioni';

export const P = 'Bancoprova Carlo';
const r = (...x: string[]) => x.join('\n');
// [testo, comincia un documento?, data attesa del documento che comincia]
export const PAGINE: [string, boolean, string | null][] = [
  ['', false, null],                                                                                                                                         // 1 separatore 01
  [r('Studio di Prova', 'Via Inventata 1 - 6900 Lugano', '\t\tLugano, 12 marzo 2019', `\t\tConcerne: Signor ${P}, nato il 03.04.1950`, 'Egregio collega,', 'ho rivisto il paziente per il controllo annuale. Riferisce di stare bene, non dispnea da sforzo, non dolori toracici, non palpitazioni.', 'Esame obiettivo: PA 135/80 mmHg, polso 64/min regolare, toni cardiaci netti, non soffi.'), true, '2019-03-12'],
  [r('ECG: ritmo sinusale, 64/min, asse normale, non turbe della ripolarizzazione.', 'Valutazione: situazione cardiologica stabile.', 'Procedere: prosegue la terapia in corso; controllo fra dodici mesi.', 'Con i migliori saluti', 'Dr. med. Inventato'), false, null],
  [r('Visita cardiologica del 20.10.2017', `Paziente: ${P}, 03.04.1950`, 'Motivo: controllo dopo impianto di defibrillatore.', 'Anamnesi intermedia: benessere soggettivo, nessuno shock erogato, attivita quotidiane senza limitazioni.', 'Farmaci: bisoprololo 5 mg, ramipril 5 mg, atorvastatina 40 mg.'), true, '2017-10-20'],
  [r('Controllo del dispositivo: batteria in ordine, soglie stabili, nessun episodio registrato.', 'Terapia: invariata.', 'Procedere: prossimo controllo fra sei mesi con ecocardiografia.', 'Dr. med. Inventato'), false, null],
  [r('Istituto Cardiologico di Prova', 'Ecocardiografia transtoracica', 'Data esame: 23.03.2018', `${P} 03.04.1950`, 'Ventricolo sinistro lievemente dilatato, funzione sistolica moderatamente ridotta (FE 40%).', 'Insufficienza mitralica lieve. Pressioni polmonari nella norma.'), true, '2018-03-23'],
  [r('Centro Cardiologico di Prova', 'Dr. med. Inventato', '', 'Al medico curante', 'Dr. med. Altro Inventato', '', '\t\t9 novembre 2022', '', `\t\tPaziente: ${P}, 03.04.1950`, 'Referto', 'Diagnosi:', '- cardiopatia dilatativa con funzione sistolica moderatamente ridotta', '- portatore di defibrillatore biventricolare', 'Anamnesi: da alcune settimane lamenta affaticabilita e lieve dispnea salendo le scale.'), true, '2022-11-09'],
  [r('Valutazione', 'La situazione clinica e nel complesso stabile; la lieve dispnea e verosimilmente legata a un sovraccarico di volume.', 'Proposta: aumento del diuretico per dieci giorni, controllo del peso, controllo clinico fra un mese.', 'Cordiali saluti', 'Dr. med. Inventato'), false, null],
  // Le pagine che ingannano: il seguito che RIPETE in alto intestazione, paziente e data (lettere di più fogli, referti, dimissioni).
  [r('Centro Cardiologico di Prova', 'Via Inventata 1 - 6900 Lugano - Tel. 091 000 00 00', 'Rapporto', '\t\tLugano, 4 novembre 2024', `\t\tConcerne: Signor ${P}, nato il 03.04.1950`, 'Egregio collega,', 'ho rivisto il paziente per il controllo semestrale del defibrillatore.', 'Diagnosi: cardiopatia dilatativa, portatore di defibrillatore biventricolare.', 'Anamnesi: benessere soggettivo, nessuno shock, cammina un ora al giorno senza disturbi.'), true, '2024-11-04'],
  [r('Centro Cardiologico di Prova', 'Via Inventata 1 - 6900 Lugano - Tel. 091 000 00 00', `\t\tPaziente: ${P}, 03.04.1950`, '\t\tLugano, 4 novembre 2024', 'Pagina 2', 'Esami: ECG con ritmo sinusale e stimolazione biventricolare. Ecocardiografia: funzione sistolica moderatamente ridotta, invariata.', 'Valutazione: decorso stabile.', 'Procedere: terapia invariata, controllo fra sei mesi.', 'Con i migliori saluti', 'Dr. med. Inventato'), false, null],
  [r('Istituto Cardiologico di Prova', 'Ecocardiografia transtoracica', 'Data esame: 13.11.2024', `${P} 03.04.1950`, 'Misure: diametro telediastolico 58 mm, setto 10 mm, parete posteriore 9 mm, atrio sinistro 42 mm.', 'Frazione di eiezione 42% (Simpson biplano).'), true, '2024-11-13'],
  [r('Istituto Cardiologico di Prova', 'Ecocardiografia transtoracica', 'Data esame: 13.11.2024', `${P} 03.04.1950`, 'Valvole: insufficienza mitralica lieve, aorta tricuspide con apertura conservata.', 'Conclusioni: funzione sistolica moderatamente ridotta, invariata rispetto al controllo precedente.', 'Dr.ssa med. Inventata'), false, null],
  ['', false, null],                                                                                                                                         // 9 separatore 02
  [r('Ospedale Regionale di Prova', 'Servizio di cardiologia', 'Lettera di dimissione', `Paziente: ${P}, nato il 03.04.1950`, 'Degenza dal 29.07.2017 al 04.08.2017', 'Diagnosi principale: scompenso cardiaco acuto su cardiopatia dilatativa.', 'Diagnosi secondarie: ipertensione arteriosa, dislipidemia.'), true, '2017-07-29'],
  [r('Decorso', 'Il paziente e stato ricoverato per dispnea ingravescente. Sotto terapia diuretica endovenosa si e osservato un rapido miglioramento clinico con calo ponderale di quattro chili.', 'Durante la degenza e stato impiantato un defibrillatore biventricolare senza complicazioni.'), false, null],
  [r('Terapia alla dimissione', 'Torasemide 10 mg 1-0-0', 'Bisoprololo 5 mg 1-0-0', 'Ramipril 5 mg 1-0-1', 'Procedere: controllo presso il cardiologo curante entro due settimane.', 'Distinti saluti', 'Dr. med. Terzo Inventato, capoclinica'), false, null],
  [r('Ospedale Regionale di Prova', 'Pronto soccorso', 'Bellinzona, 16.09.2021', 'Egregio collega,', `abbiamo visto il signor ${P} in pronto soccorso per un episodio di cardiopalmo regredito spontaneamente.`, 'ECG e troponine nella norma. Dimesso a domicilio con consiglio di controllo cardiologico.', 'Con stima', 'Dr. med. Quarto Inventato'), true, '2021-09-16'],
  [r('Ospedale Regionale di Prova - Servizio di medicina interna', `${P}, 03.04.1950 - Degenza 14.03.2022 - 21.03.2022`, 'Lettera di dimissione', 'Egregio collega,', 'le riferiamo del paziente sopra menzionato, ricoverato nel nostro servizio.', 'Diagnosi principale: polmonite del lobo inferiore destro.', 'Diagnosi secondarie: cardiopatia dilatativa nota, ipertensione arteriosa.'), true, '2022-03-14'],
  [r('Ospedale Regionale di Prova - Servizio di medicina interna', `${P}, 03.04.1950 - Degenza 14.03.2022 - 21.03.2022`, 'Decorso: sotto terapia antibiotica endovenosa rapido miglioramento dello stato generale e calo degli indici di flogosi.', 'Dal punto di vista cardiologico compenso stabile durante tutta la degenza.', 'Esami: radiografia del torace del 15.03.2022 con addensamento basale destro.'), false, null],
  [r('Ospedale Regionale di Prova - Servizio di medicina interna', `${P}, 03.04.1950 - Degenza 14.03.2022 - 21.03.2022`, 'Terapia alla dimissione: amoxicillina e acido clavulanico 1 g 1-0-1 fino al 24.03.2022, terapia cardiologica invariata.', 'Procedere: controllo clinico presso il curante fra una settimana.', 'Distinti saluti', 'Dr. med. Quinto Inventato'), false, null],
  ['', false, null],                                                                                                                                         // 14 separatore 03
  [r('01.04.2022', 'visita: sta bene, nessun disturbo, peso stabile 78 kg', 'PA 128/76, polso 60 regolare', 'continua terapia, ricontrollo in maggio con ECG'), true, '2022-04-01'],
  [r('12.05.2022', 'telefonata della moglie: da tre giorni capogiri al mattino, nessuna sincope', 'ridurre ramipril a 2,5 mg la sera, richiamare se persiste', 'fissato controllo'), true, '2022-05-12'],
  [r('riferisce anche gonfiore alle caviglie la sera, consigliate calze elastiche', 'pesarsi ogni mattina e segnare il peso, richiamare se aumenta di due chili', 'prossimo controllo con esami del sangue'), false, null],
  ['', false, null],                                                                                                                                         // 17 separatore 04
  [r('ECG 12 derivazioni', '01.04.2022 10:32', 'FC 62/min  PR 164 ms  QRS 148 ms  QT 432 ms', 'Ritmo sinusale con stimolazione biventricolare'), true, '2022-04-01'],
  [r('ECG 12 derivazioni', '12.05.2022 09:15', 'FC 70/min  PR 160 ms  QRS 146 ms  QT 420 ms', 'Ritmo sinusale con stimolazione biventricolare'), true, '2022-05-12'],
  [r('ECG 12 derivazioni', '12.05.2022 09:15', 'Striscia del ritmo derivazione II, 25 mm/s', 'Ritmo sinusale con stimolazione biventricolare'), false, null],
  [r('ECG 12 derivazioni', '12.05.2022 09:21', 'FC 71/min  PR 160 ms  QRS 146 ms  QT 418 ms', 'Controllo dopo riprogrammazione: stimolazione biventricolare regolare'), false, null],
  ['', false, null],                                                                                                                                         // 21 separatore 05
  [r('Holter ECG 24 ore', 'Registrazione del 18.10.2023', `Paziente: ${P}`, 'FC media 68/min, minima 49/min, massima 121/min', 'Extrasistoli ventricolari isolate: 212'), true, '2023-10-18'],
  [r('Eventi', 'Nessuna pausa superiore a 2,5 secondi. Nessuna tachicardia ventricolare sostenuta.', 'Conclusione: registrazione senza aritmie di rilievo.', 'Dr. med. Inventato'), false, null],
  [r('Holter ECG 24 ore', 'Registrazione del 18.10.2023', 'Tabella oraria: ora, FC minima, FC media, FC massima', '08:00  52  66  98', '09:00  55  70  104', '10:00  54  69  121', '11:00  53  67  99'), false, null],
  [r('Misurazione della pressione arteriosa nelle 24 ore', 'Data: 30.03.2022', 'Media delle 24 ore 126/74 mmHg, media diurna 131/78 mmHg, media notturna 114/66 mmHg', 'Calo notturno conservato.'), true, '2022-03-30'],
];
export const SEP = PAGINE.map((x, k) => (x[0] ? 0 : k + 1)).filter(Boolean).map((pagina, k) => ({ pagina, codice: `9900${String(k).padStart(2, '0')}` }));

export function misura(nome: string, risposte: Record<number, Risposta>, testi: string[] = PAGINE.map((x) => x[0]), zitto = false) {
  const pezzi = componi(testi, SEP, risposte, P).filter((x) => !x.foglio);
  const inizi = new Map(pezzi.map((x) => [x.da, x] as const));
  let tagliGiusti = 0, tagliDaFare = 0, tagliInPiu = 0, dateGiuste = 0, dateDaTrovare = 0, dateSbagliate = 0;
  PAGINE.forEach(([testo, nuovo, data], i) => {
    if (!testo) return;
    const p = inizi.get(i + 1);
    if (nuovo) { tagliDaFare++; if (p) tagliGiusti++; if (data) { dateDaTrovare++; if (p?.data === data) dateGiuste++; else if (p?.data) dateSbagliate++; } }
    else if (p) tagliInPiu++;
  });
  const interi = pezzi.filter((x) => PAGINE[x.da - 1][1] && (x.a === PAGINE.length || !PAGINE[x.a][0] || PAGINE[x.a][1])).length;
  if (!zitto) console.log(`${nome}: documenti interi ${interi} su ${tagliDaFare} · inizi trovati ${tagliGiusti} su ${tagliDaFare} · tagli di troppo ${tagliInPiu} · date giuste ${dateGiuste} su ${dateDaTrovare} (sbagliate ${dateSbagliate})`);
  return Object.assign(pezzi, { conto: { interi, daFare: tagliDaFare, inPiu: tagliInPiu, dateGiuste, dateDaTrovare, dateSbagliate } });
}

