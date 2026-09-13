import test from 'node:test';
import assert from 'node:assert/strict';
import { PROCEDURE } from './procedure-registro';
import { candidatiProcedura, distanza, giornoDaTesto, interpreta, meseDaTesto, normalizza, pazienteDaTesto, somiglia } from './interprete';

// Dati INVENTATI.
const pazienti = [
  { id: 'p1', cognome: 'Bernasconi', nome: 'Luca' },
  { id: 'p2', cognome: 'Pedrazzini', nome: 'Maria' },
  { id: 'p3', cognome: 'Rusconi', nome: 'Pietro' },
  { id: 'p4', cognome: 'Galli', nome: 'Sofia' },
  { id: 'p5', cognome: 'Galli', nome: 'Marco' },
];
const oggi = new Date('2026-09-13T09:00:00');
const I = (q: string, contesto = {}) => interpreta(q, { registro: PROCEDURE, pazienti, contesto, oggi });

test('normalizzazione e refusi: accenti, apostrofi, distanza, somiglianza', () => {
  assert.equal(normalizza('Cos’è cambiato dall’ULTIMA visita?'), 'cos e cambiato dall ultima visita');
  assert.equal(distanza('ciusura', 'chiusura', 2), 1);
  assert.ok(somiglia('ciusura', 'chiusura'));
  assert.ok(somiglia('briefng', 'briefing'));
  assert.ok(somiglia('preparami', 'prepar'));
  assert.ok(!somiglia('mese', 'mensile'));
  assert.ok(!somiglia('cosa', 'chiusura'));
});

test('refusi dell’utente: «ciusura mensile» e «brifing di Bernasconi» vanno alla procedura giusta', () => {
  const c = I('ciusura mensile');
  assert.equal(c.procedura?.nome, 'chiusura_mensile');
  assert.equal(c.sicurezza, 'alta');
  const b = I('brifing di Bernasconi');
  assert.equal(b.procedura?.nome, 'briefing_previsita');
  assert.equal(b.sicurezza, 'alta');
  assert.equal(I('terapia di Rusconi rispetto a prima').sicurezza, 'media');
  assert.equal(b.paziente?.id, 'p1');
  assert.deepEqual(b.mancano, []);
});

test('paziente: cognome con refuso, nome ambiguo tra due Galli, cognome+nome vince, contesto della pagina', () => {
  assert.equal(pazienteDaTesto(normalizza('briefing di Pedrazini'), pazienti).paziente?.id, 'p2');
  const g = pazienteDaTesto(normalizza('cosa è cambiato per Galli'), pazienti);
  assert.equal(g.paziente, null);
  assert.deepEqual(g.ambigui.map((p) => p.id), ['p4', 'p5']);
  assert.equal(pazienteDaTesto(normalizza('briefing di Sofia Galli'), pazienti).paziente?.id, 'p4');
  const ctx = I('briefing pre-visita', { paziente_id: 'p3' });
  assert.equal(ctx.paziente?.id, 'p3');
  const senza = I('briefing pre-visita');
  assert.deepEqual(senza.mancano, ['paziente']);
});

test('mese e giorno dal testo: nomi dei mesi, mese scorso, domani, date svizzere', () => {
  assert.equal(meseDaTesto('chiusura di agosto', oggi), '2026-08');
  assert.equal(meseDaTesto('numeri del mese scorso', oggi), '2026-08');
  assert.equal(meseDaTesto('bilancio marzo 2025', oggi), '2025-03');
  assert.equal(giornoDaTesto('prepara la giornata di domani', oggi), '2026-09-14');
  assert.equal(giornoDaTesto('prepara il 15.09', oggi), '2026-09-15');
  const c = I('come e andato il mese scorso');
  assert.equal(c.procedura?.nome, 'chiusura_mensile');
  assert.equal(c.mese, '2026-08');
});

test('domande scritte in modi diversi: parole chiave senza le frasi del registro', () => {
  assert.equal(I('arretrati di lettere da spedire')?.procedura?.nome, 'lettere_ritardo');
  assert.equal(I('chi scade con i controlli periodici questo mese')?.procedura?.nome, 'richiami_mese');
  assert.equal(I('evoluzione della terapia di Rusconi rispetto alla visita precedente')?.procedura?.nome, 'cambiamenti_ultima_visita');
  assert.equal(I('cosa devo sapere prima di ricevere Pedrazzini')?.procedura?.nome, 'briefing_previsita');
  assert.equal(I('è pronto per la sigla il referto di Bernasconi', { pagina: 'reports' })?.procedura?.nome, 'controllo_prefirma');
  assert.equal(I('preparami tutti i pazienti di domani').procedura?.nome, 'preparazione_giornata');
});

test('domande libere e numeri restano libere; i candidati spiegano il perché', () => {
  assert.equal(I('quanti appuntamenti ci sono oggi?').sicurezza, 'nessuna');
  assert.equal(I('che esami abbiamo fatto oggi').paziente, null);
  assert.equal(I('esami di Luca Bernasconi').paziente?.id, 'p1');
  assert.equal(I('trovami il duplex di Ortelli').procedura, null);
  assert.equal(I('qual è la terapia in corso?', { paziente_id: 'p2' }).procedura, null);
  const c = candidatiProcedura(normalizza('briefing di Bernasconi'), PROCEDURE);
  assert.equal(c[0].nome, 'briefing_previsita');
  assert.ok(c[0].perche.some((x) => x.startsWith('frase')));
});
