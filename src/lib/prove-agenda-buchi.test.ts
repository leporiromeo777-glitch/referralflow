import test from 'node:test';
import assert from 'node:assert/strict';
import { abbina, buchi, frase, perQuestoBuco, perQuestoPaziente, valuta, type Appunt, type Candidato } from './agenda-buchi';

const a = (id: string, medico: string, dalle: number, minuti: number, giorno = '2026-09-17'): Appunt =>
  ({ id, medico, giorno, inizio: dalle, fine: dalle + minuti });

const cand = (p: Partial<Candidato> & { id: string }): Candidato => ({
  tipo: 'richiamo', paziente: 'Paziente Finto', patientId: null, prestazione: 'Visita cardiologica',
  durata: 20, medico: null, scadenza: null, giorniDiRitardo: 0, quesito: null, ...p,
});

test('un buco è il vuoto fra due visite, non la fine della giornata', () => {
  const b = buchi([a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 10 * 60, 30)]);
  assert.equal(b.length, 1);
  assert.equal(b[0].dalle, 9 * 60 + 30);
  assert.equal(b[0].minuti, 30);
  // Dopo l'ultima visita non c'è nessun buco: il medico ha finito.
  assert.equal(buchi([a('1', 'Rossi', 9 * 60, 30)]).length, 0);
});

test('i vuoti troppo corti e quelli enormi non sono buchi da riempire', () => {
  const corto = buchi([a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 9 * 60 + 40, 30)]);
  assert.equal(corto.length, 0, 'dieci minuti non sono un buco');
  const enorme = buchi([a('1', 'Rossi', 8 * 60, 30), a('2', 'Rossi', 17 * 60, 30)]);
  assert.equal(enorme.length, 0, 'otto ore vogliono dire che al pomeriggio non c’è');
});

test('due visite sovrapposte non aprono un buco fra loro', () => {
  const b = buchi([a('1', 'Rossi', 9 * 60, 60), a('2', 'Rossi', 9 * 60 + 15, 15), a('3', 'Rossi', 10 * 60 + 30, 30)]);
  assert.equal(b.length, 1);
  assert.equal(b[0].dalle, 10 * 60, 'il tempo libero riparte dalla fine della visita più lunga');
});

test('ogni medico ha i suoi buchi, e senza medico non ce ne sono', () => {
  const b = buchi([a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 10 * 60, 30), a('3', 'Bianchi', 9 * 60, 30), a('4', 'Bianchi', 11 * 60, 30), a('5', '', 9 * 60, 30), a('6', '', 12 * 60, 30)]);
  assert.deepEqual(b.map((x) => x.medico).sort(), ['Bianchi', 'Rossi']);
});

test('il buco dell’ora di pranzo è segnato come tale', () => {
  const b = buchi([a('1', 'Rossi', 11 * 60 + 30, 30), a('2', 'Rossi', 13 * 60, 30)]);
  assert.equal(b.length, 1);
  assert.equal(b[0].pausa, true);
});

test('chi non ci sta dentro non è una proposta', () => {
  const b = buchi([a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 9 * 60 + 55, 30)])[0];
  assert.equal(b.minuti, 25);
  assert.equal(valuta(b, cand({ id: 'c1', durata: 45 })), null);
  assert.ok(valuta(b, cand({ id: 'c2', durata: 20 })));
});

test('il medico che non fa quella prestazione non riceve la proposta', () => {
  const b = buchi([a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 10 * 60, 30)])[0];
  const puoFare = (medico: string, prestazione: string | null) => !(medico === 'Rossi' && prestazione === 'Ecocardiogramma');
  assert.equal(valuta(b, cand({ id: 'c1', prestazione: 'Ecocardiogramma' }), puoFare), null);
  assert.ok(valuta(b, cand({ id: 'c2', prestazione: 'Visita cardiologica' }), puoFare));
});

