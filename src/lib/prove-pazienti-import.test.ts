import test from 'node:test';
import assert from 'node:assert/strict';
import { analizzaCsvPazienti, normalizzaAvs, normalizzaData, validaAnagrafica } from './pazienti-import';

test('anagrafica: date e AVS normalizzati, errori sui campi sbagliati, cognome e nome obbligatori', () => {
  assert.equal(normalizzaData('31.12.1950'), '1950-12-31');
  assert.equal(normalizzaData('1/2/1960'), '1960-02-01');
  assert.equal(normalizzaData('1950-12-31T00:00:00'), '1950-12-31');
  assert.equal(normalizzaData('ieri'), null);
  assert.equal(normalizzaAvs('7561234567897'), '756.1234.5678.97');
  const v = validaAnagrafica({ cognome: ' Rossi ', nome: '', data_nascita: 'x', sesso: 'x', email: 'no', npa: '69', avs: '123' });
  assert.deepEqual(Object.keys(v.errori).sort(), ['avs', 'data_nascita', 'email', 'nome', 'npa', 'sesso']);
  assert.equal(v.dati.cognome, 'Rossi');
  const ok = validaAnagrafica({ cognome: 'Rossi', nome: 'Mario', data_nascita: '31.12.1950', sesso: 'm', email: 'M@X.ch', npa: '6900', avs: '756.1234.5678.97' });
  assert.deepEqual(ok.errori, {});
  assert.equal(ok.dati.sesso, 'M');
  assert.equal(ok.dati.email, 'm@x.ch');
});

test('csv pazienti: intestazioni riconosciute in italiano e tedesco, separatore ; con virgolette, colonne ignorate elencate', () => {
  const csv = '﻿Cognome;Vorname;Data di nascita;Telefono;AVS;Cassa malati;Note interne\n"Rossi; Bianchi";Mario;31.12.1950;+41 91 000 00 00;7561234567897;Helsana;bla\nVerdi;;;;;;\n';
  const r = analizzaCsvPazienti(csv);
  assert.deepEqual(r.colonne, ['cognome', 'nome', 'data_nascita', 'telefono', 'avs', 'assicurazione', null]);
  assert.deepEqual(r.ignorate, ['Note interne']);
  assert.equal(r.righe.length, 2);
  assert.equal(r.righe[0].dati.cognome, 'Rossi; Bianchi');
  assert.equal(r.righe[0].dati.avs, '756.1234.5678.97');
  assert.equal(r.righe[0].dati.data_nascita, '1950-12-31');
  assert.deepEqual(r.righe[0].errori, {});
  assert.equal(r.righe[1].errori.nome, 'Obbligatorio.');
  assert.equal(r.righe[1].n, 3);
});

test('csv pazienti: separatore virgola e tabulazione riconosciuti', () => {
  assert.equal(analizzaCsvPazienti('nome,cognome\nA,B').righe[0].dati.cognome, 'B');
  assert.equal(analizzaCsvPazienti('nome\tcognome\nA\tB').righe[0].dati.cognome, 'B');
});

// Il 31 febbraio non esiste: prima passava, e l'insert su una colonna `date`
// faceva saltare l'import a metà file senza dire quale riga.
test('anagrafica: una data impossibile non è una data', () => {
  assert.equal(normalizzaData('31.02.1950'), null);
  assert.equal(normalizzaData('45.13.1950'), null);
  assert.equal(normalizzaData('29.02.2023'), null);
  assert.equal(normalizzaData('29.02.2024'), '2024-02-29');
  // Excel in locale americano: mese e giorno scambiati, meglio niente che il 31° mese
  assert.equal(normalizzaData('12/31/1950'), null);
});

// L'esportazione dei pazienti di MediOnline (22.10.2026): titoli delle colonne come nel file vero, pazienti INVENTATI.
test('import pazienti: l’esportazione di MediOnline — data, sesso, AVS, telefono, cassa; note su più righe; un campo sbagliato non ferma il paziente', () => {
  const testa = ['Titolo', 'Intitolato lettera', 'Cognome', 'Agg. indirizzo', 'Nome', 'Via', 'NPA', 'Località', 'Tel. 1', 'N° tel. 1', 'Tel. 2', 'N° tel. 2', 'Paese', 'Osservazione',
    'Data nasc.', 'N° paziente', 'N° AVS', 'E-mail', 'M/F', 'N° assicurato LAMal', 'Assicurazione LAMal', 'Assicurazione LCA'];
  const q = (r: string[]) => r.map((x) => `"${x}"`).join(';');
  const csv = [
    q(testa),
    q(['Signor', 'Caro', 'Provamedi', '', 'Ugo', 'Via Inventata 1', '6900', 'Lugano', 'Domicilio', '', 'Cellulare', '079 000 00 01', 'Svizzera', 'nota\nsu due righe', '05.03.1968', '1', '756.0000.0000.02', '', 'M', '12345', 'CASSA DI PROVA', 'ALTRA']),
    q(['Signora', 'Cara', 'Provamedi', '', 'Ada', 'Via Altrove 2', '20100', 'Milano', 'Cellulare', '079 000 00 02', '', '', 'Italia', '', '31.12.1950', '2', '', 'senza-chiocciola', 'F', '', '', '']),
    q(['', '', '', '', 'Senzacognome', '', '', '', '', '', '', '', '', '', '', '3', '', '', '', '', '', '']),
  ].join('\r\n');
  // la stessa intestazione salvata da Windows e letta male: «N�» al posto di «N°»
  const rovinata = csv.replace(/N°/g, 'N�');
  for (const t of [csv, rovinata]) {
    const r = analizzaCsvPazienti(t);
    assert.equal(r.righe.length, 3, 'la nota su due righe non spezza il paziente');
    const [a, b, c] = r.righe;
    assert.deepEqual([a.dati.cognome, a.dati.nome, a.dati.data_nascita, a.dati.sesso, a.dati.telefono, a.dati.avs, a.dati.assicurazione, a.dati.n_assicurato, a.dati.npa],
      ['Provamedi', 'Ugo', '1968-03-05', 'M', '079 000 00 01', '756.0000.0000.02', 'CASSA DI PROVA', '12345', '6900']);
    assert.deepEqual(a.errori, {});
    assert.deepEqual([b.dati.data_nascita, b.dati.telefono, b.dati.npa, b.dati.email, b.dati.localita], ['1950-12-31', '079 000 00 02', '', '', 'Milano']);
    assert.deepEqual(b.errori, {}, 'NPA straniero ed e-mail sbagliata non fermano il paziente');
    assert.ok(b.avvisi && b.avvisi.npa && b.avvisi.email);
    assert.ok(c.errori.cognome, 'senza cognome la riga non entra');
    assert.ok(r.ignorate.includes('Titolo') && r.ignorate.includes('Assicurazione LCA') && !r.ignorate.some((x) => /Data nasc|M\/F|AVS|LAMal/.test(x)));
  }
});

test('importazione: il numero del paziente di MediOnline si tiene a parte (22.10.2026)', () => {
  const r = analizzaCsvPazienti('N° paziente;Cognome;Nome;Data nasc.\n00123456;Prova;Alda;12.03.1950\n;Finti;Bruno;\nx12;Altri;Ugo;\n');
  assert.equal(r.righe[0].numero, '123456');
  assert.equal(r.righe[1].numero, undefined);
  assert.equal(r.righe[2].numero, undefined);
  assert.ok(!r.ignorate.includes('N° paziente'));
  assert.equal((r.righe[0].dati as Record<string, unknown>).numero, undefined);   // non entra nell'anagrafica che si modifica
});
