// Banco di «Dividi cartella» (9.10.2026, docs/wiki/Piattaforma/Dividi cartella.md): quanto indovina la
// proposta su una cartella INVENTATA di 21 pagine in cinque sezioni, con le sole regole e con il modello
// locale. Niente di vero: testi scritti apposta, coi casi che alle regole sfuggono (una lettera senza saluto
// né «Luogo, data», due appunti di giorni diversi, un referto che continua con un titolo in maiuscolo).
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/banco-dividi.ts [modello]
// Chiama il modello locale (Ollama sul Mac): nessun costo, niente esce. Non parte se la catena lavora.
import { chiediPagina, MODELLO } from '../src/lib/dividi/analisi';
import { catenaOccupata } from '../src/lib/esporta-grezze';
import { componi, estratti, pagineDaChiedere, type Risposta } from '../src/lib/dividi/sezioni';

const P = 'Bancoprova Carlo';
const r = (...x: string[]) => x.join('\n');
// [testo, comincia un documento?, data attesa del documento che comincia]
const PAGINE: [string, boolean, string | null][] = [
  ['', false, null],                                                                                                                                         // 1 separatore 01
  [r('Studio di Prova', 'Via Inventata 1 - 6900 Lugano', 'Lugano, 12 marzo 2019', `Concerne: Signor ${P}, nato il 03.04.1950`, 'Egregio collega,', 'ho rivisto il paziente per il controllo annuale. Riferisce di stare bene, non dispnea da sforzo, non dolori toracici, non palpitazioni.', 'Esame obiettivo: PA 135/80 mmHg, polso 64/min regolare, toni cardiaci netti, non soffi.'), true, '2019-03-12'],
  [r('ECG: ritmo sinusale, 64/min, asse normale, non turbe della ripolarizzazione.', 'Valutazione: situazione cardiologica stabile.', 'Procedere: prosegue la terapia in corso; controllo fra dodici mesi.', 'Con i migliori saluti', 'Dr. med. Inventato'), false, null],
  [r('Visita cardiologica del 20.10.2017', `Paziente: ${P}, 03.04.1950`, 'Motivo: controllo dopo impianto di defibrillatore.', 'Anamnesi intermedia: benessere soggettivo, nessuno shock erogato, attivita quotidiane senza limitazioni.', 'Farmaci: bisoprololo 5 mg, ramipril 5 mg, atorvastatina 40 mg.'), true, '2017-10-20'],
  [r('Controllo del dispositivo: batteria in ordine, soglie stabili, nessun episodio registrato.', 'Terapia: invariata.', 'Procedere: prossimo controllo fra sei mesi con ecocardiografia.', 'Dr. med. Inventato'), false, null],
  [r('Istituto Cardiologico di Prova', 'Ecocardiografia transtoracica', 'Data esame: 23.03.2018', `${P} 03.04.1950`, 'Ventricolo sinistro lievemente dilatato, funzione sistolica moderatamente ridotta (FE 40%).', 'Insufficienza mitralica lieve. Pressioni polmonari nella norma.'), true, '2018-03-23'],
  [r('Centro Cardiologico di Prova', 'Dr. med. Inventato', '', 'Al medico curante', 'Dr. med. Altro Inventato', '', '9 novembre 2022', '', `Paziente: ${P}, 03.04.1950`, 'Diagnosi:', '- cardiopatia dilatativa con funzione sistolica moderatamente ridotta', '- portatore di defibrillatore biventricolare', 'Anamnesi: da alcune settimane lamenta affaticabilita e lieve dispnea salendo le scale.'), true, '2022-11-09'],
  [r('Valutazione', 'La situazione clinica e nel complesso stabile; la lieve dispnea e verosimilmente legata a un sovraccarico di volume.', 'Proposta: aumento del diuretico per dieci giorni, controllo del peso, controllo clinico fra un mese.', 'Cordiali saluti', 'Dr. med. Inventato'), false, null],
  ['', false, null],                                                                                                                                         // 9 separatore 02
  [r('Ospedale Regionale di Prova', 'Servizio di cardiologia', 'Lettera di dimissione', `Paziente: ${P}, nato il 03.04.1950`, 'Degenza dal 29.07.2017 al 04.08.2017', 'Diagnosi principale: scompenso cardiaco acuto su cardiopatia dilatativa.', 'Diagnosi secondarie: ipertensione arteriosa, dislipidemia.'), true, '2017-07-29'],
  [r('Decorso', 'Il paziente e stato ricoverato per dispnea ingravescente. Sotto terapia diuretica endovenosa si e osservato un rapido miglioramento clinico con calo ponderale di quattro chili.', 'Durante la degenza e stato impiantato un defibrillatore biventricolare senza complicazioni.'), false, null],
  [r('Terapia alla dimissione', 'Torasemide 10 mg 1-0-0', 'Bisoprololo 5 mg 1-0-0', 'Ramipril 5 mg 1-0-1', 'Procedere: controllo presso il cardiologo curante entro due settimane.', 'Distinti saluti', 'Dr. med. Terzo Inventato, capoclinica'), false, null],
  [r('Ospedale Regionale di Prova', 'Pronto soccorso', 'Bellinzona, 16.09.2021', 'Egregio collega,', `abbiamo visto il signor ${P} in pronto soccorso per un episodio di cardiopalmo regredito spontaneamente.`, 'ECG e troponine nella norma. Dimesso a domicilio con consiglio di controllo cardiologico.', 'Con stima', 'Dr. med. Quarto Inventato'), true, '2021-09-16'],
  ['', false, null],                                                                                                                                         // 14 separatore 03
  [r('01.04.2022', 'visita: sta bene, nessun disturbo, peso stabile 78 kg', 'PA 128/76, polso 60 regolare', 'continua terapia, ricontrollo in maggio con ECG'), true, '2022-04-01'],
  [r('12.05.2022', 'telefonata della moglie: da tre giorni capogiri al mattino, nessuna sincope', 'ridurre ramipril a 2,5 mg la sera, richiamare se persiste', 'fissato controllo'), true, '2022-05-12'],
  ['', false, null],                                                                                                                                         // 17 separatore 04
  [r('ECG 12 derivazioni', '01.04.2022 10:32', 'FC 62/min  PR 164 ms  QRS 148 ms  QT 432 ms', 'Ritmo sinusale con stimolazione biventricolare'), true, '2022-04-01'],
  [r('ECG 12 derivazioni', '12.05.2022 09:15', 'FC 70/min  PR 160 ms  QRS 146 ms  QT 420 ms', 'Ritmo sinusale con stimolazione biventricolare'), true, '2022-05-12'],
  [r('ECG 12 derivazioni', '12.05.2022 09:15', 'Striscia del ritmo derivazione II, 25 mm/s', 'Ritmo sinusale con stimolazione biventricolare'), false, null],
  ['', false, null],                                                                                                                                         // 21 separatore 05
  [r('Holter ECG 24 ore', 'Registrazione del 18.10.2023', `Paziente: ${P}`, 'FC media 68/min, minima 49/min, massima 121/min', 'Extrasistoli ventricolari isolate: 212'), true, '2023-10-18'],
  [r('Eventi', 'Nessuna pausa superiore a 2,5 secondi. Nessuna tachicardia ventricolare sostenuta.', 'Conclusione: registrazione senza aritmie di rilievo.', 'Dr. med. Inventato'), false, null],
  [r('Misurazione della pressione arteriosa nelle 24 ore', 'Data: 30.03.2022', 'Media delle 24 ore 126/74 mmHg, media diurna 131/78 mmHg, media notturna 114/66 mmHg', 'Calo notturno conservato.'), true, '2022-03-30'],
];
const SEP = [{ pagina: 1, codice: '990000' }, { pagina: 9, codice: '990001' }, { pagina: 14, codice: '990002' }, { pagina: 17, codice: '990003' }, { pagina: 21, codice: '990004' }];