test('vince chi è del medico giusto ed è in ritardo da più tempo', () => {
  const b = buchi([a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 10 * 60, 30)])[0];
  const suo = valuta(b, cand({ id: 'c1', medico: 'Dr. med. Rossi', giorniDiRitardo: 60 }))!;
  const altrui = valuta(b, cand({ id: 'c2', medico: 'Bianchi', giorniDiRitardo: 60 }))!;
  const puntuale = valuta(b, cand({ id: 'c3', medico: 'Dr. med. Rossi', giorniDiRitardo: 0 }))!;
  assert.ok(suo.punteggio > altrui.punteggio);
  assert.ok(suo.punteggio > puntuale.punteggio);
  assert.ok(suo.perche.some((x) => x.includes('paziente di Rossi')), suo.perche.join(' · '));
  assert.ok(suo.perche.some((x) => x.includes('scaduto da 2 mesi')), suo.perche.join(' · '));
});

test('a ogni buco un paziente solo, e a ogni paziente un buco solo', () => {
  const app = [a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 10 * 60, 30), a('3', 'Rossi', 11 * 60, 30)];
  const b = buchi(app);
  assert.equal(b.length, 2);
  const c = [cand({ id: 'c1', giorniDiRitardo: 90 }), cand({ id: 'c2', giorniDiRitardo: 10 }), cand({ id: 'c3', giorniDiRitardo: 5 })];
  const p = abbina(b, c);
  assert.equal(p.length, 2);
  assert.equal(new Set(p.map((x) => x.candidato.id)).size, 2);
  assert.equal(new Set(p.map((x) => `${x.buco.giorno}${x.buco.dalle}`)).size, 2);
  assert.ok(p.some((x) => x.candidato.id === 'c1'), 'il più in ritardo entra di sicuro');
});

test('«chi altro?» e «dove lo metto?» guardano la stessa regola dai due lati', () => {
  const app = [a('1', 'Rossi', 9 * 60, 30), a('2', 'Rossi', 10 * 60, 30), a('3', 'Bianchi', 14 * 60, 30), a('4', 'Bianchi', 15 * 60, 30)];
  const b = buchi(app);
  const c = [cand({ id: 'c1', giorniDiRitardo: 40 }), cand({ id: 'c2', durata: 45 })];
  const perBuco = perQuestoBuco(b[0], c);
  assert.equal(perBuco.length, 1, 'quello da 45 minuti non ci sta in mezz’ora');
  const perPaziente = perQuestoPaziente(c[0], b);
  assert.equal(perPaziente.length, 2, 'lo stesso paziente sta in tutti e due i buchi da 30');
});

test('la frase per la segretaria dice chi, quando, con chi e perché', () => {
  const b = buchi([a('1', 'Dr. med. Rossi', 9 * 60, 30), a('2', 'Dr. med. Rossi', 10 * 60, 30)])[0];
  const f = frase({ buco: b, candidato: cand({ id: 'c1', paziente: 'Bianchi Anna', giorniDiRitardo: 40, medico: 'Dr. med. Rossi' }), punteggio: 1, perche: ['è un paziente di Rossi', 'il richiamo è scaduto da 1 mese'] });
  assert.ok(f.includes('Bianchi Anna'));
  assert.ok(f.includes('09:30'));
  assert.ok(f.includes('10:00'));
  assert.ok(f.includes('Rossi'));
  assert.ok(f.includes('scaduto'));
});

test('la pausa pranzo intera non è un buco da riempire', () => {
  // 11:15 → 14:00: non è un buco, è la mattina che finisce.
  const lunga = buchi([a('1', 'Rossi', 10 * 60 + 45, 30), a('2', 'Rossi', 14 * 60, 30)]);
  assert.equal(lunga.length, 0);
  // Mezz'ora a cavallo di mezzogiorno invece sì, ma segnata come pausa.
  const corta = buchi([a('1', 'Rossi', 11 * 60 + 30, 30), a('2', 'Rossi', 12 * 60 + 30, 30)]);
  assert.equal(corta.length, 1);
  assert.equal(corta[0].pausa, true);
});
