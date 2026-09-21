/* Dittafono — l'audio, in funzioni pure (23.9.2026).
 *
 * Il dittafono della piattaforma registra col microfono del dispositivo e
 * manda alla catena un WAV mono a 16 bit. Qui c'è solo la matematica: ridurre
 * la frequenza, passare da virgola mobile a 16 bit, unire i pezzi, INSERIRE o
 * SOVRASCRIVERE in un punto (come un dittafono vero), scrivere l'intestazione
 * WAV. Niente microfono, niente DOM: lo provano i test
 * (src/lib/prove-dittafono-audio.test.ts) caricando questo stesso file.
 */
(function (root) {
  'use strict';
  var VERSIONE = '1.0';
  var FREQUENZA = 16000;     // quella che la catena (whisper) usa: niente byte sprecati

  // Da `da` Hz a `a` Hz con media dei campioni (un filtro passa-basso povero ma
  // sufficiente per la voce); se `da` è già ≤ `a` si restituisce com'è.
  function riduci(campioni, da, a) {
    if (!(da > 0) || !(a > 0) || da <= a) return campioni;
    var passo = da / a, n = Math.floor(campioni.length / passo), out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var inizio = Math.floor(i * passo), fine = Math.min(campioni.length, Math.floor((i + 1) * passo));
      var s = 0, k = 0;
      for (var j = inizio; j < fine; j++) { s += campioni[j]; k++; }
      out[i] = k ? s / k : 0;
    }
    return out;
  }
  function aInt16(campioni) {
    var out = new Int16Array(campioni.length);
    for (var i = 0; i < campioni.length; i++) {
      var v = Math.max(-1, Math.min(1, campioni[i]));
      out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
    }
    return out;
  }
  function unisci(pezzi) {
    var n = 0, i; for (i = 0; i < pezzi.length; i++) n += pezzi[i].length;
    var out = new Int16Array(n), p = 0;
    for (i = 0; i < pezzi.length; i++) { out.set(pezzi[i], p); p += pezzi[i].length; }
    return out;
  }
  function limita(campione, lunghezza) { return Math.max(0, Math.min(lunghezza, Math.round(campione) || 0)); }
  // Il nuovo pezzo entra nel punto scelto e il resto scivola in avanti.
  function inserisci(pcm, campione, nuovo) {
    var c = limita(campione, pcm.length);
    return unisci([pcm.subarray(0, c), nuovo, pcm.subarray(c)]);
  }
  // Dal punto scelto in poi si butta ciò che c'era e si mette il nuovo.
  function sovrascrivi(pcm, campione, nuovo) {
    var c = limita(campione, pcm.length);
    return unisci([pcm.subarray(0, c), nuovo]);
  }
  // Il picco di un blocco (0–1), per la barra del livello.
  function picco(campioni) {
    var m = 0; for (var i = 0; i < campioni.length; i++) { var v = Math.abs(campioni[i]); if (v > m) m = v; }
    return m;
  }
  // WAV PCM 16 bit mono: 44 byte di intestazione e i campioni little-endian.
  function wav(pcm, frequenza) {
    var f = frequenza || FREQUENZA, dati = pcm.length * 2, buf = new ArrayBuffer(44 + dati), v = new DataView(buf);
    var scrivi = function (pos, testo) { for (var i = 0; i < testo.length; i++) v.setUint8(pos + i, testo.charCodeAt(i)); };
    scrivi(0, 'RIFF'); v.setUint32(4, 36 + dati, true); scrivi(8, 'WAVE'); scrivi(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, f, true); v.setUint32(28, f * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    scrivi(36, 'data'); v.setUint32(40, dati, true);
    for (var i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
    return buf;
  }
  function durata(pcm, frequenza) { return pcm.length / (frequenza || FREQUENZA); }
  function formatta(secondi) {
    var s = Math.max(0, Math.floor(secondi || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    var due = function (x) { return (x < 10 ? '0' : '') + x; };
    return (h ? h + ':' + due(m) : String(m)) + ':' + due(r);
  }
  function nomeFile(quando) {
    var d = quando || new Date(), due = function (x) { return (x < 10 ? '0' : '') + x; };
    return 'dettato-' + d.getFullYear() + due(d.getMonth() + 1) + due(d.getDate()) + '-' + due(d.getHours()) + due(d.getMinutes()) + due(d.getSeconds()) + '.wav';
  }
  root.RFDittafono = { VERSIONE: VERSIONE, FREQUENZA: FREQUENZA, riduci: riduci, aInt16: aInt16, unisci: unisci, inserisci: inserisci, sovrascrivi: sovrascrivi, picco: picco, wav: wav, durata: durata, formatta: formatta, nomeFile: nomeFile };
})(typeof globalThis !== 'undefined' ? globalThis : this);
