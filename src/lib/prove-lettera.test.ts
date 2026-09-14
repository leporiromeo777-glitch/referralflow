import test from 'node:test';
import assert from 'node:assert/strict';
import { promptPer, unParagrafo } from './referto-struttura';

// Dati INVENTATI: nessun testo di pazienti veri.
const CHIUSURA = 'Cordiali saluti,';

test('corpo in un solo paragrafo: le righe fra apertura e saluto diventano una sola', () => {
  const lettera = [
    'Caro Dottor Bianchi,', '',
    'non ritorno sull’anamnesi del paziente.', 'Rivedo in data 02.09.2026 il paziente a margine.', '',
    'FRCV: ipertensione arteriosa.', '',
    'In conclusione, alla luce degli elementi di cui sopra, propongo di continuare.', '',
    CHIUSURA,
  ].join('\n');
  const out = unParagrafo(lettera, CHIUSURA);
  const righe = out.split('\n');
  assert.equal(righe[0], 'Caro Dottor Bianchi,');
  assert.equal(righe[1], '');
  assert.equal(righe[2], 'non ritorno sull’anamnesi del paziente. Rivedo in data 02.09.2026 il paziente a margine. FRCV: ipertensione arteriosa. In conclusione, alla luce degli elementi di cui sopra, propongo di continuare.');
  assert.equal(righe[righe.length - 1], CHIUSURA);
  // nessuna riga vuota dentro il corpo
  assert.equal(righe.filter((r) => r === '').length, 2);
});

test('un solo paragrafo: senza saluto finale, e già in un paragrafo, resta com’è', () => {
  const senzaSaluto = 'Caro collega,\n\nprimo blocco.\n\nsecondo blocco.';
  assert.equal(unParagrafo(senzaSaluto, CHIUSURA), 'Caro collega,\n\nprimo blocco. secondo blocco.');
  const gia = `Caro collega,\n\nuna riga sola di corpo.\n\n${CHIUSURA}`;
  assert.equal(unParagrafo(gia, CHIUSURA), gia);
});

test('il prompt chiede un paragrafo solo quando il profilo lo vuole, altrimenti i paragrafi', () => {
  const uno = promptPer('lettera', { chiusura: CHIUSURA, corpoUnico: true });
  assert.match(uno, /TUTTO IN UN SOLO PARAGRAFO/);
  assert.ok(!/SEPARATI L'UNO DALL'ALTRO DA UNA RIGA VUOTA/.test(uno));
  assert.match(uno, /scrivi ESATTAMENTE «Cordiali saluti,»/);
  const tanti = promptPer('lettera', { chiusura: CHIUSURA });
  assert.match(tanti, /SEPARATI L'UNO DALL'ALTRO DA UNA RIGA VUOTA/);
  assert.ok(!/TUTTO IN UN SOLO PARAGRAFO/.test(tanti));
  // il rapporto a sezioni non è toccato
  assert.ok(!/{corpo}/.test(promptPer('rapporto', {})));
  assert.ok(!/{corpo}/.test(uno));
});
