import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Le funzioni audio del dittafono, provate sul file che gira nel browser.
const c: any = { Float32Array, Int16Array, ArrayBuffer, DataView, Math, Date };
vm.runInNewContext(readFileSync(path.join(process.cwd(), 'public', 'prototipo', 'dittafono-audio.js'), 'utf-8'), c);
const D = c.RFDittafono;
const lista = (a: ArrayLike<number>) => Array.from(a);

test('dittafono: da 48 a 16 kHz un campione su tre, con la media', () => {
  const r = D.riduci(new Float32Array([0.3, 0.6, 0.9, -0.3, -0.6, -0.9, 1, 1]), 48000, 16000);
  assert.equal(r.length, 2); assert.ok(Math.abs(r[0] - 0.6) < 1e-6); assert.ok(Math.abs(r[1] + 0.6) < 1e-6);
  const stesso = new Float32Array([0.1, 0.2]); assert.equal(D.riduci(stesso, 16000, 16000), stesso);
});

test('dittafono: a 16 bit, con i valori fuori scala tagliati', () => {
  assert.deepEqual(lista(D.aInt16(new Float32Array([0, 1, -1, 2, -2, 0.5]))), [0, 32767, -32768, 32767, -32768, 16384]);
});

test('dittafono: pausa e ripresa sono un solo audio', () => {
  assert.deepEqual(lista(D.unisci([new Int16Array([1, 2]), new Int16Array([]), new Int16Array([3])])), [1, 2, 3]);
});

test('dittafono: «inserisci qui» fa scivolare il resto, «sovrascrivi da qui» lo butta', () => {
  const pcm = new Int16Array([1, 2, 3, 4, 5]), nuovo = new Int16Array([9, 9]);
  assert.deepEqual(lista(D.inserisci(pcm, 2, nuovo)), [1, 2, 9, 9, 3, 4, 5]);
  assert.deepEqual(lista(D.sovrascrivi(pcm, 2, nuovo)), [1, 2, 9, 9]);
  assert.deepEqual(lista(D.inserisci(pcm, 99, nuovo)), [1, 2, 3, 4, 5, 9, 9]);     // oltre la fine = in coda
  assert.deepEqual(lista(D.inserisci(pcm, -5, nuovo)), [9, 9, 1, 2, 3, 4, 5]);     // prima dell'inizio = in testa
  assert.deepEqual(lista(D.sovrascrivi(pcm, 0, nuovo)), [9, 9]);
  assert.deepEqual(lista(pcm), [1, 2, 3, 4, 5]);                                   // l'originale non si tocca
});

test('dittafono: il WAV ha l’intestazione giusta e i campioni little-endian', () => {
  const buf = D.wav(new Int16Array([1, -2, 256]), 16000); const v = new DataView(buf);
  const testo = (p: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(p + i)));
  assert.equal(buf.byteLength, 44 + 6);
  assert.equal(testo(0, 4), 'RIFF'); assert.equal(testo(8, 4), 'WAVE'); assert.equal(testo(12, 4), 'fmt '); assert.equal(testo(36, 4), 'data');
  assert.equal(v.getUint32(4, true), 36 + 6); assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000); assert.equal(v.getUint32(28, true), 32000); assert.equal(v.getUint16(34, true), 16); assert.equal(v.getUint32(40, true), 6);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)], [1, -2, 256]);
});

test('dittafono: durata, orologio, livello e nome del file', () => {
  assert.equal(D.durata(new Int16Array(32000), 16000), 2);
  assert.equal(D.formatta(0), '0:00'); assert.equal(D.formatta(75.9), '1:15'); assert.equal(D.formatta(3725), '1:02:05');
  assert.ok(Math.abs(D.picco(new Float32Array([0.1, -0.7, 0.3])) - 0.7) < 1e-6);
  assert.equal(D.nomeFile(new Date(2026, 8, 23, 9, 5, 7)), 'dettato-20260923-090507.wav');
});
