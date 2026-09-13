import test from 'node:test';
import assert from 'node:assert/strict';
import { PROCEDURE, elencoPerPrompt, meseDaDomanda, procedurePerRuolo, trovaProcedura } from './procedure-registro';
import { analizzaOrganizzazione, responsabileDi } from './organizzazione';

test('registro: ogni procedura ha ruoli, frasi valide, chip; l’inviante non ne ha nessuna', () => {
  for (const p of PROCEDURE) {
    assert.ok(p.ruoli.length >= 1, p.nome);
    assert.ok(p.frasi.length >= 2, p.nome);
    for (const f of p.frasi) assert.doesNotThrow(() => new RegExp(f, 'i'), `${p.nome}: ${f}`);
    assert.ok(p.chip.length >= 1, p.nome);
  }
  assert.equal(procedurePerRuolo('inviante').length, 0);
  assert.equal(procedurePerRuolo('secretary').length, PROCEDURE.length);
});

test('trovaProcedura: le frasi giuste attivano la procedura giusta, le più specifiche vincono', () => {
  assert.equal(trovaProcedura('briefing di Bernasconi')?.nome, 'briefing_previsita');
  assert.equal(trovaProcedura('briefing di tutti i pazienti di oggi')?.nome, 'preparazione_giornata');
  assert.equal(trovaProcedura('preparami la giornata')?.nome, 'preparazione_giornata');
  assert.equal(trovaProcedura('cosa è cambiato dall’ultima visita?')?.nome, 'cambiamenti_ultima_visita');
  assert.equal(trovaProcedura('chi devo richiamare questo mese')?.nome, 'richiami_mese');
  assert.equal(trovaProcedura('posso firmare questo referto?')?.nome, 'controllo_prefirma');
  assert.equal(trovaProcedura('lettere in ritardo')?.nome, 'lettere_ritardo');
  assert.equal(trovaProcedura('chiusura di agosto 2026')?.nome, 'chiusura_mensile');
  assert.equal(trovaProcedura('quanti appuntamenti oggi?'), null);
  assert.equal(trovaProcedura('briefing di Rossi', 'inviante'), null);
  assert.equal(meseDaDomanda('chiusura di agosto 2026'), '2026-08');
  assert.equal(meseDaDomanda('numeri del mese di marzo', new Date('2026-09-13')), '2026-03');
  assert.equal(meseDaDomanda('numeri del mese'), null);
  assert.match(elencoPerPrompt('doctor'), /«Briefing pre-visita»/);
});

test('organizzazione: il parser legge ruoli, responsabilità con procedura e servizi dalla tabella', () => {
  const md = `# Titolo
## Ruoli
| ruolo | descrizione |
|---|---|
| Segreteria | Riceve e prepara |
| Medico | Visita |
## Responsabilità
| ruolo | cosa | quando | procedura | note |
|---|---|---|---|---|
| Segreteria | Preparare la giornata | ogni mattina | \`preparazione_giornata\` | — |
| Medico | Decidere il richiamo | alla visita | — | mesi |
## Servizi e dati
| servizio | ruolo responsabile | dati | note |
|---|---|---|---|
| Agenda | Segreteria | appuntamenti | sola lettura |
`;
  const org = analizzaOrganizzazione(md);
  assert.deepEqual(org.ruoli.map((r) => r.ruolo), ['Segreteria', 'Medico']);
  assert.equal(org.responsabilita.length, 2);
  assert.equal(org.responsabilita[0].procedura, 'preparazione_giornata');
  assert.equal(org.responsabilita[1].procedura, null);
  assert.equal(org.responsabilita[1].note, 'mesi');
  assert.equal(org.servizi[0].servizio, 'Agenda');
  assert.equal(responsabileDi(org, 'preparazione_giornata')?.ruolo, 'Segreteria');
  assert.equal(responsabileDi(org, 'x'), null);
});

test('organizzazione: la pagina wiki vera si legge e copre ogni procedura del registro', async () => {
  const fs = await import('fs');
  const md = fs.readFileSync('docs/wiki/Piattaforma/Organizzazione dello studio.md', 'utf8');
  const org = analizzaOrganizzazione(md);
  assert.ok(org.ruoli.length >= 3);
  for (const p of PROCEDURE) assert.ok(responsabileDi(org, p.nome), `nessun responsabile per ${p.nome}`);
  for (const r of org.responsabilita) if (r.procedura) assert.ok(PROCEDURE.some((p) => p.nome === r.procedura), `procedura sconosciuta ${r.procedura}`);
});
