// Gli esami dell'archivio dello studio: quali risposte sono del paziente
// (6.10.2026). Nomi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataDicom, dataIso, filtriDaTesto, modelliNome, nomeLeggibile, sceltiPerPaziente, spiegaErrore, tutti, uidValido, type StudioArchivio } from './imaging-archivio-regole';

const studio = (uid: string, nome: string, nascita: string, data = '20260301', extra: Partial<StudioArchivio> = {}): StudioArchivio => ({
  StudyInstanceUID: uid, StudyDate: data, StudyTime: '101500', StudyDescription: 'Eco', ModalitiesInStudy: 'US\\SR', AccessionNumber: '',
  PatientName: nome, PatientBirthDate: nascita, PatientID: 'X', PatientSex: '', NumberOfStudyRelatedSeries: '2', NumberOfStudyRelatedInstances: '41',
  ReferringPhysicianName: '', InstitutionName: '', ...extra,
});
const P = { cognome: 'Zeffiretti', nome: 'Marcello', data_nascita: '1950-02-01' };

test('date, nomi, identificativi', () => {
  assert.equal(dataDicom('1950-02-01'), '19500201');
  assert.equal(dataDicom(null), '');
  assert.equal(dataIso('19500201'), '1950-02-01');
  assert.equal(dataIso('1950'), null);
  assert.equal(nomeLeggibile('ZEFFIRETTI^MARCELLO^^DR'), 'ZEFFIRETTI MARCELLO');
  assert.equal(nomeLeggibile('ZEFFIRETTI MARCELLO'), 'ZEFFIRETTI MARCELLO');
  assert.ok(uidValido('1.2.840.113619.2.55'));
  for (const no of ['', '1', '1.2.x', '1..2', `1.${'9'.repeat(70)}`, "1.2'; drop"]) assert.equal(uidValido(no), false, no);
  assert.deepEqual(modelliNome('Zeffiretti'), ['Zeffiretti*', 'ZEFFIRETTI*']);
  assert.deepEqual(modelliNome('De Luca'), ['De Luca*', 'DE LUCA*'], 'una prima parola troppo corta non basta');
  assert.deepEqual(modelliNome('Lucchini Fontana'), ['Lucchini*', 'LUCCHINI*']);
  assert.deepEqual(modelliNome('ROSSI'), ['ROSSI*']);
  assert.deepEqual(modelliNome('R*'), [], 'i caratteri jolly di chi scrive non passano');
});

test('gli esami di QUEL paziente: stessa nascita e nome che suona uguale', () => {
  const r = sceltiPerPaziente([
    studio('1.1', 'ZEFFIRETTI^MARCELLO', '19500201', '20240505'),
    studio('1.2', 'ZEFIRETTI^MARCELLO', '19500201', '20260301'),      // battuto male sull'apparecchio
    studio('1.3', 'ZEFFIRETTI^MARCELLO', '19620202'),                  // omonimo, altra data
    studio('1.4', 'BONNACORSI^ALFREDO', '19500201'),                   // altro, nato lo stesso giorno
    studio('1.5', 'ZEFFIRETTI^MARCO', '19500201'),                     // nome diverso
    studio('1.6', 'ZEFFIRETTI MARCELLO', '', '20250101'),              // senza data di nascita, nome tutto nel cognome
    studio('1.2', 'ZEFIRETTI^MARCELLO', '19500201', '20260301'),      // doppione (due ricerche)
    studio('non-valido', 'ZEFFIRETTI^MARCELLO', '19500201'),
  ], P);
  assert.deepEqual(r.map((e) => [e.study_uid, e.certezza]), [['1.2', 'sicuro'], ['1.6', 'da_controllare'], ['1.1', 'sicuro']], 'dal più recente');
  assert.deepEqual([r[0].data, r[0].ora, r[0].modalita, r[0].immagini, r[0].serie, r[0].paziente, r[0].nascita], ['2026-03-01', '10:15', 'US, SR', 41, 2, 'ZEFIRETTI MARCELLO', '1950-02-01']);
});

test('paziente senza data di nascita in cartella: il nome non basta per agganciare', () => {
  const r = sceltiPerPaziente([studio('2.1', 'ZEFFIRETTI^MARCELLO', '19500201'), studio('2.2', 'ZEFFIRETTI^MARCO', '19500201')], { ...P, data_nascita: null });
  assert.deepEqual(r.map((e) => [e.study_uid, e.certezza]), [['2.1', 'da_controllare']]);
});

test('ricerca libera: che cosa si cerca, e mai l\'archivio intero', () => {
  assert.deepEqual(filtriDaTesto('zeffiretti'), { nome: ['zeffiretti*', 'ZEFFIRETTI*'], parole: 'zeffiretti' });
  assert.deepEqual(filtriDaTesto('12.3.1961'), { nascita: '19610312', parole: '' });
  assert.deepEqual(filtriDaTesto('Rossi 1961-03-12'), { nome: ['Rossi*', 'ROSSI*'], nascita: '19610312', parole: 'Rossi' });
  for (const no of ['', '  ', 'ab', '*', '12', '%%%']) assert.equal(filtriDaTesto(no), null, no);
  const t = tutti([studio('3.1', 'A^B', '19500201', '20240101'), studio('3.2', 'C^D', '19600101', '20260101'), studio('3.1', 'A^B', '19500201')]);
  assert.deepEqual(t.map((e) => [e.study_uid, e.certezza]), [['3.2', null], ['3.1', null]]);
});

test('gli errori detti a chi guarda', () => {
  assert.match(spiegaErrore('destinazione_sconosciuta'), /non conosce ancora questo Mac/);
  assert.match(spiegaErrore('non_raggiungibile'), /non risponde/);
  assert.match(spiegaErrore('ricezione_spenta'), /spenta/);
  assert.match(spiegaErrore('qualcosa_di_nuovo'), /non è riuscito/);
});
