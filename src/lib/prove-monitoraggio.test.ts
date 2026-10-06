// Monitoraggio remoto (6.10.2026): regole, normalizzazione, simulatore,
// permessi, assistente. Tutto puro e con dati inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizza, puoMon, vistaTecnica, parametro, type Capacita, type DispositivoAbbinato } from './monitoraggio/catalogo';
import { REGOLE_DEMO, conProfilo, controllaRegola, decidi, rientrato, statoConnessione, statoPaziente, valutaParametro, valutaTecnica, type MisuraVista, type Regola, type StatoTecnico } from './monitoraggio/regole';
import { PAZIENTI_DEMO, ecgPezzo, genera, pazientiDaSeminare, statoIniziale, valore, type StatoSim } from './monitoraggio/simulatore';
import { rispostaAmmessa, testoFisso, type Fatti } from './monitoraggio/assistente';

const T = Date.UTC(2026, 9, 6, 12, 0, 0);
const R = (chiave: string) => REGOLE_DEMO.find((r) => r.chiave === chiave)!;
// Una serie di misure ogni 15 secondi che finisce a T: `fn(secondi fa)` dà il valore.
const serie = (parametro: string, minuti: number, fn: (fa: number) => number, qualita = 90): MisuraVista[] =>
  Array.from({ length: minuti * 4 + 1 }, (_, i) => { const fa = (minuti * 4 - i) * 15; return { parametro, valore: fn(fa), quando: T - fa * 1000, ricevuta: T - fa * 1000 + 800, qualita }; });

test('catalogo: una misura entra pulita o non entra', () => {
  const cap: Capacita[] = [{ parametro: 'fc', modo: 'continuo', intervallo_s: 15, invio_s: 15 }, { parametro: 'postura', modo: 'continuo', intervallo_s: 60, invio_s: 60 }];
  const m = (x: object) => normalizza({ dispositivo: 'd', parametro: 'fc', valore: 72, unita: '', acquisita_il: new Date(T - 1000), provenienza: 'simulato', ...x } as any, cap, 'demo', new Date(T));
  const buona = m({}) as any;
  assert.equal(buona.valore, 72); assert.equal(buona.unita, 'bpm'); assert.equal(buona.recuperata, false);
  assert.deepEqual(m({ parametro: 'spo2' }), { motivo: 'parametro_non_dichiarato' }, 'il dispositivo non ha dichiarato quel parametro');
  assert.deepEqual(m({ valore: 900 }), { motivo: 'fuori_scala' }, 'non plausibile: non si corregge, manca');
  assert.deepEqual(m({ valore: null }), { motivo: 'valore_assente' });
  assert.deepEqual(m({ acquisita_il: new Date(T + 300_000) }), { motivo: 'orario_futuro' });
  assert.deepEqual(m({ provenienza: 'misurato' }), { motivo: 'demo_non_simulata' }, 'in demo entra solo ciò che è dichiarato simulato');
  assert.equal((m({ acquisita_il: new Date(T - 20 * 60_000) }) as any).recuperata, true, 'arrivata molto dopo: è storia, non l\'adesso');
  assert.equal((m({ parametro: 'postura', valore: undefined, valore_testo: 'supino' }) as any).valore_testo, 'supino');
  assert.equal(parametro('glicemia', 'mg/dl').unita, 'mg/dl', 'un parametro nuovo resta utilizzabile');
});

