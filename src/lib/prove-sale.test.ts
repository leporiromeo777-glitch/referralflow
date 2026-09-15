import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { capienza, daDeciderePerPrompt, leggiSale, pianoDelGiorno, salePerPrompt, titolare } from './sale';

const MD = `
## Sala 3
- Di: Marco Moccetti
- Dalle 13:00: Tiziano Moccetti
- Giorni: lun mar mer gio
- Nota: il venerdì resta di Marco
- Stato: proposta

## Sala 5
- Di: condivisa
- Chi: Davide Girola, Georgios Moschovitis, Miko Pedrotti
- Stato: proposta

## Appar
- Di: Vera Paiocchi
- Stato: validato
`;

test('sale: il parser legge titolare, fascia oraria, giorni, chi divide e stato', () => {
  const s = leggiSale(MD);
  assert.equal(s.length, 3);
  const tre = s[0];
  assert.equal(tre.nome, 'Sala 3');
  assert.equal(tre.di, 'Marco Moccetti');
  assert.deepEqual(tre.fasce, [{ dalle: '13:00', chi: 'Tiziano Moccetti' }]);
  assert.deepEqual(tre.giorni, ['lun', 'mar', 'mer', 'gio']);
  assert.equal(s[2].stato, 'validato');
  assert.deepEqual(s[1].chi, ['Davide Girola', 'Georgios Moschovitis', 'Miko Pedrotti']);
});

test('sala 3: di Marco la mattina, di Tiziano dalle 13, e di Marco tutto il venerdì', () => {
  const [tre] = leggiSale(MD);
  const presenti = ['Dr. med. Marco Moccetti', 'Prof. Dr. med. Tiziano Moccetti'];
  assert.equal(titolare(tre, '09:00', 'mar', presenti).chi, 'Marco Moccetti');
  assert.equal(titolare(tre, '13:00', 'mar', presenti).chi, 'Tiziano Moccetti');
  assert.equal(titolare(tre, '16:30', 'mar', presenti).chi, 'Tiziano Moccetti');
  // venerdì la regola oraria non vale: la sala resta del titolare
  assert.equal(titolare(tre, '15:00', 'ven', presenti).chi, 'Marco Moccetti');
});

test('sala 3: se Tiziano non è in studio, il pomeriggio resta di Marco', () => {
  const [tre] = leggiSale(MD);
  assert.equal(titolare(tre, '15:00', 'mar', ['Dr. med. Marco Moccetti']).chi, 'Marco Moccetti');
});

test('sala condivisa: con uno solo presente è sua, con due resta da decidere', () => {
  const cinque = leggiSale(MD)[1];
  assert.equal(titolare(cinque, '10:00', 'lun', ['Dr. Davide Girola']).chi, 'Davide Girola');
  const due = titolare(cinque, '10:00', 'lun', ['Dr. Davide Girola', 'Dr. med. Miko Pedrotti']);
  assert.equal(due.chi, '');
  assert.ok(due.perche.includes('condivisa fra'));
  assert.equal(titolare(cinque, '10:00', 'lun', ['Dr. med. Bruno Capelli']).perche, 'libera');
});

test('capienza: dice il picco e le ore in cui le stanze non bastano', () => {
  const app = [
    { inizio: 540, fine: 570 }, { inizio: 540, fine: 570 }, { inizio: 540, fine: 570 },
    { inizio: 600, fine: 630 },
  ];
  const c = capienza(app, 2);
  assert.equal(c.picco, 3);
  assert.deepEqual(c.oreOltre, ['09:00']);
  assert.equal(capienza(app, 5).oreOltre.length, 0, 'con stanze a sufficienza non segnala nulla');
  assert.equal(capienza([], 3).picco, 0);
});

test('sale: la pagina vera si legge e ogni stanza ha un titolare o chi la divide', () => {
  const md = readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8');
  const s = leggiSale(md);
  assert.ok(s.length >= 10, `stanze lette: ${s.length}`);
  for (const x of s) assert.ok(x.di || x.chi.length, `${x.nome} senza titolare`);
  assert.ok(s.some((x) => x.fasce.length), 'almeno una stanza ha una regola oraria');
});

test('una sala «condivisa» senza dire fra chi lo dichiara, non stampa un elenco vuoto', () => {
  const s = leggiSale('## RIA\n- Di: condivisa\n- Stato: proposta\n');
  const t = salePerPrompt(s);
  assert.ok(!t.includes('condivisa fra ;'), t);
  assert.ok(t.includes('non è scritto fra chi'));
});

test('piano: fasce contigue con lo stesso titolare si fondono', () => {
  const p = pianoDelGiorno(leggiSale(MD), ['Dr. med. Marco Moccetti'], 'mar');
  const tre = p.righe.find((r) => r.stanza === 'Sala 3')!;
  assert.equal(tre.segmenti.length, 1, 'senza Tiziano la 3 è di Marco tutto il giorno');
  assert.equal(tre.segmenti[0].chi, 'Marco Moccetti');
});

test('piano: con Tiziano la Sala 3 si spezza in due fasce', () => {
  const p = pianoDelGiorno(leggiSale(MD), ['Dr. med. Marco Moccetti', 'Prof. Dr. med. Tiziano Moccetti'], 'mar');
  const tre = p.righe.find((r) => r.stanza === 'Sala 3')!;
  assert.equal(tre.segmenti.length, 2);
  assert.deepEqual(tre.segmenti.map((s) => [s.dalle, s.chi]), [['07:00', 'Marco Moccetti'], ['13:00', 'Tiziano Moccetti']]);
});

test('piano: una stanza condivisa con due presenti finisce in «da decidere»', () => {
  const p = pianoDelGiorno(leggiSale(MD), ['Dr. Davide Girola', 'Dr. med. Miko Pedrotti'], 'lun');
  assert.equal(p.daDecidere.length, 1);
  assert.equal(p.daDecidere[0].stanza, 'Sala 5');
  // con uno solo non c'è niente da decidere
  const solo = pianoDelGiorno(leggiSale(MD), ['Dr. Davide Girola'], 'lun');
  assert.equal(solo.daDecidere.length, 0);
});

test('piano: quello che si manda al modello ha il già deciso, le caselle aperte e chi c’è', () => {
  const presenti = ['Dr. Davide Girola', 'Dr. med. Miko Pedrotti'];
  const t = daDeciderePerPrompt(pianoDelGiorno(leggiSale(MD), presenti, 'lun'), presenti);
  assert.ok(t.includes('IN STUDIO OGGI: Dr. Davide Girola, Dr. med. Miko Pedrotti'));
  assert.ok(t.includes('GIÀ DECISO DALLE REGOLE:'));
  assert.ok(t.includes('Sala 5'));
});
