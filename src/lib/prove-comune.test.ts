// Le lettere della cartella comune (22.10.2026): regole pure. Nomi e date INVENTATI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbinaCartella, cartellaDiPaziente, categoriaDi, dataDaNomeFile, dateNelTesto, formatoLettera, nascitaProposta, nomeDaCartella, stessaLettera, tocca } from './comune/regole';

const P = [
  { id: 'a', cognome: 'Prova', nome: 'Alda', data_nascita: '1950-03-12' },
  { id: 'b', cognome: 'Finti', nome: 'Bruno Carlo', data_nascita: '1961-11-02' },
  { id: 'c', cognome: 'Doppi', nome: 'Ugo', data_nascita: '1940-01-01' },
  { id: 'd', cognome: 'Doppi', nome: 'Ugo', data_nascita: '1970-05-05' },
  { id: 'e', cognome: 'Senza', nome: 'Data', data_nascita: null },
];
const nomi = new Set(['alda prova', 'bruno carlo finti', 'doppi ugo']);

test('comune: il nome della cartella, con la data se c’è', () => {
  assert.deepEqual(nomeDaCartella('Prova Alda (12.03.1950)'), { nome: 'Prova Alda', nascita: '1950-03-12' });
  assert.deepEqual(nomeDaCartella('Finti_Bruno_Carlo'), { nome: 'Finti Bruno Carlo', nascita: null });
  assert.equal(nomeDaCartella('Prova Alda_12.03.1950 Dr').nascita, '1950-03-12');
});

test('comune: quali cartelle sono di un paziente (a ogni livello), quali contenitori', () => {
  assert.equal(cartellaDiPaziente('Prova Alda', true, nomi), true);                 // nome conosciuto, anche con sottocartelle
  assert.equal(cartellaDiPaziente('Ignoto Mario', false, nomi), true);              // foglia con cognome e nome
  assert.equal(cartellaDiPaziente('Ignoto Mario', true, nomi), false);              // con sottocartelle e senza data: contenitore
  assert.equal(cartellaDiPaziente('Ignoto Mario 12.03.50', true, nomi), true);      // con la data
  assert.equal(cartellaDiPaziente('Prova 12.03.1950', true, nomi), true);           // cognome e data
  assert.equal(cartellaDiPaziente('Esami 2015', true, nomi), false);
  assert.equal(cartellaDiPaziente('Archivio', false, nomi), false);
  assert.equal(cartellaDiPaziente('12.03.2024', false, nomi), false);
});

test('comune: le date del testo, anche con l’anno a due cifre e con gli spazi', () => {
  const d = dateNelTesto('Paziente\nProva Alda – 12.03.1950\nLugano, 3/4/24 e 31. 12. 2023; non 99.99.1999, non 1.2.3.2020');
  assert.ok(d.includes('1950-03-12'));
  assert.ok(d.includes('2024-04-03') && d.includes('1924-04-03'));
  assert.ok(d.includes('2023-12-31'));
  assert.ok(!d.some((x) => x.endsWith('1999')));
  assert.ok(!d.includes('2020-03-02') && !d.includes('2020-02-03'));
});

