// La conoscenza di Cleo (23.10.2026): pezzi della wiki e scelta per la domanda. Testi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicizza, pezziDaPagina, radici, RX_DOMANDA_GUIDA, scegliPezzi } from './guida';

const REFERTI = `---\ntipo: guida\n---\n# Referti\nLe lettere dettate diventano referti da rivedere, confermare e mandare.\n\n## Come confermo un referto?\n1. Apri la bozza.\n2. Premi «Conferma referto» in basso a destra.\nParole: confermare, firmare, approvare, chiudere\n\n## Come scarico il Word?\nPremi «Word» nella barra in alto della revisione.\nParole: scaricare, docx, lettera, stampare\n`;
const AGENDA = `# Agenda\nL'agenda del giorno.\n\n## Come vedo un altro giorno?\nUsa le frecce ‹ › accanto alla data in alto.\nParole: calendario, data, domani, ieri\n`;
const TECNICA = `# Prototipo stack\n## Revisione\nLa revisione dei referti usa la rotta /api/referti/conferma e il pulsante «Conferma referto».\n`;

test('guida: una pagina in pezzi, uno per sezione, col titolo della pagina', () => {
  const p = pezziDaPagina('Guida/Referti.md', REFERTI, 1);
  assert.deepEqual(p.map((x) => x.titolo), ['Referti', 'Come confermo un referto?', 'Come scarico il Word?']);
  assert.ok(p.every((x) => x.pagina === 'Referti' && x.peso === 1));
  const lunga = pezziDaPagina('x.md', `# T\n## S\n${Array.from({ length: 40 }, (_, i) => `Capoverso ${i} ${'parola '.repeat(20)}`).join('\n\n')}`, 1);
  assert.ok(lunga.length > 3 && lunga.every((x) => x.testo.length <= 1400 * 1.6));
});

test('guida: le radici tolgono accenti e parole vuote, e uniscono le forme', () => {
  assert.deepEqual(radici('Come faccio a confermare il referto?'), ['confer', 'refert']);
  assert.deepEqual(radici('confermato, confermare'), ['confer', 'confer']);
});

test('guida: la domanda trova la sezione giusta, la guida vale più della documentazione', () => {
  const ix = indicizza([...pezziDaPagina('Guida/Referti.md', REFERTI, 1), ...pezziDaPagina('Guida/Agenda.md', AGENDA, 1), ...pezziDaPagina('Piattaforma/Prototipo stack.md', TECNICA, 0.6)]);
  assert.equal(scegliPezzi(ix, 'come si conferma un referto')[0].pezzo.titolo, 'Come confermo un referto?');
  assert.equal(scegliPezzi(ix, 'voglio vedere il calendario di domani')[0].pezzo.titolo, 'Come vedo un altro giorno?');
  assert.equal(scegliPezzi(ix, 'stampare la lettera in docx')[0].pezzo.titolo, 'Come scarico il Word?');
  assert.deepEqual(scegliPezzi(ix, 'la pressione del paziente'), []);
});

test('guida: quali domande sono su come si usa il software', () => {
  for (const q of ['Come faccio a caricare un documento?', 'dov\'è il tasto per confermare', 'a cosa serve la pagina Sale', 'non riesco a trovare il paziente', 'il microfono non funziona']) assert.ok(RX_DOMANDA_GUIDA.test(q), q);
  for (const q of ['quanti appuntamenti ho oggi', 'riassumi la lettera']) assert.ok(!RX_DOMANDA_GUIDA.test(q), q);
});
