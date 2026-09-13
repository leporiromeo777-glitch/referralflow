import test from 'node:test';
import assert from 'node:assert/strict';
import { confrontaReferti, controlloPreFirma, richiamiDelMese } from './procedure-regole';

// Dati INVENTATI.
const misure = (t: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  const fe = t.match(/FE\s*(\d+)/); if (fe) out.FE = [fe[1]];
  const pa = t.match(/(\d+\/\d+)\s*mmHg/); if (pa) out.PA = [pa[1]];
  const fc = t.match(/(\d+)\s*bpm/); if (fc) out.FC = [fc[1]];
  return out;
};

test('cosa è cambiato: misure diverse, terapia nuova/modificata/tolta, con la fonte giusta', () => {
  const prima = { id: 'r1', data: '2025-03-01', testo: 'FE 60%. PA 130/80 mmHg. FC 70 bpm.\nTerapia:\nAspirina cardio 100 mg 1-0-0\nConcor 5 mg 1-0-0\nAtorvastatina 20 mg 0-0-1\n\nCordiali saluti' };
  const dopo = { id: 'r2', data: '2026-09-01', testo: 'FE 45%. PA 130/80 mmHg.\nTerapia:\nAspirina cardio 100 mg 1-0-0\nConcor 10 mg 1-0-0\nEzetimibe 10 mg 0-0-1\n\nCordiali saluti' };
  const e = confrontaReferti(prima, dopo, misure);
  const mis = e.sezioni.find((s) => s.chiave === 'misure')!;
  assert.equal(mis.righe[0].testo, 'FE: 60 → 45');
  assert.equal(mis.righe[0].fonte?.id, 'r2');
  assert.match(mis.righe[1].testo, /Invariate: PA 130\/80/);
  assert.match(mis.righe[2].testo, /Solo nel precedente: FC 70/);
  const ter = e.sezioni.find((s) => s.chiave === 'terapia')!.righe.map((r) => r.testo);
  assert.ok(ter.some((t) => t.startsWith('Modificata: Concor 5 mg 1-0-0 → Concor 10 mg 1-0-0')));
  assert.ok(ter.some((t) => t === 'Nuova: Ezetimibe 10 mg 0-0-1'));
  assert.ok(ter.some((t) => t === 'Tolta: Atorvastatina 20 mg 0-0-1'));
  assert.ok(ter.some((t) => t === '1 righe invariate'));
  assert.match(e.sintesi!, /^4 cambiamenti/);
  assert.equal(e.mancanti.length, 0);
});

test('cosa è cambiato: con un solo referto la procedura si ferma e lo dice', () => {
  const e = confrontaReferti(null, { id: 'r2', data: null, testo: 'x' }, misure);
  assert.equal(e.passi[0].esito, 'mancante');
  assert.equal(e.mancanti[0].controllo, 'due_referti');
  assert.equal(e.sezioni.length, 0);
});

test('richiami del mese: scaduti, 7 giorni, 30 giorni; oltre 30 giorni fuori; mancanza solo se scaduti', () => {
  const oggi = new Date('2026-09-13T09:00:00');
  const righe = [
    { id: 'a', tipo: 'referral' as const, due: '2026-09-01', mesi: 6, paziente: 'Bianchi Anna', medico: 'Dr. X', motivo: 'Controllo', patient_id: 'p1' },
    { id: 'b', tipo: 'appuntamento' as const, due: '2026-09-15', mesi: 12, paziente: 'Verdi Ugo', medico: null, motivo: null, patient_id: null },
    { id: 'c', tipo: 'referral' as const, due: '2026-10-05', mesi: 3, paziente: 'Neri Ida', medico: null, motivo: 'Holter', patient_id: 'p3' },
    { id: 'd', tipo: 'referral' as const, due: '2026-12-01', mesi: 3, paziente: 'Fuori Mese', medico: null, motivo: null, patient_id: 'p4' },
  ];
  const e = richiamiDelMese(righe, oggi, 2);
  assert.deepEqual(e.sezioni.map((s) => s.chiave), ['scaduti', 'settimana', 'mese']);
  assert.equal(e.sezioni[0].righe[0].fonte?.id, 'a');
  assert.match(e.sezioni[2].righe[0].testo, /Neri Ida · 05\.10\.2026 · a 3 mesi · Holter/);
  assert.equal(e.mancanti[0].controllo, 'richiami_scaduti');
  assert.match(e.sintesi!, /^3 richiami entro 30 giorni: 1 scaduti, 1 questa settimana, 1 nel resto del mese\. 2 fatti/);
  const vuoto = richiamiDelMese([], oggi, 0);
  assert.equal(vuoto.mancanti.length, 0);
  assert.equal(vuoto.sezioni[0].chiave, 'nessuno');
});

test('controllo prima della firma: critiche aperte e campi mancanti bloccano; verifica ridotta è solo presa d’atto', () => {
  const base = {
    bozzaId: 'b1', stato: 'bozza', livelloVerifica: 'pieno', fiducia: { punteggio: 82, livello: 'alta' },
    issues: [{ cat: 'NO_SOURCE', sev: 'critical' }, { cat: 'OMISSION', sev: 'critical' }, { cat: 'NUMERIC', sev: 'verify' }],
    fatte: ['a0'], chiuse: 1, campi: { nome_paziente: 'Rossi Mario', data_nascita: '01.01.1950', medico_destinatario: 'non indicato' },
    testoFinale: true, letteraPrecedente: false, dettatoConTerapia: true,
  };
  const e = controlloPreFirma(base);
  assert.deepEqual(e.mancanti.map((m) => m.controllo), ['critiche_aperte', 'campi']);
  assert.match(e.sintesi!, /^Non ancora pronto per la firma: 2 punti/);
  assert.match(e.mancanti[0].testo, /1 segnalazione critica ancora aperta/);
  const ok = controlloPreFirma({ ...base, fatte: ['a0', 'r1'], campi: { ...base.campi, medico_destinatario: 'Dr. Bianchi' } });
  assert.equal(ok.mancanti.length, 0);
  assert.equal(ok.sintesi, 'Pronto per la firma: nessun punto aperto.');
  const ridotto = controlloPreFirma({ ...base, fatte: ['a0', 'r1'], campi: { ...base.campi, medico_destinatario: 'Dr. Bianchi' }, livelloVerifica: 'ridotto' });
  assert.deepEqual(ridotto.mancanti.map((m) => m.controllo), ['verifica_ridotta']);
  assert.match(ridotto.sintesi!, /^Pronto per la firma con presa d’atto: 1 avviso/);
  const senzaTerapia = controlloPreFirma({ ...ok, ...base, fatte: ['a0', 'r1'], campi: { ...base.campi, medico_destinatario: 'X' }, dettatoConTerapia: false });
  assert.ok(senzaTerapia.mancanti.some((m) => m.controllo === 'terapia'));
});