test('comune: abbinamento severo — nome della cartella E data di nascita, una persona sola', () => {
  assert.deepEqual(abbinaCartella('Prova Alda', ['1950-03-12', '2024-05-01'], P), { id: 'a', motivo: 'abbinato' });
  assert.deepEqual(abbinaCartella('Alda Prova', ['1950-03-12'], P), { id: 'a', motivo: 'abbinato' });        // ordine qualunque
  assert.deepEqual(abbinaCartella('Prova Alda', ['2024-05-01'], P), { id: null, motivo: 'nascita_non_trovata' });
  assert.deepEqual(abbinaCartella('Prova Alda (12.03.1950)', [], P), { id: 'a', motivo: 'abbinato' });       // data nel nome
  assert.deepEqual(abbinaCartella('Prova Alda (01.01.1999)', [], P), { id: null, motivo: 'nascita_diversa' });
  assert.deepEqual(abbinaCartella('Prova Alda 01.06.2024', ['1950-03-12'], P), { id: 'a', motivo: 'abbinato' }); // data dell'esame nel nome, nascita nel testo
  assert.deepEqual(abbinaCartella('Doppi Ugo', ['1970-05-05'], P), { id: 'd', motivo: 'abbinato' });
  assert.deepEqual(abbinaCartella('Doppi Ugo', ['1940-01-01', '1970-05-05'], P), { id: null, motivo: 'omonimi' });
  assert.deepEqual(abbinaCartella('Doppi Ugo', [], P), { id: null, motivo: 'omonimi' });
  assert.deepEqual(abbinaCartella('Ignoto Mario', ['1950-03-12'], P), { id: null, motivo: 'nessuno' });
  assert.deepEqual(abbinaCartella('Senza Data', ['1950-03-12'], P), { id: null, motivo: 'nascita_non_trovata' });
  assert.deepEqual(abbinaCartella('Prova 12.03.1950', [], P), { id: 'a', motivo: 'abbinato' });              // solo cognome + data intera
  assert.deepEqual(abbinaCartella('Prova', ['1950-03-12'], P), { id: null, motivo: 'senza_nome' });          // solo cognome: non basta la data nel testo
  assert.deepEqual(abbinaCartella('Finti Bruno Carlo', ['1961-11-02'], P), { id: 'b', motivo: 'abbinato' });
});

test('comune: la data di nascita da proporre, solo accanto a «nato/a» o al nome', () => {
  assert.equal(nascitaProposta('Concerne: Ignoto Mario, nato il 4.7.1955\nLugano, 01.02.2024', 'Ignoto Mario'), '1955-07-04');
  assert.equal(nascitaProposta('Lugano, 01.02.2024\nPaziente\nIgnoto Mario – 04.07.1955', 'Ignoto Mario'), '1955-07-04');
  assert.equal(nascitaProposta('Lugano, 01.02.2024\nEsame del 03.02.2024', 'Ignoto Mario'), null);
});

test('comune: quali file sono lettere, la data dal nome del file, la categoria', () => {
  assert.equal(formatoLettera('24 05 12 Prova Alda.docx'), 'docx');
  assert.equal(formatoLettera('L1234.DOC'), 'doc');
  assert.equal(formatoLettera('lettera.pdf'), 'pdf');
  for (const n of ['~$ttera.docx', '.DS_Store', 'Thumbs.db', 'modello.dot', 'modello.dotm', 'foto.png']) assert.equal(formatoLettera(n), null, n);
  assert.equal(dataDaNomeFile('24 05 12 Prova Alda.docx'), '2024-05-12');
  assert.equal(dataDaNomeFile('24.05.12 Prova Alda.docx'), '2024-05-12');
  assert.equal(dataDaNomeFile('2023 11 30 Prova.docx'), '2023-11-30');
  assert.equal(dataDaNomeFile('24 13 40 Prova.docx'), null);
  assert.equal(dataDaNomeFile('Prova Alda 2024.docx'), null);
  assert.equal(categoriaDi('Rapporti_Moccetti'), 'lettera');
  assert.equal(categoriaDi('Esami_II livello'), 'referto');
});

test('comune: il PDF che è la stessa lettera del Word', () => {
  const w = Array.from({ length: 60 }, (_, i) => `parola${i}`).join(' ');
  assert.equal(stessaLettera(w, `Studio di prova Via Finta 1 ${w} Pagina 1`), true);
  assert.equal(stessaLettera(w, Array.from({ length: 60 }, (_, i) => `altra${i}`).join(' ')), false);
  assert.equal(stessaLettera('corta lettera', 'corta lettera'), false);
});

test('comune: il controllo tocca alle 2 di notte, o subito se resta lavoro', () => {
  const d = (s: string) => new Date(s);
  assert.equal(tocca(d('2026-10-22T10:00:00'), null, false), true);
  assert.equal(tocca(d('2026-10-22T10:00:00'), d('2026-10-22T02:05:00'), false), false);
  assert.equal(tocca(d('2026-10-22T10:00:00'), d('2026-10-21T23:00:00'), false), true);
  assert.equal(tocca(d('2026-10-22T01:00:00'), d('2026-10-21T02:30:00'), false), false);
  assert.equal(tocca(d('2026-10-22T10:00:00'), d('2026-10-22T09:00:00'), true), true);
});
