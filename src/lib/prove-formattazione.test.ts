// Grassetto, corsivo e sottolineato messi con la barra della revisione (20.10.2026): i pezzi, e il Word.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { righeFormattate, segniDi, trovaVoce, vociDai, vociValide, B, I, U } from './formattazione';
import { generaDocxReferto } from './referto-docx';

const T = 'Paziente con fibrillazione atriale. Terapia: apixaban.\nControllo: fibrillazione atriale stabile.';

test('formattazione: la n-esima comparsa, anche con a capo diversi', () => {
  assert.deepEqual(trovaVoce(T, { testo: 'fibrillazione atriale', n: 1 }), [T.lastIndexOf('fibrillazione'), T.lastIndexOf('fibrillazione') + 21]);
  assert.equal(trovaVoce(T, { testo: 'fibrillazione atriale', n: 2 }), null);
  assert.ok(trovaVoce('fibrillazione\natriale', { testo: 'fibrillazione atriale', n: 0 }));
  assert.equal(trovaVoce(T, { testo: 'Fibrillazione atriale', n: 0 }), null);      // le maiuscole contano: è il testo selezionato
});

test('formattazione: dai segni ai pezzi e ritorno', () => {
  const s = new Uint8Array(T.length);
  const k = T.lastIndexOf('fibrillazione');
  s.fill(B | I, k, k + 21);
  s.fill(U, T.indexOf('apixaban'), T.indexOf('apixaban') + 8);
  const voci = vociDai(T, s);
  assert.deepEqual(voci, [{ testo: 'apixaban', n: 0, u: true }, { testo: 'fibrillazione atriale', n: 1, b: true, i: true }]);
  assert.deepEqual([...segniDi(T, voci)], [...s]);
  // la dimensione viaggia coi pezzi, accanto agli stili
  const s2 = new Uint16Array(T.length); s2.fill(B | (18 << 3), 0, 8);
  assert.deepEqual(vociDai(T, s2), [{ testo: 'Paziente', n: 0, b: true, s: 18 }]);
  assert.deepEqual(righeFormattate('Paziente con', [{ testo: 'Paziente', n: 0, s: 18 }])[0], [{ t: 'Paziente', b: false, s: 18 }, { t: ' con', b: false }]);
  // corretto il testo prima: la seconda comparsa resta la seconda
  const T2 = T.replace('Paziente con', 'Paziente di 70 anni con');
  const r = trovaVoce(T2, voci[1])!;
  assert.equal(T2.slice(r[0], r[1]), 'fibrillazione atriale');
  assert.ok(r[0] > T2.indexOf('Controllo'));
});

test('formattazione: solo voci valide', () => {
  assert.deepEqual(vociValide([{ testo: '  ciao   mondo ', n: 0, b: true }, { testo: 'x', n: 1 }]), [{ testo: 'ciao mondo', n: 0, b: true }]);
  assert.equal(vociValide([{ testo: 'x', n: -1, b: true }]), undefined);
  assert.equal(vociValide([{ testo: 'x', n: 0, b: 'sì' }]), undefined);
  assert.equal(vociValide('x'), undefined);
  assert.deepEqual(vociValide([{ testo: 'grande', n: 0, s: 16 }]), [{ testo: 'grande', n: 0, s: 16 }]);
  assert.equal(vociValide([{ testo: 'x', n: 0, s: 13 }]), undefined);      // solo le dimensioni della barra
  assert.equal(vociValide(new Array(401).fill({ testo: 'x', n: 0, b: true })), undefined);
});

test('formattazione: le righe del Word in pezzi, col grassetto della lettera vecchia', () => {
  const righe = righeFormattate('Terapia: apixaban.\nAltro', [{ testo: 'apixaban', n: 0, i: true }], (riga) => riga.startsWith('Terapia:') ? [{ t: 'Terapia:', b: true }, { t: riga.slice(8), b: false }] : [{ t: riga, b: false }]);
  assert.deepEqual(righe[0], [{ t: 'Terapia:', b: true }, { t: ' ', b: false }, { t: 'apixaban', b: false, i: true }, { t: '.', b: false }]);
  assert.deepEqual(righe[1], [{ t: 'Altro', b: false }]);
});

