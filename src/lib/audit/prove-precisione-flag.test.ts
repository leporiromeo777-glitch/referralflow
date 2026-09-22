// Precisione delle segnalazioni (pura). Uso: npm run test:audit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esitiFlag, precisione, daDeclassare, tipoFlag } from './precisione-flag';

const catena = 'Il paziente riferisce dispnea da sforzo. La frazione di eiezione è del 55%. Non dolore toracico. Controllo fra 12 mesi.';

test('precisione: frase cambiata = toccata, frase identica = intatta', () => {
  const payload = {
    allarmi_numerici: [{ campo: 'fe', valore: '55', stato: 'limite' }],
    frasi_non_supportate: [{ frase: 'Controllo fra 12 mesi.', motivo: 'non trovata' }],
  };
  const persona = 'Il paziente riferisce dispnea da sforzo. La frazione di eiezione è del 65%. Non dolore toracico. Controllo fra 12 mesi.';
  const esiti = esitiFlag(catena, payload, persona);
  const perTipo = Object.fromEntries(esiti.map((e) => [e.tipo, e]));
  assert.equal(perTipo['allarme numerico'].esito, 'toccata');
  assert.equal(perTipo['allarme numerico'].critico, true);
  assert.equal(perTipo['frase non sostenuta'].esito, 'intatta');
});

test('precisione: omissione rimessa nel testo = inserita, ignorata = non_inserita', () => {
  const payload = { frasi_omesse: [{ frase: 'ramipril cinque milligrammi al mattino', pulita: 'Ramipril 5 mg al mattino.', farmaco: true }] };
  const conRamipril = `${catena}\nRamipril 5 mg al mattino.`;
  assert.equal(esitiFlag(catena, payload, conRamipril)[0].esito, 'inserita');
  assert.equal(esitiFlag(catena, payload, catena)[0].esito, 'non_inserita');
  assert.equal(esitiFlag(catena, payload, catena)[0].tipo, 'omissione grave');
});

test('precisione: la punteggiatura e le maiuscole non contano come correzione', () => {
  const payload = { frasi_da_chiarire: [{ frase: 'Non dolore toracico.', proposta: '' }] };
  const persona = catena.replace('Non dolore toracico.', 'non dolore toracico;');
  assert.equal(esitiFlag(catena, payload, persona)[0].esito, 'intatta');
});

test('precisione: riepilogo per tipo e candidati a declassare', () => {
  const inutile = { tipo: 'numero non confermato', critico: false, esito: 'intatta' as const };
  const utile = { tipo: 'allarme numerico', critico: true, esito: 'toccata' as const };
  const righe = precisione([[...Array(9).fill(inutile), utile], [utile, { tipo: 'altro', critico: false, esito: 'senza_aggancio' as const }]]);
  const nc = righe.find((r) => r.tipo === 'numero non confermato')!;
  assert.equal(nc.flag, 9); assert.equal(nc.quota_utili, 0);
  assert.equal(righe[0].tipo, 'allarme numerico', 'i critici prima');
  assert.equal(righe.find((r) => r.tipo === 'altro')!.quota_utili, null);
  assert.deepEqual(daDeclassare(righe).map((r) => r.tipo), ['numero non confermato']);
  assert.equal(tipoFlag({ title: 'Negazione sentita da un solo motore', cat: 'NEGATION', sev: 'critical' }), 'motori: negazione');
});
