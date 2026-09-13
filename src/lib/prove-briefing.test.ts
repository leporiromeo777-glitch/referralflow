import test from 'node:test';
import assert from 'node:assert/strict';
import { costruisciBriefing, fattiDalBriefing, testoBriefing, tipoEsame, type IngressoBriefing } from './briefing-regole';

// Dati INVENTATI (nessun paziente vero).
const oggi = new Date('2026-09-13T08:00:00');
const base: IngressoBriefing = {
  oggi,
  documenti: [
    { id: 'd-eco', filename: 'eco.pdf', nota: 'Ecocardiogramma transtoracico del 02.03.2026', categoria: 'imaging', uploaded_at: '2026-03-02T10:00:00' },
    { id: 'd-ecg', filename: 'ecg_2024.pdf', nota: null, categoria: 'ecg', uploaded_at: '2024-11-20T10:00:00' },
    { id: 'd-holter', filename: 'holter.pdf', nota: 'Holter 24h del 20.08.2026', categoria: 'altro', uploaded_at: '2026-08-20T10:00:00' },
    { id: 'd-lettera', filename: 'lettera.docx', nota: 'lettera del 21.07.2026', categoria: 'lettera', uploaded_at: '2026-07-21T10:00:00' },
  ],
  referral: [
    { id: 'r1', quesito: 'Palpitazioni da 3 settimane', urgenza: 'normale', status: 'ricevuta', medico: 'Dr. Prova', created_at: '2026-09-01T09:00:00', follow_up_due: null, follow_up_done_at: null, questionario: { farmaci: 'Aspirina 100', allergie: 'nessuna' } },
    { id: 'r0', quesito: 'Controllo', urgenza: 'normale', status: 'chiusa', medico: null, created_at: '2025-01-10T09:00:00', follow_up_due: '2026-01-10', follow_up_done_at: null, questionario: null },
  ],
  appuntamenti: [
    { id: 'a1', starts_at: '2025-01-20T10:00:00', motivo: 'Visita', medico: 'Dr. Uno', completed_at: '2025-01-20T10:40:00' },
    { id: 'a2', starts_at: '2026-09-13T10:30:00', motivo: 'Controllo', medico: 'Dr. Uno', completed_at: null },
  ],
  refertoPrecedente: { id: 'b-prec', data: '2025-01-22', terapia: ['Aspirina cardio 100 mg 1-0-0', 'Concor 5 mg 1-0-0'], fonte: 'referto' },
  bozze: [],
};

test('tipo di esame dai documenti: categoria e parole del titolo, l’eco vince sull’ECG', () => {
  assert.equal(tipoEsame({ filename: 'x.pdf', nota: 'Ecocardiogramma', categoria: 'altro' }), 'eco');
  assert.equal(tipoEsame({ filename: 'ecg.pdf', nota: null, categoria: 'altro' }), 'ecg');
  assert.equal(tipoEsame({ filename: 'x.pdf', nota: null, categoria: 'ecg' }), 'ecg');
  assert.equal(tipoEsame({ filename: 'x.pdf', nota: 'Duplex carotideo', categoria: 'imaging' }), 'duplex');
  assert.equal(tipoEsame({ filename: 'x.docx', nota: 'lettera', categoria: 'lettera' }), 'lettera');
});

test('briefing: ECG vecchio di 22 mesi → mancante; eco di 6 mesi → ok; terapia dalla lettera; richiamo scaduto; prossimo appuntamento', () => {
  const b = costruisciBriefing(base);
  const passo = (p: string) => b.passi.find((x) => x.passo.startsWith(p));
  assert.equal(passo('ECG')?.esito, 'mancante');
  assert.equal(passo('Ecocardiogramma')?.esito, 'ok');
  assert.equal(passo('Ultimo referto')?.esito, 'ok');
  assert.deepEqual(b.mancanti.map((m) => m.controllo), ['ecg_12_mesi', 'richiamo_scaduto']);
  const terapia = b.sezioni.find((s) => s.chiave === 'terapia')!;
  assert.equal(terapia.righe.length, 2);
  assert.equal(terapia.righe[0].fonte?.id, 'b-prec');
  const visite = b.sezioni.find((s) => s.chiave === 'visite')!;
  assert.match(visite.righe[0].testo, /Ultima visita: 20\.01\.2025/);
  assert.match(visite.righe[1].testo, /Prossimo appuntamento: 13\.09\.2026 10:30/);
  const q = b.sezioni.find((s) => s.chiave === 'questionario')!;
  assert.equal(q.righe.length, 2);
  // gli esami escludono la lettera; ogni riga ha una fonte
  const esami = b.sezioni.find((s) => s.chiave === 'esami')!;
  assert.deepEqual(esami.righe.map((r) => r.fonte?.id), ['d-holter', 'd-eco', 'd-ecg']);
  assert.ok(b.fonti.some((f) => f.tipo === 'documento' && f.id === 'd-holter'));
});

test('briefing senza nulla: terapia da chiedere, ECG ed eco mancanti, niente in sospeso', () => {
  const b = costruisciBriefing({ oggi, documenti: [], referral: [], appuntamenti: [], refertoPrecedente: null, bozze: [] });
  assert.deepEqual(b.mancanti.map((m) => m.controllo), ['lettera_precedente', 'ecg_12_mesi', 'eco_24_mesi']);
  assert.ok(!b.sezioni.some((s) => s.chiave === 'sospeso'));
  assert.equal(b.passi.filter((p) => p.esito === 'mancante').length, 3);
  const t = testoBriefing('Rossi Mario', b);
  assert.match(t, /^Briefing pre-visita per Rossi Mario/);
  assert.match(t, /Da segnalare al medico:/);
});

test('fatti dal briefing: un arco per documento, terapia, referral aperta, visite e mancanze, con la fonte', () => {
  const b = costruisciBriefing(base);
  const f = fattiDalBriefing(b, base);
  const per = (r: string) => f.filter((x) => x.relazione === r);
  assert.equal(per('ha_documento').length, 4);
  assert.equal(per('terapia_riga').length, 2);
  assert.equal(per('referral_aperta').length, 1);
  assert.equal(per('prossimo_appuntamento').length, 1);
  assert.equal(per('ultima_visita').length, 1);
  assert.equal(per('esame_mancante').length, 1);
  assert.equal(per('richiamo_scaduto').length, 1);
  assert.equal(per('prossimo_appuntamento')[0].data_fatto, '2026-09-13');
  assert.ok(per('ha_documento').every((x) => x.fonte_tipo === 'documento' && x.fonte_id));
  // una bozza da rivedere diventa un fatto e una mancanza
  const b2 = costruisciBriefing({ ...base, bozze: [{ id: 'boz', created_at: '2026-09-10T09:00:00', critiche: 2 }] });
  assert.ok(b2.sezioni.find((s) => s.chiave === 'sospeso')?.righe.some((r) => /2 critiche/.test(r.testo)));
  assert.equal(fattiDalBriefing(b2, base).filter((x) => x.relazione === 'bozza_da_rivedere').length, 1);
});
