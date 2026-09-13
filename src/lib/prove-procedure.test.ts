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

test('preparazione della giornata: mancanze in cima con ora e paziente, non in cartella segnalati, blocchi in ordine di ora', async () => {
  const { aggregaGiornata } = await import('./procedure-regole');
  const f = { tipo: 'documento' as const, id: 'd1', titolo: 'ECG' };
  const voci = [
    { ora: '10:30', paziente: 'Verdi Ugo', medico: 'Dr. X', motivo: 'Controllo', patientId: 'p2', briefing: { sezioni: [{ chiave: 'motivo', titolo: 'Motivo', righe: [{ testo: 'Palpitazioni' }] }, { chiave: 'esami', titolo: 'Esami', righe: [{ testo: 'ECG', fonte: f }] }], mancanti: [{ controllo: 'ecg_12_mesi', testo: 'Nessun ECG.' }], fonti: [f] } },
    { ora: '08:30', paziente: 'Bianchi Anna', medico: null, motivo: null, patientId: null, briefing: null },
  ];
  const e = aggregaGiornata(voci, '13.09.2026');
  assert.equal(e.sezioni[0].chiave, 'mancanze');
  assert.deepEqual(e.sezioni[0].righe.map((r) => r.testo), ['10:30 Verdi Ugo: Nessun ECG.', '08:30 Bianchi Anna: non in cartella']);
  assert.equal(e.sezioni[1].titolo, '08:30 · Bianchi Anna');
  assert.equal(e.sezioni[2].titolo, '10:30 · Verdi Ugo · Dr. X · Controllo');
  assert.equal(e.sezioni[2].righe[1].fonte?.id, 'd1');
  assert.deepEqual(e.mancanti.map((m) => m.controllo), ['ecg_12_mesi', 'non_in_cartella']);
  assert.equal(e.sintesi, '2 appuntamenti il 13.09.2026: 1 con cartella, 1 non in cartella, 1 cosa da segnalare.');
  assert.equal(e.passi[1].nota, '1 in cartella · 1 no');
});

test('lettere in ritardo: confermata senza Word da 3+ giorni, bozza ferma da 7+, referral vista da 10+; le recenti no', async () => {
  const { lettereInRitardo } = await import('./procedure-regole');
  const oggi = new Date('2026-09-13T09:00:00');
  const lettere = [
    { id: 'l1', paziente: 'Bianchi Anna', medico: 'Dr. X', confermata_il: '2026-09-05T10:00:00', dettata_il: '2026-09-04T10:00:00', stato: 'confermata' as const, word_scaricato: false },
    { id: 'l2', paziente: 'Verdi Ugo', medico: null, confermata_il: '2026-09-12T10:00:00', dettata_il: '2026-09-11T10:00:00', stato: 'confermata' as const, word_scaricato: false },
    { id: 'l3', paziente: 'Neri Ida', medico: null, confermata_il: '2026-09-01T10:00:00', dettata_il: '2026-08-30T10:00:00', stato: 'confermata' as const, word_scaricato: true },
    { id: 'l4', paziente: 'Rossi Pia', medico: null, confermata_il: null, dettata_il: '2026-09-01T10:00:00', stato: 'bozza' as const, word_scaricato: false },
    { id: 'l5', paziente: 'Gialli Leo', medico: null, confermata_il: null, dettata_il: '2026-09-11T10:00:00', stato: 'bozza' as const, word_scaricato: false },
  ];
  const viste = [{ id: 'v1', paziente: 'Blu Ada', vista_il: '2026-08-20T10:00:00', medico: null }, { id: 'v2', paziente: 'Blu Eva', vista_il: '2026-09-10T10:00:00', medico: null }];
  const e = lettereInRitardo(lettere, viste, oggi);
  assert.deepEqual(e.sezioni.map((s) => s.chiave), ['senza_word', 'bozze_ferme', 'viste']);
  assert.deepEqual(e.sezioni[0].righe.map((r) => r.fonte?.id), ['l1']);
  assert.deepEqual(e.sezioni[1].righe.map((r) => r.fonte?.id), ['l4']);
  assert.deepEqual(e.sezioni[2].righe.map((r) => r.fonte?.id), ['v1']);
  assert.equal(e.sintesi, '3 lettere in ritardo: 1 confermate senza Word, 1 bozze ferme, 1 referral viste senza referto.');
  assert.equal(lettereInRitardo([], [], oggi).sintesi, 'Nessuna lettera in ritardo.');
});

test('chiusura mensile: numeri nelle sezioni, mancanze solo per ciò che è aperto', async () => {
  const { chiusuraMensile } = await import('./procedure-regole');
  const e = chiusuraMensile({
    mese: 'settembre 2026', dettati: 12, confermati: 9, scartati: 1, ancoraAperti: 2, giorniMedianiConferma: 2,
    referralRicevute: 20, referralChiuse: 15, referralAperteSenzaAppuntamento: [{ id: 'r1', paziente: 'Bianchi Anna', da: '2026-08-01' }],
    richiamiFatti: 4, richiamiScaduti: [], documentiCaricati: 30, senzaEcg: [{ id: 'p1', paziente: 'Verdi Ugo' }], lettereInRitardo: 0,
    tracce: [{ procedura: 'briefing_previsita', n: 5 }], dizionarioConfermato: 3,
  });
  assert.deepEqual(e.mancanti.map((m) => m.controllo), ['bozze_aperte', 'referral_senza_appuntamento', 'ecg_richiami']);
  assert.match(e.sintesi!, /^settembre 2026: 12 referti dettati, 9 confermati \(mediana 2 giorni\), 20 referral ricevute, 4 richiami fatti\. 3 punti aperti/);
  assert.equal(e.sezioni.find((s) => s.chiave === 'referral')!.righe[1].fonte?.id, 'r1');
  assert.equal(e.passi.filter((p) => p.esito === 'mancante').length, 2);
  const pulito = chiusuraMensile({ mese: 'ottobre 2026', dettati: 0, confermati: 0, scartati: 0, ancoraAperti: 0, giorniMedianiConferma: null, referralRicevute: 0, referralChiuse: 0, referralAperteSenzaAppuntamento: [], richiamiFatti: 0, richiamiScaduti: [], documentiCaricati: 0, senzaEcg: [], lettereInRitardo: 0, tracce: [], dizionarioConfermato: 0 });
  assert.equal(pulito.mancanti.length, 0);
  assert.match(pulito.sintesi!, /Nessun punto aperto\.$/);
});
