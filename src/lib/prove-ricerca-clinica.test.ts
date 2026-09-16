import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEZIONI_ESTERNE, SEZIONI_FINALI, elencoFonti, fontiDaVerificare,
  leggiRisposta, puoUscire, ripuliEsterna, separaSezioni,
} from './ricerca-clinica';

// Tutto inventato: qui non entrano né pazienti né referti veri.
const ESTERNA = `INFORMAZIONI: Il passaggio ad ARNI si valuta quando la frazione d'eiezione resta ridotta.
Nel rene compromesso serve prudenza.
LINEE GUIDA: ESC 2021 sullo scompenso, classe I con eGFR sopra 30.
ATTENZIONI: iperkaliemia, ipotensione, peggioramento renale nelle prime settimane.
MANCANTI: potassio recente, pressione abituale.
FONTI:
- ESC, linee guida scompenso cardiaco, 2021
- Swissmedic, informazione professionale sacubitril/valsartan
CERTEZZA: media, perché la soglia renale dipende dal valore esatto.`;

test('le sei sezioni della risposta esterna si leggono, righe multiple comprese', () => {
  const s = separaSezioni(ESTERNA, SEZIONI_ESTERNE);
  assert.match(s['informazioni'], /frazione d'eiezione/);
  assert.match(s['informazioni'], /Nel rene compromesso/, 'la sezione non finisce alla prima riga');
  assert.equal(s['certezza'], 'media, perché la soglia renale dipende dal valore esatto.');
  assert.match(s['linee guida'], /^ESC 2021/, 'un titolo di due parole si legge come gli altri');
});

test('una sezione che il modello non ha scritto resta vuota e si dichiara', () => {
  const r = leggiRisposta('SINTESI: si può, con controlli.\nCERTEZZA: bassa', SEZIONI_FINALI);
  assert.equal(r.sezioni['sintesi'], 'si può, con controlli.');
  assert.equal(r.certezza, 'bassa');
  assert.deepEqual(r.mancanti, ['EVIDENZE', 'PERTINENTI', 'ATTENZIONI', 'MANCANTI', 'FONTI']);
  assert.deepEqual(r.fonti, [], 'nessuna fonte inventata per riempire il buco');
});

test('le fonti si contano per riga e «nessuna fonte sicura» non è una fonte', () => {
  assert.deepEqual(elencoFonti('- ESC 2021\n* AHA 2022\n1. SSC 2020'), ['ESC 2021', 'AHA 2022', 'SSC 2020']);
  assert.deepEqual(elencoFonti('nessuna fonte sicura'), []);
  assert.deepEqual(leggiRisposta(ESTERNA, SEZIONI_ESTERNE).fonti.length, 2);
});

test('link, DOI e PubMed vengono segnalati: il modello esterno non naviga, quindi non può averli verificati', () => {
  const con = `FONTI:
- ESC 2021, https://www.escardio.org/guidelines
- doi: 10.1093/eurheartj/ehab368
- PMID 34447992`;
  const v = fontiDaVerificare(con);
  assert.equal(v.length, 3, 'tutti e tre i modi di citare un indirizzo');
  assert.ok(v.some((x) => x.startsWith('https://')));
  assert.deepEqual(fontiDaVerificare(ESTERNA), [], 'una risposta che rispetta la regola non segnala niente');
});

test('il testo che rientra da fuori è tagliato prima di entrare in un altro prompt', () => {
  const lungo = 'a'.repeat(9000);
  assert.equal(ripuliEsterna(lungo).length, 6000);
  assert.equal(ripuliEsterna(null as unknown as string), '');
});

test('esce solo il pacchetto che ha passato il controllo', () => {
  assert.equal(puoUscire({ ok: true }), true);
  assert.equal(puoUscire({ ok: false }), false);
  assert.equal(puoUscire(null), false, 'senza controllo non si manda niente');
});
