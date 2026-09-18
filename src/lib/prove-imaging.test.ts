import test from 'node:test';
import assert from 'node:assert/strict';
import { abbinaPaziente, etichetta, finestreDi, raggruppa, slugNome, type MetaMinima } from './imaging-ordina';

const base: MetaMinima = {
  study_uid: 'S1', series_uid: 'SE1', sop_uid: 'I1', modalita: 'ct', data_esame: '2026-09-11',
  descrizione_esame: 'TAC torace', descrizione_serie: 'assiale', numero_serie: 1, numero_immagine: 1,
  paziente_nome: 'Rossi Mario', paziente_nascita: '1960-05-12', righe: 512, colonne: 512, frame: 1, immagine: true,
};
const m = (x: Partial<MetaMinima>): MetaMinima => ({ ...base, ...x });

test('imaging: i file sciolti si raggruppano per esame e per serie, in ordine di apparecchio', () => {
  // arrivano mescolati, come da un CD
  const e = raggruppa([
    { indice: 0, meta: m({ sop_uid: 'I3', numero_immagine: 3 }) },
    { indice: 1, meta: m({ sop_uid: 'I1', numero_immagine: 1 }) },
    { indice: 2, meta: m({ series_uid: 'SE2', numero_serie: 2, sop_uid: 'J1', descrizione_serie: 'coronale' }) },
    { indice: 3, meta: m({ sop_uid: 'I2', numero_immagine: 2 }) },
    { indice: 4, meta: m({ study_uid: 'S2', series_uid: 'SE9', sop_uid: 'K1', modalita: 'mr' }) },
  ]);
  assert.equal(e.length, 2);
  const uno = e.find((x) => x.study_uid === 'S1')!;
  assert.deepEqual(uno.serie.map((s) => s.serie_uid), ['SE1', 'SE2']);
  assert.deepEqual(uno.serie[0].immagini.map((i) => i.sop_uid), ['I1', 'I2', 'I3']);
  assert.equal(uno.n_immagini, 4);
  assert.equal(uno.modalita, 'CT');
});

test('imaging: lo stesso file importato due volte non diventa due immagini', () => {
  const e = raggruppa([
    { indice: 0, meta: m({}) },
    { indice: 1, meta: m({}) },
  ]);
  assert.equal(e[0].n_immagini, 1);
});

test('imaging: un file senza i tre identificativi non entra', () => {
  const e = raggruppa([
    { indice: 0, meta: m({ study_uid: '' }) },
    { indice: 1, meta: m({ series_uid: '' }) },
    { indice: 2, meta: m({ sop_uid: '' }) },
  ]);
  assert.equal(e.length, 0);
});

test('imaging: un esame con più modalità le elenca tutte', () => {
  const e = raggruppa([
    { indice: 0, meta: m({}) },
    { indice: 1, meta: m({ series_uid: 'SE2', sop_uid: 'J1', modalita: 'sr' }) },
  ]);
  assert.equal(e[0].modalita, 'CT, SR');
});

test('imaging: senza descrizione l’etichetta la fanno modalità e parte del corpo', () => {
  assert.equal(etichetta(m({})), 'TAC torace');
  assert.equal(etichetta(m({ descrizione_esame: '', parte_corpo: 'HEAD' })), 'HEAD');
  assert.equal(etichetta(m({ descrizione_esame: '', parte_corpo: '' })), 'CT');
});

// L'abbinamento è la parte pericolosa: attaccare le immagini al paziente
// sbagliato è il danno peggiore che questa pagina possa fare.
test('imaging: si abbina solo con nome E data di nascita, e mai fra omonimi', () => {
  const P = [
    { id: 'a', cognome: 'Rossi', nome: 'Mario', data_nascita: '1960-05-12' },
    { id: 'b', cognome: 'Rossi', nome: 'Mario', data_nascita: '1975-01-30' },
    { id: 'c', cognome: 'Bianchi', nome: 'Luisa', data_nascita: '1950-03-03' },
  ];
  assert.deepEqual(abbinaPaziente('Rossi Mario', '1960-05-12', P), { id: 'a', motivo: 'abbinato' });
  // due omonimi, nessuna data nel file: non si sceglie
  assert.deepEqual(abbinaPaziente('Rossi Mario', '', P), { id: null, motivo: 'omonimi' });
  // data che non corrisponde a nessuno dei due: non si forza
  assert.deepEqual(abbinaPaziente('Rossi Mario', '1999-09-09', P), { id: null, motivo: 'nascita_diversa' });
  // un solo omonimo ma senza data nel file: resta da verificare
  assert.deepEqual(abbinaPaziente('Bianchi Luisa', '', P), { id: null, motivo: 'nascita_diversa' });
  assert.deepEqual(abbinaPaziente('Verdi Anna', '1960-05-12', P), { id: null, motivo: 'nessuno' });
  assert.deepEqual(abbinaPaziente('', '1960-05-12', P), { id: null, motivo: 'senza_nome' });
});

test('imaging: il nome del DICOM combacia anche se invertito o accentato', () => {
  assert.equal(slugNome('ROSSI^MARIO'), slugNome('Mario Rossi'));
  assert.equal(slugNome('Tamò Gianni'), slugNome('gianni tamo'));
});

test('imaging: le finestre sono quelle della modalità, e non si inventano', () => {
  assert.equal(finestreDi('CT').length, 5);
  assert.equal(finestreDi('CT, SR')[1].nome, 'Polmone');
  assert.deepEqual(finestreDi('MR'), []);
  assert.deepEqual(finestreDi('boh'), []);
});
