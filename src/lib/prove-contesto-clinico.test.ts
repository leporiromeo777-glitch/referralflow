import test from 'node:test';
import assert from 'node:assert/strict';
import { controllaContesto, separaContesto, spieDiPaziente } from './contesto-clinico';

// Paziente INVENTATO: nei banchi e nelle prove non entrano dati veri.
const FINTO = {
  cognome: 'Ferretti', nome: 'Gioele', data_nascita: '1954-03-12',
  telefono: '+41 91 123 45 67', email: 'g.ferretti@example.ch',
  via: 'Via dei Platani 12', npa: '6942', localita: 'Savosa',
  avs: '756.1234.5678.97', n_assicurato: '884512',
};

test('le due parti si separano, e una risposta storta non inventa la domanda', () => {
  const buono = separaContesto('CONTESTO: Uomo sui settant’anni con rene ridotto.\n\nDOMANDA: Si può iniziare X?');
  assert.equal(buono.contesto, 'Uomo sui settant’anni con rene ridotto.');
  assert.equal(buono.domanda, 'Si può iniziare X?');
  assert.deepEqual(separaContesto('**CONTESTO:** A\n**DOMANDA:** B'), { contesto: 'A', domanda: 'B' });
  const storto = separaContesto('Non ho capito la richiesta.');
  assert.equal(storto.domanda, '', 'senza forma, la domanda resta vuota invece di essere indovinata');
});

test('il controllo trova gli identificatori VERI di quel paziente', () => {
  const spie = spieDiPaziente(FINTO);
  const pulito = controllaContesto({
    contesto: 'Uomo sui settant’anni con scompenso e funzione renale ridotta (eGFR intorno a 30), in terapia con ACE-inibitore.',
    domanda: 'In presenza di insufficienza renale e potassio ai limiti, è indicato passare a sacubitril/valsartan?',
  }, spie);
  assert.ok(pulito.ok);
  assert.deepEqual(pulito.fughe, []);

  const conNome = controllaContesto({ contesto: 'Il signor Ferretti ha una funzione renale ridotta e riceve un ACE-inibitore.', domanda: 'Si può passare a sacubitril/valsartan?' }, spie);
  assert.deepEqual(conNome.fughe, ['Ferretti']);
  assert.ok(!conNome.ok);

  const conAvs = controllaContesto({ contesto: 'Paziente con AVS 756.1234.5678.97 e rene ridotto, in terapia da tempo.', domanda: 'Si può passare a sacubitril/valsartan?' }, spie);
  assert.deepEqual(conAvs.fughe, ['756.1234.5678.97']);
});

test('«capelli neri» non è il cognome Neri, «il signor Neri» sì', () => {
  const spie = spieDiPaziente({ cognome: 'Neri', nome: 'Carlo' });
  const innocuo = controllaContesto({ contesto: 'Paziente con capelli neri, scompenso cardiaco e funzione renale ridotta.', domanda: 'Quale terapia è indicata in questa situazione clinica?' }, spie);
  assert.deepEqual(innocuo.fughe, [], 'l’aggettivo minuscolo non è un cognome');
  const fuga = controllaContesto({ contesto: 'Il signor Neri ha uno scompenso cardiaco e una funzione renale ridotta.', domanda: 'Quale terapia è indicata in questa situazione clinica?' }, spie);
  assert.deepEqual(fuga.fughe, ['Neri']);
});

test('la domanda che punta a una persona, e l’età esatta, non passano', () => {
  const spie = spieDiPaziente(FINTO);
  const deittico = controllaContesto({ contesto: 'Uomo con scompenso cardiaco e funzione renale ridotta in terapia con ACE-inibitore.', domanda: 'Posso passare a sacubitril/valsartan in questo paziente?' }, spie);
  assert.deepEqual(deittico.deittici, ['questo paziente']);
  assert.ok(!deittico.ok);
  const eta = controllaContesto({ contesto: 'Donna di 78 anni con fibrillazione atriale e funzione renale ridotta.', domanda: 'Come si gestisce l’anticoagulante prima di una polipectomia?' }, spie);
  assert.equal(eta.etaEsatta, '78 anni');
  assert.ok(!eta.ok);
});

// La parola «domanda» dentro una frase del contesto non è il separatore: il
// taglio cadeva lì, il contesto perdeva metà dei dati e la domanda partiva
// monca verso il modello esterno.
test('separaContesto taglia sull’etichetta a inizio riga, non sulla parola «domanda»', () => {
  const grezzo = [
    'CONTESTO: uomo sui settant’anni, funzione renale ridotta, in terapia',
    'anticoagulante. La domanda riguarda l’aggiustamento della dose.',
    'DOMANDA: come si aggiusta la dose dell’anticoagulante orale diretto?',
  ].join('\n');
  const p = separaContesto(grezzo);
  assert.ok(p.contesto.endsWith('della dose.'), `contesto troncato: ${p.contesto}`);
  assert.equal(p.domanda, 'come si aggiusta la dose dell’anticoagulante orale diretto?');
});