test('regole: soglia, durata, misure valide, qualità, freschezza', () => {
  const r = R('fc_alta');   // sopra 120 per 120 s, almeno 4 misure, qualità ≥ 50, freschezza 120 s
  const alta = valutaParametro(r, serie('fc', 5, () => 131), T);
  assert.equal(alta.stato, 'vera');
  assert.match((alta as any).spiegazione, /Frequenza cardiaca sopra 120 bpm per almeno 2 min: \d+ misure valide/);
  assert.equal(valutaParametro(r, serie('fc', 5, () => 96), T).stato, 'falsa');
  assert.equal(valutaParametro(r, serie('fc', 5, (fa) => (fa <= 45 ? 131 : 96)), T).stato, 'falsa', 'oltre soglia da 45 secondi: troppo poco, non è ancora un avviso');
  assert.deepEqual(valutaParametro(r, serie('fc', 1, () => 131), T), { stato: 'non_valutabile', motivo: 'anomalia presente da troppo poco' }, 'solo un minuto di dati, tutti oltre soglia: non si può ancora dire che duri');
  assert.equal(valutaParametro(r, serie('fc', 5, (fa) => (fa === 60 ? 110 : 131)), T).stato, 'falsa', 'una misura sotto soglia dentro la finestra: l\'anomalia non è durata');
  assert.equal(valutaParametro(r, serie('fc', 5, () => 131, 30), T).stato, 'non_valutabile', 'segnale scarso: non si valuta');
  assert.equal(valutaParametro(r, serie('fc', 5, () => 131).map((m) => ({ ...m, quando: m.quando - 10 * 60_000 })), T).stato, 'non_valutabile', 'dati vecchi: non si valuta');
  assert.equal(valutaParametro(r, [], T).stato, 'non_valutabile');
  const inMoto = [...serie('fc', 5, () => 131), ...serie('attivita', 5, () => 80)];
  assert.deepEqual(valutaParametro(r, inMoto, T), { stato: 'non_valutabile', motivo: 'attività in corso' }, 'il contesto: durante l\'attività la regola a riposo non vale');
  // misure a intervalli: due di fila oltre soglia, senza durata
  const pa = R('pa_sistolica_alta');
  const due = (a: number, b: number): MisuraVista[] => [{ parametro: 'pa_sistolica', valore: a, quando: T - 1800_000, ricevuta: T - 1800_000, qualita: null }, { parametro: 'pa_sistolica', valore: b, quando: T - 900_000, ricevuta: T - 900_000, qualita: null }];
  assert.equal(valutaParametro(pa, due(190, 188), T).stato, 'vera');
  assert.equal(valutaParametro(pa, due(150, 188), T).stato, 'falsa');
});

test('regole: isteresi, rientro, deduplicazione, ricaduta, silenzio dopo la chiusura', () => {
  const r = R('fc_alta');   // ingresso sopra 120, rientro sotto 110
  assert.equal(rientrato(r, serie('fc', 3, () => 115), T), false, 'fra rientro e soglia: né avviso nuovo né rientro');
  assert.equal(rientrato(r, serie('fc', 3, () => 104), T), true);
  const vera = valutaParametro(r, serie('fc', 5, () => 131), T), falsa = { stato: 'falsa' } as const;
  assert.equal(decidi(r, vera, null, false, null, T), 'apri');
  assert.equal(decidi(r, falsa, null, false, null, T), 'niente');
  const aperto = { stato: 'aperto' as const, rientrato_il: null, ultima_notifica: T - 60_000 };
  assert.equal(decidi(r, vera, aperto, false, null, T), 'niente', 'già aperto e appena notificato: nessun doppione');
  assert.equal(decidi(r, vera, { ...aperto, ultima_notifica: T - 700_000 }, false, null, T), 'ripeti_notifica', 'nessuno l\'ha preso e dura: si ripete, non prima dell\'intervallo');
  assert.equal(decidi(r, vera, { ...aperto, stato: 'in_carico', ultima_notifica: T - 700_000 }, false, null, T), 'niente', 'preso in carico: niente ripetizioni');
  assert.equal(decidi(r, falsa, aperto, true, null, T), 'rientro', 'il parametro rientra: lo si segna, l\'avviso NON si chiude');
  assert.equal(decidi(r, falsa, aperto, false, null, T), 'niente');
  assert.equal(decidi(r, vera, { ...aperto, rientrato_il: T - 120_000 }, false, null, T), 'ricaduta', 'torna prima della chiusura: stesso avviso, un episodio in più');
  assert.equal(decidi(r, vera, null, false, T - 60_000, T), 'niente', 'appena chiuso da una persona: non riapre subito');
  assert.equal(decidi(r, vera, null, false, T - 3600_000, T), 'apri');
});

