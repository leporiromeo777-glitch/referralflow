import test from 'node:test';
import assert from 'node:assert/strict';
import { bloccoAllegato, citatoNelTesto, righeAllegato } from './referti-allegato-blocco';

test('blocco Allegato dalle note: solo note che chiedono di allegare, nota del documento prima del nome file, niente doppioni', () => {
  const note = [
    { nota: 'allega il duplex', riguardaDocumenti: true, candidati: [{ filename: 'duplex_2026-07-29.pdf', nota: 'duplex del 29.07.2026' }, { filename: 'altro.pdf' }] },
    { nota: 'allegare anche l\'eco', riguardaDocumenti: true, candidati: [{ filename: 'eco-da-sforzo.pdf', nota: null }] },
    { nota: 'allega di nuovo il duplex', riguardaDocumenti: true, candidati: [{ filename: 'x.pdf', nota: 'Duplex del 29.07.2026' }] },
    { nota: 'lettera per il dottor Bianchi', riguardaDocumenti: true, candidati: [{ filename: 'lettera.docx', nota: 'lettera del 21.07.2026', categoria: 'lettera' }] },
    { riguardaDocumenti: false, candidati: [{ filename: 'ignorato.pdf' }] },
    { nota: 'allega', riguardaDocumenti: true, candidati: [] },
  ];
  assert.deepEqual(righeAllegato(note), ['duplex del 29.07.2026', 'eco da sforzo']);
  assert.equal(bloccoAllegato(note), 'Allegato:\n-duplex del 29.07.2026\n-eco da sforzo');
  assert.equal(bloccoAllegato([]), '');
});

test('documenti citati nel testo: parole specifiche presenti, date facoltative, mai le lettere', () => {
  const testo = 'Il duplex carotideo del 29.07.2026 non mostra stenosi. L\'ecocardiogramma da sforzo (massimale) risulta negativo.';
  assert.equal(citatoNelTesto('duplex del 29.07.2026', testo), true);
  assert.equal(citatoNelTesto('ecocardiogramma da sforzo del 11.08.2026', testo), true);
  assert.equal(citatoNelTesto('holter del 01.01.2026', testo), false);
  assert.equal(citatoNelTesto('esame del 29.07.2026', testo), false);
  const cartella = [
    { filename: 'duplex.txt', nota: 'duplex del 29.07.2026', categoria: 'imaging' },
    { filename: 'eco.txt', nota: 'ecocardiogramma da sforzo del 11.08.2026', categoria: 'referto' },
    { filename: 'lettera.docx', nota: 'lettera del 21.07.2026', categoria: 'lettera' },
    { filename: 'holter-2025.pdf', nota: null, categoria: 'ecg' },
  ];
  assert.equal(bloccoAllegato([], testo, cartella), 'Allegato:\n-duplex del 29.07.2026\n-ecocardiogramma da sforzo del 11.08.2026');
});

// ---------- 26.9.2026: copia per conoscenza, ECG, inviante (dati inventati) ----------
import { bloccoCopiaConoscenza, copieDalCampo, copieDalDettato } from './referti-copia';
import { citaECG, eUnECG, scegliECG } from './referti-allegato-blocco';
import { nomeInviante, statoInviante } from './referti-inviante';

test('copia per conoscenza: dal dettato, con titoli, più nomi, niente falsi', () => {
  assert.deepEqual(copieDalDettato('Si invia copia al dottor Mario Rossi e alla dottoressa Anna Bianchi.'), ['Mario Rossi', 'Anna Bianchi']);
  assert.deepEqual(copieDalDettato('Rivedo il paziente fra sei mesi.', ['Per conoscenza al Dr. med. Luca Verdi']), ['Luca Verdi']);
  assert.deepEqual(copieDalDettato('p.c. Prof. Neri, Dr. Gialli'), ['Neri', 'Gialli']);
  assert.deepEqual(copieDalDettato('In copia anche al collega De Luca.'), ['De Luca']);
  for (const nessuno of ['Allego copia del referto precedente.', 'Consegnata copia alla paziente.', 'una copia dell\'ECG', 'copia alla signora Rossi']) {
    assert.deepEqual(copieDalDettato(nessuno), [], nessuno);
  }
  assert.deepEqual(copieDalDettato('copia al dottor Rossi. Copia al dottor Rossi.'), ['Rossi'], 'niente doppioni');
  assert.deepEqual(copieDalCampo('Mario Rossi; Anna Bianchi ;'), ['Mario Rossi', 'Anna Bianchi']);
  assert.equal(bloccoCopiaConoscenza([{ nome: 'Mario Rossi', indirizzo: 'Via Roma 1, 6900 Lugano' }, { nome: 'Anna Bianchi' }]),
    'Copia per conoscenza:\n-Mario Rossi, Via Roma 1, 6900 Lugano\n-Anna Bianchi');
  assert.equal(bloccoCopiaConoscenza([]), '');
});