test('formattazione: il Word esce con grassetto, corsivo e sottolineato', async () => {
  const docx = await generaDocxReferto({ medico: 'Dr. med. Prova', intestazione: '', telefono: '', destinatario: 'Dr. Prova', via: '', data: '20.10.2026', titolo: 'PROVA', paziente: 'Paziente di prova', piede: '', copia: '',
    testo: 'Diagnosi: fibrillazione atriale.\nTerapia: apixaban 5 mg.',
    formattazione: [{ testo: 'Diagnosi:', n: 0, b: true, s: 16 }, { testo: 'fibrillazione atriale', n: 0, i: true }, { testo: 'apixaban 5 mg', n: 0, b: true, u: true }] });
  const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string');
  const run = (t: string) => (xml.match(new RegExp(`<w:r>(?:(?!</w:r>).)*?>${t}</w:t></w:r>`, 's')) ?? xml.match(new RegExp(`<w:r[ >](?:(?!</w:r>).)*?${t}</w:t></w:r>`, 's')) ?? [''])[0];
  assert.match(run('Diagnosi:'), /<w:b\/>/);
  assert.match(run('Diagnosi:'), /<w:sz w:val="32"\/><w:szCs w:val="32"\/>/);      // 16 punti
  assert.doesNotMatch(run('apixaban 5 mg'), /<w:sz w:val="32"/);
  assert.match(run('fibrillazione atriale'), /<w:i\/>/);
  assert.doesNotMatch(run('fibrillazione atriale'), /<w:b\/>/);
  assert.match(run('apixaban 5 mg'), /<w:b\/>[\s\S]*<w:u w:val="single"\/>/);
  assert.doesNotMatch(run('\\. '), /<w:i\/>/);
  // l'ordine dello schema: b, i prima di u
  const r = run('apixaban 5 mg'); assert.ok(r.indexOf('<w:b/>') < r.indexOf('<w:u '));
});

// La firma (20.10.2026): nome completo in grassetto, la riga tra parentesi a 9 punti.
import { eNomeDelMedico, firmaDellaLettera } from './firma-lettera';
test('firma: nome del medico completo e in grassetto, parentesi a 9 punti', async () => {
  const NOME = 'Dr. med. Mario Provafirma';
  assert.ok(eNomeDelMedico('Mario', NOME) && eNomeDelMedico('Dr. Provafirma', NOME) && eNomeDelMedico('Mario Provafirma', NOME) && eNomeDelMedico(NOME, NOME));
  assert.ok(!eNomeDelMedico('Mario Rossi', NOME) && !eNomeDelMedico('(partito dopo dettatura)', NOME) && !eNomeDelMedico('Copia: Mario', NOME));
  const lettera = 'Caro collega,\nho visto Mario in controllo.\n\nCordiali saluti,\n\nMario\n(partito dopo dettatura)\nCopia: al paziente Mario';
  const f = firmaDellaLettera(lettera, NOME);
  assert.equal(f.testo, 'Caro collega,\nho visto Mario in controllo.\n\nCordiali saluti,\n\nDr. med. Mario Provafirma\n(partito dopo dettatura)\nCopia: al paziente Mario');
  assert.deepEqual(f.voci, [{ testo: 'Dr. med. Mario Provafirma', n: 0, b: true }, { testo: '(partito dopo dettatura)', n: 0, s: 9 }]);
  // senza saluto finale non si tocca niente; il «Mario» nel corpo resta com'è
  assert.deepEqual(firmaDellaLettera('Mario sta bene.\nMario', NOME), { testo: 'Mario sta bene.\nMario', voci: [] });
  // nel Word
  const docx = await generaDocxReferto({ medico: NOME, intestazione: '', telefono: '', destinatario: 'Dr. Prova', via: '', data: '20.10.2026', titolo: '', paziente: 'Paziente di prova', piede: '', copia: '',
    testo: f.testo, formattazione: f.voci });
  const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string');
  const k = xml.indexOf('>Dr. med. Mario Provafirma</w:t>'), j = xml.indexOf('>(partito dopo dettatura)</w:t>');
  assert.ok(k > 0 && j > k);
  assert.match(xml.slice(xml.lastIndexOf('<w:r>', k), k), /<w:b\/>/);
  assert.match(xml.slice(xml.lastIndexOf('<w:r>', j), j), /<w:sz w:val="18"\/>/);
});

// Le date coi punti (20.10.2026): la stessa regola della catena.
import { dateColPunto } from './date-punti';
test('date: con i punti, non con la barra; pressione e frazioni restano', () => {
  const prima = 'Visita del 12/03/2024, controllo 3/4/24 e ECG 05/2023. PA 130/80 mmHg, 1/2 cp, punteggio 3/5, 31/12/2025, 32/12/2024.';
  const dopo = dateColPunto(prima);
  assert.equal(dopo, 'Visita del 12.03.2024, controllo 3.4.24 e ECG 05.2023. PA 130/80 mmHg, 1/2 cp, punteggio 3/5, 31.12.2025, 32/12/2024.');
  assert.equal(dopo.length, prima.length);
  assert.equal(dateColPunto('senza date'), 'senza date');
});