test('regole: soglie del paziente e controllo di ciò che scrive una persona', () => {
  const r = R('fc_alta');
  assert.equal(conProfilo(r, { regole: { fc_alta: { soglia: 135, rientro: 125 } } })!.soglia, 135);
  assert.equal(conProfilo(r, { regole: { fc_alta: { spenta: true } } }), null);
  assert.equal(conProfilo(r, {})!.soglia, 120);
  assert.equal(valutaParametro(conProfilo(r, { regole: { fc_alta: { soglia: 135 } } })!, serie('fc', 5, () => 131), T).stato, 'falsa', 'la soglia del paziente vince');
  assert.equal(controllaRegola({ ...r }), null);
  assert.match(controllaRegola({ ...r, rientro: 130 })!, /isteresi/);
  assert.match(controllaRegola({ ...r, soglia: 900 })!, /fuori dalla scala/);
  assert.match(controllaRegola({ ...r, livello: 3 })!, /livello/i);
  for (const x of REGOLE_DEMO) { assert.equal(controllaRegola(x), null, x.chiave); assert.equal(x.illustrativa, true, 'le regole della demo sono tutte illustrative'); }
});

test('problemi tecnici, e che cosa NON è «nessun avviso»', () => {
  const s = (x: Partial<StatoTecnico> & { d?: Partial<StatoTecnico['dispositivi'][number]> }): StatoTecnico => ({
    programma: 'attivo', ultima_misura: T - 10_000, ritardo_mediano_s: 2, qualita_media: 92, ...x,
    dispositivi: [{ nome: 'Cerotto', connesso: true, ultimo_contatto: T - 5000, batteria: 80, sensore_applicato: true, errore: null, continuo: true, ...(x.d ?? {}) }] });
  for (const r of REGOLE_DEMO.filter((x) => x.categoria === 'tecnico')) assert.equal(valutaTecnica(r, s({}), T).stato, 'falsa', r.chiave);
  assert.equal(valutaTecnica(R('tec_disconnesso'), s({ d: { connesso: false, ultimo_contatto: T - 300_000 } }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_disconnesso'), s({ d: { connesso: false, ultimo_contatto: T - 30_000 } }), T).stato, 'falsa', 'scollegato da poco: si aspetta');
  assert.equal(valutaTecnica(R('tec_assenza_dati'), s({ ultima_misura: T - 400_000 }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_ritardo'), s({ ritardo_mediano_s: 300 }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_batteria'), s({ d: { batteria: 9 } }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_segnale'), s({ qualita_media: 30 }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_sensore'), s({ d: { sensore_applicato: false } }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_integrazione'), s({ d: { errore: 'adattatore: timeout' } }), T).stato, 'vera');
  assert.equal(valutaTecnica(R('tec_disconnesso'), { ...s({ d: { connesso: false, ultimo_contatto: T - 300_000 } }), programma: 'terminato' }, T).stato, 'falsa', 'monitoraggio fermo: non è un guasto');
  const base = { programma: 'attivo', avvisi: [], eta_ultimo_dato_s: 12, qualita_media: 90, continuo: true, intervallo_s: 15 };
  assert.equal(statoPaziente(base), 'nessun_avviso');
  assert.equal(statoPaziente({ ...base, eta_ultimo_dato_s: null }), 'dati_insufficienti', 'senza dati non è «stabile»');
  assert.equal(statoPaziente({ ...base, eta_ultimo_dato_s: 900 }), 'dati_insufficienti');
  assert.equal(statoPaziente({ ...base, qualita_media: 30 }), 'dati_insufficienti');
  assert.equal(statoPaziente({ ...base, programma: 'terminato' }), 'interrotto');
  assert.equal(statoPaziente({ ...base, avvisi: [{ categoria: 'parametro', livello: 1, rientrato: false }, { categoria: 'parametro', livello: 2, rientrato: false }] }), 'avviso_alta');
  assert.equal(statoPaziente({ ...base, avvisi: [{ categoria: 'tecnico', livello: null, rientrato: false }] }), 'nessun_avviso', 'un problema tecnico non è un avviso sul parametro');
  assert.equal(statoPaziente({ ...base, intervallo_s: 300, eta_ultimo_dato_s: 400 }), 'nessun_avviso', 'misure a intervalli: quattrocento secondi non sono «vecchi»');
  assert.equal(statoConnessione({ programma: 'attivo', connessi: 1, dispositivi: 1, eta_ultimo_dato_s: 10, intervallo_s: 15 }), 'in_aggiornamento');
  assert.equal(statoConnessione({ programma: 'attivo', connessi: 1, dispositivi: 1, eta_ultimo_dato_s: 600, intervallo_s: 15 }), 'in_ritardo');
  assert.equal(statoConnessione({ programma: 'attivo', connessi: 0, dispositivi: 1, eta_ultimo_dato_s: 10, intervallo_s: 15 }), 'interrotta');
  assert.equal(statoConnessione({ programma: 'in_pausa', connessi: 1, dispositivi: 1, eta_ultimo_dato_s: 10, intervallo_s: 15 }), 'terminato');
});

const P1 = PAZIENTI_DEMO.find((p) => p.codice === 'DEMO-001')!;
const disp = (codice: string): DispositivoAbbinato[] => PAZIENTI_DEMO.find((p) => p.codice === codice)!.dispositivi.map((d, i) => ({ id: `${codice}-${i}`, seriale: `SIM-${codice}-${d.chiave}`, modello: d.modello, tipo: d.tipo, capacita: d.capacita, paziente_id: codice, paziente_codice: codice }));

test('simulatore: ripetibile, coerente, graduale; tredici pazienti con le situazioni richieste', () => {
  assert.ok(PAZIENTI_DEMO.length >= 12, 'il catalogo delle situazioni, per le prove');
  // La demo che si vede: quattro pazienti, come saranno i monitorati veri in un mese.
  const ambientePrima = process.env.MONITORAGGIO_DEMO;
  delete process.env.MONITORAGGIO_DEMO;
  assert.deepEqual(pazientiDaSeminare().map((p) => p.codice), ['DEMO-001', 'DEMO-003', 'DEMO-004', 'DEMO-005']);
  process.env.MONITORAGGIO_DEMO = 'completa';
  assert.equal(pazientiDaSeminare().length, PAZIENTI_DEMO.length);
  if (ambientePrima == null) delete process.env.MONITORAGGIO_DEMO; else process.env.MONITORAGGIO_DEMO = ambientePrima;
  assert.ok(PAZIENTI_DEMO.some((p) => p.dispositivi.length >= 3) && PAZIENTI_DEMO.some((p) => p.programma === 'terminato'));
  const stato: StatoSim = { avviato_il: T - 3600_000, pazienti: {} };
  const a = genera(disp('DEMO-001'), T - 300_000, T, stato), b = genera(disp('DEMO-001'), T - 300_000, T, stato);
  assert.deepEqual(a.misure.map((m) => [m.parametro, m.valore, m.acquisita_il.getTime()]), b.misure.map((m) => [m.parametro, m.valore, m.acquisita_il.getTime()]), 'stessi ingressi, stesse misure');
  assert.ok(a.misure.every((m) => m.provenienza === 'simulato') && a.tracce.every((t) => t.provenienza === 'simulato'));
  assert.ok(a.misure.every((m) => m.acquisita_il.getTime() > T - 300_000 && m.acquisita_il.getTime() <= T), 'solo ciò che cade nell\'intervallo');
  assert.equal(a.misure.filter((m) => m.parametro === 'fc' && m.dispositivo === 'DEMO-001-0').length, 20, 'una misura ogni 15 secondi, né di più né di meno');
  assert.equal(a.misure.some((m) => m.parametro.startsWith('pa_')), false, 'nessun dispositivo di questo paziente misura la pressione: non la si inventa');
  // Lo scenario cambia i valori gradualmente, e la saturazione in discesa porta con sé il respiro.
  const ev = { evento: { tipo: 'desaturazione' as const, dal: T } };
  const prima = valore(P1, 'spo2', T + 10_000, ev), meta = valore(P1, 'spo2', T + 150_000, ev), dopo = valore(P1, 'spo2', T + 600_000, ev);
  assert.ok(prima > meta && meta > dopo && prima - dopo >= 8, `${prima} → ${meta} → ${dopo}`);
  assert.ok(valore(P1, 'fr', T + 600_000, ev) > valore(P1, 'fr', T + 600_000, undefined));
  assert.ok(Math.abs(valore(P1, 'fc', T, undefined) - valore(P1, 'fc', T + 15_000, undefined)) <= 6, 'niente salti a caso fra una misura e l\'altra');
});

test('simulatore: disconnessione, recupero dei dati con gli orari veri, segnale scarso, tracciato continuo', () => {
  const d = disp('DEMO-003');
  const giu: StatoSim = { avviato_il: T - 3600_000, pazienti: { 'DEMO-003': { connessione: { interrotta_dal: T - 600_000, ripresa_il: null } } } };
  const fermo = genera(d, T - 300_000, T, giu);
  assert.equal(fermo.misure.length, 0, 'scollegato: non arriva niente, e niente si inventa');
  assert.equal(fermo.tracce.length, 0);
  assert.deepEqual([fermo.stati[0].connesso, fermo.stati[0].ultimo_contatto!.getTime()], [false, T - 600_000]);
  const su: StatoSim = { avviato_il: T - 3600_000, pazienti: { 'DEMO-003': { connessione: { interrotta_dal: T - 600_000, ripresa_il: T - 60_000 } } } };
  const ripresa = genera(d, T - 120_000, T, su);
  const vecchie = ripresa.misure.filter((m) => m.acquisita_il.getTime() < T - 120_000);
  assert.ok(vecchie.length > 30, 'alla riconnessione arrivano le misure tenute in memoria');
  assert.ok(vecchie.every((m) => m.acquisita_il.getTime() >= T - 600_000 && m.arrivata_il!.getTime() >= T - 60_000), 'con l\'orario in cui sono state prese, non quello d\'arrivo');
  assert.equal(vecchie.some((m) => m.parametro === 'ecg'), false);
  const scarso: StatoSim = { avviato_il: T - 3600_000, pazienti: { 'DEMO-003': { segnale: { scarso_dal: T - 600_000 } } } };
  const s = genera(d, T - 300_000, T, scarso), buono = genera(d, T - 300_000, T, { avviato_il: T - 3600_000, pazienti: {} });
  assert.ok(s.misure.length < buono.misure.length && s.misure.filter((m) => m.qualita != null).every((m) => (m.qualita as number) < 50));
  // Il tracciato: 5 secondi a 125 Hz, e fra un pezzo e il successivo nessun salto (la fase del battito continua).
  const p3 = PAZIENTI_DEMO.find((p) => p.codice === 'DEMO-003')!, t0 = Math.floor(T / 5000) * 5000;
  const uno = ecgPezzo(p3, t0, undefined), due = ecgPezzo(p3, t0 + 5000, undefined);
  assert.equal(uno.length, 625);
  assert.ok(Math.max(...uno) * 0.005 > 0.6, 'ci sono i complessi');
  assert.ok(Math.abs(uno[624] - due[0]) * 0.005 < 0.35, 'nessun gradino alla giunzione');
  assert.equal(buono.tracce.length, 24, 'due minuti di tracciato al massimo per giro, in pezzi da 5 secondi');
  // lo stato iniziale porta gli scenari richiesti
  const ini = statoIniziale(T);
  assert.equal(ini.pazienti['DEMO-004'].evento!.tipo, 'desaturazione');
  assert.ok(ini.pazienti['DEMO-005'].connessione && ini.pazienti['DEMO-006'].segnale && ini.pazienti['DEMO-007'].batteria);
});

test('permessi: consultare, prendere in carico, regole e dispositivi sono quattro cose diverse', () => {
  assert.deepEqual(['medico', 'assistente', 'segretaria', 'admin', 'tecnico'].map((r) => puoMon(r, 'consultare')), [true, true, true, true, false]);
  assert.deepEqual(['medico', 'assistente', 'segretaria', 'admin', 'tecnico'].map((r) => puoMon(r, 'prendere_in_carico')), [true, true, false, false, false]);
  assert.deepEqual(['medico', 'assistente', 'segretaria', 'admin', 'tecnico'].map((r) => puoMon(r, 'modificare_regole')), [true, false, false, true, false]);
  assert.deepEqual(['medico', 'assistente', 'segretaria', 'admin', 'tecnico'].map((r) => puoMon(r, 'gestire_dispositivi')), [false, false, false, true, true]);
  assert.equal(vistaTecnica('tecnico'), true); assert.equal(vistaTecnica('admin'), false); assert.equal(vistaTecnica('medico'), false);
  assert.equal(puoMon('inviante', 'consultare'), false); assert.equal(puoMon(undefined, 'consultare'), false);
});

test('assistente: il modello fisso dice ciò che c\'è; la risposta dell\'AI si scarta se inventa numeri o sconfina', () => {
  const f: Fatti = {
    periodo: { da: '06.10 11:00', a: '06.10 12:00', minuti: 60 },
    parametri: [{ codice: 'fc', nome: 'Frequenza cardiaca', unita: 'bpm', modo: 'continuo', misure: 240, minimo: 76, massimo: 131, media: 98.4, inizio: 82, fine: 127, variazione: 45, copertura_pct: 100, buchi: [], qualita: 91, recuperati: false }],
    senza_dati: ['Saturazione di ossigeno (SpO₂)'], categorie: [],
    avvisi: [{ id: 'a1', nome: 'FC alta a riposo', categoria: 'parametro', livello: 1, stato: 'in_carico', generato: '06.10 11:40', rientrato: null, chiuso: null, responsabile: 'medico', azioni: ['preso in carico (medico, 11:42)'] }],
    dispositivi: [{ modello: 'Cerotto', connesso: true, batteria: 70 }], limiti: ['Nessuna misura nell\'intervallo per: Saturazione di ossigeno (SpO₂).'],
  };
  const t = testoFisso(f);
  assert.match(t, /Periodo analizzato: dal 06\.10 11:00 al 06\.10 12:00/);
  assert.match(t, /Frequenza cardiaca: 240 misure, da 76 a 131 bpm/);
  assert.match(t, /la media è passata da 82,0 a 127,0 bpm/);
  assert.match(t, /FC alta a riposo \(livello 1, generato 06\.10 11:40, in carico, in carico a medico\)/);
  assert.match(t, /Limiti dei dati: Nessuna misura/);
  assert.deepEqual(rispostaAmmessa('Nel periodo di 60 minuti la frequenza è salita da 82 a 127 bpm; un avviso di livello 1 è stato preso in carico.', f, ''), { ok: true });
  assert.equal(rispostaAmmessa('La frequenza è arrivata a 140 bpm.', f, '').ok, false, 'un numero che nei dati non c\'è');
  assert.equal(rispostaAmmessa('La frequenza è salita da 82 a 127 bpm: il paziente è stabile.', f, '').ok, false);
  assert.equal(rispostaAmmessa('Si consiglia di aumentare la terapia.', f, '').ok, false);
  assert.equal(rispostaAmmessa('Il tracciato mostra una fibrillazione.', f, '').ok, false);
  assert.deepEqual(rispostaAmmessa('Nelle ultime 2 ore non ho dati oltre i 60 minuti analizzati.', f, 'Che cosa è cambiato nelle ultime 2 ore?'), { ok: true }, 'un numero della domanda si può ripetere');
});
