import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daNomeFile, daTesto, nomeDocumento } from './ciclo/referto';

// Prova da sforzo: il referto PDF della ciclo (9.10.2026). Tutti i nomi qui sono inventati.
const REFERTO = (nascita: string, nome = 'Provaciclo, Anna Maria') => [
  'Pag. 1', 'Provaciclo Anna, 66 anni', 'Studio di Prova', 'Via Inventata 1', '6900 Lugano', 'Paziente',
  'ID : 123 ID secondario : --', `Nome : ${nome}`, 'Etnia : Sesso : femmina',
  `Data di nascita : ${nascita}${nascita ? ' ' : ''}Età : 66 anni`, 'Altezza : Peso : 62 kg', 'Telefono : Email :', 'Medico : tecnico :',
  'Esame Stress', 'Data Esame: 07/10/2026 - 15:02 Durata esame: 9:24 min', 'Protocollo: manuale (0:28 min) Potenza max: 25 Watt',
  'Conclusioni', 'Test', 'Refertato il: 07/10/2026 - 15:14',
].join('\n');

test('ciclo: dal nome del file si prendono l’ora dell’esame e quella del referto', () => {
  assert.deepEqual(daNomeFile('STX_123_Anna_Provaciclo_femmina__20261007150253__20261007151427__0.pdf'), { esame: '2026-10-07T15:02:53', referto: '2026-10-07T15:14:27', n: 0 });
  // Un nome con spazi o trattini bassi in più non cambia niente: contano solo le due ore in fondo.
  assert.equal(daNomeFile('STX_9_Anna_Maria_De_Prova_femmina__20260102030405__20260102040506__2.pdf')?.n, 2);
  // Un'ora che non esiste, o un altro PDF finito lì, non è un referto riconosciuto dal nome.
  assert.equal(daNomeFile('STX_1_A_B_m__20261340150253__20261007151427__0.pdf'), null);
  assert.equal(daNomeFile('lettera.pdf'), null);
  assert.equal(daNomeFile('STX_1_A_B_m__20261007150253__20261007151427__0.txt'), null);
});

test('ciclo: dal testo del referto chi è il paziente e quando è l’esame; senza data di nascita non si indovina', () => {
  assert.deepEqual(daTesto(REFERTO('12/06/1960')), { cognome: 'Provaciclo', nome: 'Anna Maria', nascita: '1960-06-12', esame: '2026-10-07T15:02:00' });
  assert.equal(daTesto(REFERTO('12.06.1960'))?.nascita, '1960-06-12');
  assert.equal(daTesto(REFERTO('1960-06-12'))?.nascita, '1960-06-12');
  // Data di nascita non scritta (succede: sulla ciclo si mette l'età) → resta vuota, e il referto andrà assegnato a mano.
  const senza = daTesto(REFERTO(''));
  assert.equal(senza?.nascita, null); assert.equal(senza?.cognome, 'Provaciclo');
  // Il 31 febbraio non diventa una data.
  assert.equal(daTesto(REFERTO('31/02/1960'))?.nascita, null);
  // Senza virgola tutto il nome resta nel cognome: non si decide a caso dove tagliare.
  assert.deepEqual([daTesto(REFERTO('', 'Provaciclo Anna'))?.cognome, daTesto(REFERTO('', 'Provaciclo Anna'))?.nome], ['Provaciclo Anna', '']);
  // Un PDF qualunque (o una scansione senza testo) non è un referto della prova da sforzo.
  assert.equal(daTesto('Gentile collega, le invio il paziente…'), null);
  assert.equal(daTesto(''), null);
});

test('ciclo: il documento in cartella porta la data dell’esame', () => {
  assert.equal(nomeDocumento('2026-10-07T15:02:53'), 'Prova da sforzo 07.10.2026.pdf');
  assert.equal(nomeDocumento(null), 'Prova da sforzo.pdf');
});
