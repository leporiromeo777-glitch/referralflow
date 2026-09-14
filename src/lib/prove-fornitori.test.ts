import test from 'node:test';
import assert from 'node:assert/strict';
import { fornitoreAutorizzato, leggiConf } from './fornitori';

const LISTA = ['https://api.infomaniak.com/'];

test('fornitori: passa solo chi comincia col prefisso autorizzato', () => {
  assert.equal(fornitoreAutorizzato('https://api.infomaniak.com/2/ai/1/openai/v1/chat/completions', LISTA), true);
  assert.equal(fornitoreAutorizzato('https://api.anthropic.com/v1/messages', LISTA), false);
  assert.equal(fornitoreAutorizzato('https://api.openai.com/v1/chat/completions', LISTA), false);
});

test('fornitori: il dominio sosia non passa (è per questo che il prefisso ha la barra)', () => {
  assert.equal(fornitoreAutorizzato('https://api.infomaniak.com.esempio.tld/v1/chat', LISTA), false);
  assert.equal(fornitoreAutorizzato('https://api.infomaniak.company/v1/chat', LISTA), false);
});

test('fornitori: l’indirizzo autorizzato messo in coda a un altro non passa', () => {
  assert.equal(fornitoreAutorizzato('https://esempio.tld/?a=https://api.infomaniak.com/x', LISTA), false);
});

test('fornitori: niente http in chiaro, niente vuoto, prefisso senza barra ignorato', () => {
  assert.equal(fornitoreAutorizzato('http://api.infomaniak.com/v1', LISTA), false);
  assert.equal(fornitoreAutorizzato('', LISTA), false);
  assert.equal(fornitoreAutorizzato('https://api.infomaniak.com/v1', ['https://api.infomaniak.com']), false);
});

test('conf: chiave=valore, commenti saltati, valore con l’uguale dentro', () => {
  const c = leggiConf('# commento\nurl=https://api.infomaniak.com/2/ai/1\n\nchiave=abc=def\nvuoto=\nsenza-uguale\n');
  assert.deepEqual(c, { url: 'https://api.infomaniak.com/2/ai/1', chiave: 'abc=def' });
});