function misura(nome: string, risposte: Record<number, Risposta>) {
  const testi = PAGINE.map((x) => x[0]);
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
  console.log(`${nome}: documenti interi ${interi} su ${tagliDaFare} · inizi trovati ${tagliGiusti} su ${tagliDaFare} · tagli di troppo ${tagliInPiu} · date giuste ${dateGiuste} su ${dateDaTrovare} (sbagliate ${dateSbagliate})`);
  return pezzi;
}

(async () => {
  const modello = process.argv[2] || MODELLO;
  misura('solo regole    ', {});
  if (modello === 'spento') return;
  if (await catenaOccupata()) { console.log('La catena dei referti lavora: il banco col modello si rimanda.'); return; }
  const testi = PAGINE.map((x) => x[0]);
  const risposte: Record<number, Risposta> = {};
  const t0 = Date.now(); let mute = 0;
  const da = pagineDaChiedere(testi, SEP);
  for (const n of da) { const x = await chiediPagina(estratti(testi, SEP, n), modello); if (x) risposte[n] = x; else mute++; }
  const pezzi = misura(`regole + ${modello}`, risposte);
  console.log(`${da.length} pagine chieste, ${mute} senza risposta, ${((Date.now() - t0) / 1000 / da.length).toFixed(1)} s a pagina`);
  console.log(pezzi.map((x) => `  ${x.cartella} · ${x.da}-${x.a} · ${x.titolo}${x.sicurezza === 'media' ? ' (da guardare)' : ''}`).join('\n'));
})();