test('ECG: citato nel testo, il documento giusto della cartella, mai uno vecchio', () => {
  assert.ok(citaECG('All\'ECG ritmo sinusale.'));
  assert.ok(citaECG('elettrocardiogramma nella norma'));
  assert.ok(!citaECG('ecografia addominale'), '«eco» non è ECG');
  const dettato = new Date('2026-09-20T10:00:00Z');
  const docs = [
    { id: 'vecchio', filename: 'ecg.pdf', categoria: 'ecg', uploaded_at: '2026-03-01T09:00:00Z' },
    { id: 'eco', filename: 'eco.pdf', categoria: 'imaging', nota: 'ecocardiogramma', uploaded_at: '2026-09-20T09:00:00Z' },
    { id: 'giusto', filename: 'scan.pdf', categoria: 'altro', nota: 'ECG a riposo', uploaded_at: '2026-09-19T09:00:00Z' },
    { id: 'prima', filename: 'ecg-2.pdf', categoria: 'ecg', uploaded_at: '2026-09-05T09:00:00Z' },
  ];
  assert.ok(eUnECG(docs[2]) && !eUnECG(docs[1]));
  assert.equal(scegliECG(docs, dettato)?.id, 'giusto', 'il più recente fra quelli adatti');
  assert.equal(scegliECG([docs[0], docs[1]], dettato), null, 'di marzo non si allega');
  assert.equal(scegliECG([{ id: 'dopo', filename: 'ecg.pdf', categoria: 'ecg', uploaded_at: '2026-09-22T08:00:00Z' }], dettato)?.id, 'dopo', 'caricato due giorni dopo va bene');
  assert.equal(bloccoAllegato([], '', [], ['ECG a riposo']), 'Allegato:\n-ECG a riposo');
});

test('inviante: collegato, ambiguo, nuovo, nessuno; il nome viene da campi o saluto', () => {
  const rubrica = [
    { id: '1', nome: 'Mattia Maggi', email: null, studio: null, specialita: null },
    { id: '2', nome: 'Stefano Maggi', email: null, studio: null, specialita: null },
    { id: '3', nome: 'Edy Massera', email: null, studio: null, specialita: null },
  ];
  assert.equal(statoInviante('Dr. med. Edy Massera', rubrica).riga?.id, '3');
  assert.equal(statoInviante('Dr. Maggi', rubrica).stato, 'ambiguo');
  assert.equal(statoInviante('Dr. Maggi', rubrica).candidati.length, 2);
  assert.equal(statoInviante('Dr. Luca Massera', rubrica).stato, 'ambiguo', 'cognome giusto, nome diverso: lo decide una persona');
  assert.equal(statoInviante('Dr. Carlo Nuovi', rubrica).stato, 'nuovo');
  assert.equal(statoInviante('', rubrica).stato, null);
  const campi = (m: Record<string, string>) => (k: string) => m[k] ?? '';
  assert.equal(nomeInviante('Testo qualsiasi.', campi({ medico_inviante: 'Dr. Rossi', medico_destinatario: 'Dr. Bianchi' })), 'Dr. Rossi');
});

test('inviante: il nome di battesimo del saluto non basta, e i medici dello studio non sono invianti', () => {
  const rubrica = [
    { id: 'f', nome: 'Michele Fiore', email: null, studio: null, specialita: null },
    { id: 'b', nome: 'Marco Bonomo', email: null, studio: null, specialita: null },
    { id: 'g', nome: 'Marco Grossi', email: null, studio: null, specialita: null },
    { id: 'd', nome: 'Deborah Moccetti Bernasconi', email: null, studio: null, specialita: null },
  ];
  const interni = [{ nome: 'Dr. med. Marco Moccetti', email: null, studio: null, specialita: null }];
  assert.equal(statoInviante('Michele', rubrica).stato, 'ambiguo', '«Caro Michele»: non si collega da solo');
  assert.deepEqual(statoInviante('Michele', rubrica).candidati.map((c) => c.id), ['f']);
  assert.deepEqual(statoInviante('Marco', rubrica).candidati.map((c) => c.id), ['b', 'g']);
  assert.equal(statoInviante('Fiore', rubrica).stato, 'collegato', 'il cognome da solo sì');
  assert.equal(statoInviante('Bernasconi', rubrica).riga?.id, 'd', 'anche il secondo cognome');
  assert.equal(statoInviante('Dr. Marco Moccetti', rubrica, interni).stato, null, 'chi detta non è l\'inviante');
  assert.equal(statoInviante('Dr. Moccetti', rubrica, interni).stato, 'ambiguo', 'medico dello studio E in rubrica: decide una persona');
  assert.equal(statoInviante('Dr. Moccetti', rubrica).stato, 'collegato', 'senza medici dello studio omonimi: Deborah');
});
