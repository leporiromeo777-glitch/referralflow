// Ricerca nella cartella scansionata (28.9.2026). Cartelle e dettati inventati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaPagine, dateInFrase, etichettaRichiesta, richiesteDalDettato } from './cerca-in-cartella';

const OGGI = new Date('2026-09-28T10:00:00');

// Una cartella finta di 10 pagine: lettera 2023 (1-2), ECG 12.3.2024 (3-4),
// laboratorio agosto 2025 (5), lettera 2024 (6-7), ECG 2.2.2026 (8), 9-10 a mano (vuote).
const CARTELLA = [
  'Egregio collega, Lugano 14.06.2023. Vi riferisco del signor Esempio Finto, visto per dolore toracico.',
  'continua la valutazione clinica. terapia invariata. cordiali saluti',
  'ECG a 12 derivazioni del 12.03.2024 ritmo sinusale FC 68 PR 160 QRS 90 QTc 420',
  'derivazioni precordiali V1-V6 tracciato QRS stretto',
  'Laboratorio 21.08.2025 emocromo creatinina 88 colesterolo LDL 2.1 HbA1c 5.6',
  'Gentile collega, 03.10.2024 rapporto di dimissione dopo ricovero',
  'terapia alla dimissione e controlli',
  'Elektrokardiogramm 02.02.2026 Sinusrhythmus QRS schmal',
  '', '',
];

test('date dal dettato: numeri, mesi a parole, senza anno, solo anno', () => {
  assert.deepEqual(dateInFrase("allego l'ECG del 12.3.2024", OGGI), [{ g: 12, m: 3, a: 2024 }]);
  assert.deepEqual(dateInFrase('ECG del 12 marzo', OGGI), [{ g: 12, m: 3, a: 2026 }]);
  assert.deepEqual(dateInFrase('esami del sangue di ottobre', OGGI), [{ m: 10, a: 2025 }], 'ottobre non è ancora arrivato: l\'anno scorso');
  assert.deepEqual(dateInFrase('come da lettera del 2023', OGGI), [{ a: 2023 }]);
});

test('richieste: data o invito ad allegare; l\'ECG senza data è quello di oggi', () => {
  const r = richiesteDalDettato("Paziente visto oggi. All'ECG ritmo sinusale. Allego l'ECG del 12.3.2024 e gli esami del sangue di agosto 2025. Come da lettera del 2023.", [], OGGI);
  assert.deepEqual(r.map(etichettaRichiesta), ['ECG del 28.9.2026', 'ECG del 12.3.2024', 'Esami di laboratorio di agosto 2025', 'Lettera del 2023']);
  assert.deepEqual(richiesteDalDettato('Il paziente riferisce una lettera ricevuta.', [], OGGI), [], 'tipo senza data né invito: niente');
  assert.equal(richiesteDalDettato('Holter ECG del 5.5.2025 senza aritmie', [], OGGI)[0].tipo, 'holter', 'il più specifico');
});

test('trova le pagine giuste e dove finisce il documento', () => {
  const [ecg] = richiesteDalDettato("Allego l'ECG del 12.3.2024.", [], OGGI);
  assert.deepEqual(cercaPagine(CARTELLA, ecg).map((p) => [p.pagina_da, p.pagina_a]), [[3, 4]]);
  assert.ok(cercaPagine(CARTELLA, ecg)[0].motivi.includes('data 12.3.2024'));
  const [lab] = richiesteDalDettato('Allego gli esami del sangue di agosto 2025.', [], OGGI);
  assert.deepEqual(cercaPagine(CARTELLA, lab).map((p) => [p.pagina_da, p.pagina_a]), [[5, 5]]);
  const [ted] = richiesteDalDettato("L'ECG del 2.2.2026 era normale.", [], OGGI);
  assert.deepEqual(cercaPagine(CARTELLA, ted).map((p) => p.pagina_da), [8], 'ECG in tedesco');
  const [lett] = richiesteDalDettato('Come da lettera del 2023.', [], OGGI);
  assert.deepEqual(cercaPagine(CARTELLA, lett).map((p) => [p.pagina_da, p.pagina_a]), [[1, 2]]);
});

test('nulla da proporre: data che non c\'è, ECG di oggi, pagine a mano', () => {
  for (const frase of ["Allego l'ECG del 1.1.2020.", "All'ECG ritmo sinusale."]) {
    const [r] = richiesteDalDettato(frase, [], OGGI);
    assert.deepEqual(cercaPagine(CARTELLA, r), [], frase);
  }
});

test('la lettera che cita l\'eco non è l\'eco; senza data si propongono le pagine da eco (28.9.2026)', async () => {
  const { cercaSenzaData } = await import('./cerca-in-cartella');
  const cartella = [
    'Egregio collega, Lugano 20.03.2024. ecocardiogramma di marzo 2024 con frazione di eiezione conservata.',
    'seguito della lettera, cordiali saluti',
    'Ecocardiogramma transtoracico. FEVS 60%. TAPSE 22. frazione di eiezione normale. ventricolo sinistro',
    'Laboratorio emocromo',
  ];
  const [lett, eco] = richiesteDalDettato('Come da lettera del 20.3.2024. Ecocardiogramma di marzo 2024.', [], OGGI);
  const pl = cercaPagine(cartella, lett);
  assert.deepEqual(pl.map((p) => [p.pagina_da, p.pagina_a]), [[1, 2]]);
  const occupate = new Set([1, 2]);
  assert.deepEqual(cercaPagine(cartella, eco, occupate), [], 'fuori dalla lettera nessuna pagina ha eco e data');
  const sd = cercaSenzaData(cartella, eco, occupate);
  assert.deepEqual(sd.map((p) => [p.pagina_da, p.pagina_a, p.senza_data]), [[3, 3, true]]);
});
