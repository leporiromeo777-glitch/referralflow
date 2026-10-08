// Pressione (7.10.2026): i conti puri della pagina — lettura del file,
// statistiche, fasce, finestre d'azione, punteggio, proposte di orario.
// Tutti i profili sono inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposteAccese } from './pressione/accese';
import { daIgnorare, decodifica, estensione, identitaDaFile, perNonLeggerlo, rapportoDaTesto } from './pressione/cartella';
import { FARMACI_BOZZA, controllaFarmaco, orario, riconosci, type Farmaco } from './pressione/farmaci';
import {
  IMPOSTAZIONI_BASE, avvisoFasce, caloTipo, copertura, effetto, fasce, leggiFile, livelli, orarie, proponi, punteggio, segnaScoperte, statistiche,
  type Misura, type Presa,
} from './pressione/calcolo';

const due = (n: number) => String(n).padStart(2, '0');
// Un profilo sintetico: una misura ogni mezz'ora per 24 ore dalle 08:00.
// La diastolica, se non si dice altro, sta sotto soglia di giorno (76) e di notte (62).
function profilo(sis: (h: number) => number, dia: (h: number) => number = (h) => (h >= 22 || h < 7 ? 62 : 76)): Misura[] {
  const m: Misura[] = [];
  for (let k = 0; k < 48; k++) {
    const minuti = 8 * 60 + k * 30, giorno = minuti >= 1440 ? 2 : 1, h = (minuti % 1440) / 60;
    m.push({ quando: `2026-03-0${giorno}T${due(Math.floor(h))}:${due((minuti % 1440) % 60)}`, sis: Math.round(sis(h)), dia: Math.round(dia(h)), fc: 70, valida: true });
  }
  return m;
}
const notte = (h: number) => h >= 22 || h < 7;
const tab = new Map<string, Farmaco>(FARMACI_BOZZA.map((f) => [f.principio, f]));

test('pressione: il file dell’apparecchio si legge con l’intestazione, in qualunque ordine di colonne', () => {
  const r = leggiFile('Datum;Uhrzeit;Sys;MAP;Dia;Puls\n01.03.2026;08:00;142;110;88;72\n01.03.2026;08:30;138;105;85;70\n01.03.2026;09:00;300;200;80;70\n');
  assert.equal(r.errore, undefined);
  assert.deepEqual(r.misure[0], { quando: '2026-03-01T08:00', sis: 142, dia: 88, fc: 72, valida: true });
  assert.equal(r.misure.length, 3);
  assert.equal(r.misure[2].valida, false, 'una sistolica di 300 resta nel file ma non conta');
});

test('pressione: senza intestazione valgono solo tre colonne nell’ordine atteso; di più non si indovina', () => {
  const r = leggiFile('01/03/2026 22:30 121 74 61\n01/03/2026 23:00 118 70 58\n');
  assert.equal(r.misure.length, 2);
  assert.deepEqual([r.misure[1].sis, r.misure[1].dia, r.misure[1].fc], [118, 70, 58]);
  assert.match(leggiFile('01/03/2026 22:30 121 95 74 61\n').errore ?? '', /intestazione/);
});

test('pressione: senza data nel file serve il giorno d’inizio, e la mezzanotte fa cambiare giorno', () => {
  assert.match(leggiFile('23:30;120;70\n00:30;115;68\n').errore ?? '', /giorno d’inizio/);
  const r = leggiFile('ora;sistolica;diastolica\n23:30;120;70\n00:30;115;68\n', '2026-03-01');
  assert.deepEqual(r.misure.map((m) => m.quando), ['2026-03-01T23:30', '2026-03-02T00:30']);
  assert.match(leggiFile('').errore ?? '', /vuoto/);
  assert.match(leggiFile('ciao\nmondo\n').errore ?? '', /non ho trovato/);
});

test('pressione: medie di giorno e di notte, calo notturno e qualità della registrazione', () => {
  const s = statistiche(profilo((h) => (notte(h) ? 115 : 140), (h) => (notte(h) ? 65 : 90)), IMPOSTAZIONI_BASE);
  assert.equal(s.giorno.sis, 140); assert.equal(s.notte.sis, 115);
  assert.equal(s.calo_notturno, 17.9); assert.equal(s.calo_tipo, 'normale');
  assert.equal(s.qualita.affidabile, true);
  assert.equal(s.carico_giorno, 100); assert.equal(s.carico_notte, 0);
  assert.deepEqual([caloTipo(-3), caloTipo(0.5), caloTipo(6), caloTipo(15), caloTipo(25), caloTipo(null)], ['inverso', 'assente', 'ridotto', 'normale', 'eccessivo', null]);
  // Poche misure: i numeri ci sono, ma si dice che non reggono una conclusione.
  const pochi = statistiche(profilo(() => 130).slice(0, 10), IMPOSTAZIONI_BASE);
  assert.equal(pochi.qualita.affidabile, false);
  assert.ok(pochi.qualita.motivi.some((x) => /di notte/.test(x)));
});

test('pressione: le fasce sopra soglia usano la soglia del giorno o della notte, e passano la mezzanotte intere', () => {
  // 130 di giorno va bene (soglia 135); 130 di notte è sopra (soglia 120).
  const ore = orarie(profilo(() => 130, () => 66), IMPOSTAZIONI_BASE);
  const f = fasce(ore, IMPOSTAZIONI_BASE.soglie);
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].da, f[0].a, f[0].ore, f[0].stato, f[0].notte], [22, 7, 9, 'alta', true]);
  // Troppo bassa di notte.
  const b = fasce(orarie(profilo((h) => (notte(h) ? 84 : 125), () => 60), IMPOSTAZIONI_BASE), IMPOSTAZIONI_BASE.soglie);
  assert.deepEqual(b.map((x) => x.stato), ['bassa']);
});

test('pressione: la finestra d’azione segue i quattro numeri della tabella', () => {
  const f = { inizio_h: 1, picco_h: 5, durata_h: 24, emivita_h: 10 };
  assert.equal(effetto(0.5, f), 0);
  assert.equal(effetto(3, f), 0.5);
  assert.equal(effetto(5, f), 1);
  assert.ok(Math.abs(effetto(24, f) - 0.35) < 1e-9);
  assert.equal(effetto(34, f), 0);
  // Preso alle 08:00 tutti i giorni: alle 13 è al massimo, alle 07 del giorno dopo è al minimo.
  const l = livelli(['08:00'], f);
  assert.ok(l[13] > 0.95 && l[7] < 0.45 && l[7] > 0.3);
  // Un farmaco a durata breve preso una volta lascia ore vuote.
  assert.equal(livelli(['08:00'], { inizio_h: 0.5, picco_h: 1.5, durata_h: 7, emivita_h: 2 })[4], 0);
});

test('pressione: una fascia alta è scoperta quando nessun farmaco è almeno a metà dell’effetto', () => {
  const ore = orarie(profilo((h) => (h >= 2 && h < 7 ? 150 : notte(h) ? 112 : 128)), IMPOSTAZIONI_BASE);
  const breve: Farmaco = { ...tab.get('captopril')! };
  const prese: Presa[] = [{ id: 'a', nome: 'Captopril 25', principio: 'captopril', orari: ['08:00'] }];
  const cop = copertura(prese, new Map([['captopril', breve]]));
  const f = segnaScoperte(fasce(ore, IMPOSTAZIONI_BASE.soglie), cop);
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].da, f[0].a, f[0].scoperta, f[0].al_minimo], [2, 7, true, ['captopril']]);
  // Lo spironolattone non ha una finestra oraria: non entra nella copertura.
  assert.equal(copertura([{ id: 's', nome: 'Aldactone', principio: 'spironolattone', orari: ['08:00'] }], tab).length, 0);
});

test('pressione: il punteggio premia le ore in bersaglio e il calo notturno, non il profilo piatto', () => {
  const buono = punteggio(orarie(profilo((h) => (notte(h) ? 108 : 126)), IMPOSTAZIONI_BASE), IMPOSTAZIONI_BASE)!;
  const piatto = punteggio(orarie(profilo(() => 118, () => 66), IMPOSTAZIONI_BASE), IMPOSTAZIONI_BASE)!;
  const alto = punteggio(orarie(profilo((h) => (notte(h) ? 140 : 160), () => 95), IMPOSTAZIONI_BASE), IMPOSTAZIONI_BASE)!;
  assert.equal(buono.totale, 100);
  assert.ok(piatto.totale < buono.totale, `piatto ${piatto.totale}`);
  assert.equal(piatto.calo, 0, 'senza calo notturno quella parte vale zero');
  assert.ok(alto.totale < 50 && alto.in_bersaglio === 0);
  assert.equal(punteggio(orarie(profilo(() => 120).slice(0, 8), IMPOSTAZIONI_BASE), IMPOSTAZIONI_BASE), null, 'con poche ore misurate non c’è punteggio');
});

test('pressione: la proposta sposta UNA presa verso la fascia scoperta, coi numeri da cui nasce', () => {
  // Alta dalle 02 alle 08, bene il resto; un farmaco a durata breve preso alle 08.
  const m = profilo((h) => (h >= 2 && h < 8 ? 146 : notte(h) ? 110 : 128), (h) => (h >= 2 && h < 8 ? 86 : notte(h) ? 62 : 74));
  const ore = orarie(m, IMPOSTAZIONI_BASE);
  const corto: Farmaco = { ...tab.get('carvedilolo')!, durata_h: 14, emivita_h: 4 };
  const prese: Presa[] = [{ id: 'p1', nome: 'Farmaco di prova', principio: 'carvedilolo', orari: ['08:00'] }];
  const r = proponi(ore, prese, new Map([['carvedilolo', corto]]), IMPOSTAZIONI_BASE, { affidabile: true });
  assert.equal(r.proposte.length, 1);
  const p = r.proposte[0];
  assert.equal(p.da, '08:00');
  assert.ok(['20:00', '22:00'].includes(p.a), `verso sera, non ${p.a}`);
  assert.ok(p.punteggio_previsto - p.punteggio_ora >= 5);
  assert.ok(p.perche.some((x) => /02:00–08:00/.test(x)) && p.perche.some((x) => /Stima/.test(x)));
  assert.match(r.ipotesi, /ipotesi di lavoro/);
  // Ripetibile: stesso profilo, stessa proposta.
  assert.deepEqual(proponi(ore, prese, new Map([['carvedilolo', corto]]), IMPOSTAZIONI_BASE, { affidabile: true }), r);
});

test('pressione: i limiti delle proposte — qualità, diuretici, più prese, niente da spostare, e quando non basta lo dice', () => {
  const m = profilo((h) => (h >= 2 && h < 8 ? 146 : notte(h) ? 110 : 128), (h) => (h >= 2 && h < 8 ? 86 : notte(h) ? 62 : 74));
  const ore = orarie(m, IMPOSTAZIONI_BASE);
  // Registrazione non affidabile: nessuna proposta.
  assert.match(proponi(ore, [], tab, IMPOSTAZIONI_BASE, { affidabile: false }).motivo_nessuna ?? '', /affidabile/);
  // Un diuretico non si propone mai dopo le 14.
  const diur = proponi(ore, [{ id: 'd', nome: 'Torem', principio: 'torasemide', orari: ['08:00'] }], tab, IMPOSTAZIONI_BASE, { affidabile: true });
  assert.ok(diur.proposte.every((p) => Number(p.a.slice(0, 2)) <= 14));
  // Due prese al giorno: non si sposta, e l'avviso descrive le fasce senza giudicare la terapia.
  const bis = proponi(ore, [{ id: 'b', nome: 'X', principio: 'carvedilolo', orari: ['08:00', '20:00'] }], tab, IMPOSTAZIONI_BASE, { affidabile: true });
  assert.equal(bis.proposte.length, 0);
  assert.match(bis.avviso ?? '', /resta sopra la soglia.*02:00–08:00.*Valutazione del medico/);
  assert.doesNotMatch(bis.avviso ?? '', /non basta|altro farmaco|aument/i);
  // Profilo in ordine: niente da spostare, nessun avviso.
  const bene = proponi(orarie(profilo((h) => (notte(h) ? 108 : 126)), IMPOSTAZIONI_BASE), [{ id: 'a', nome: 'Y', principio: 'amlodipina', orari: ['08:00'] }], tab, IMPOSTAZIONI_BASE, { affidabile: true });
  assert.deepEqual([bene.proposte.length, bene.avviso], [0, null]);
  // Tutto alto, sempre: qualunque spostamento lascia fasce sopra soglia, e lo si dice.
  const alto = proponi(orarie(profilo((h) => (notte(h) ? 150 : 170), () => 100), IMPOSTAZIONI_BASE), [{ id: 'a', nome: 'Y', principio: 'ramipril', orari: ['08:00'] }], tab, IMPOSTAZIONI_BASE, { affidabile: true });
  assert.match(alto.avviso ?? '', /Con qualunque orario/);
  assert.equal(avvisoFasce([{ da: 2, a: 6, ore: 4, stato: 'alta', sis: 148, dia: 92, notte: true }]), 'Con qualunque orario dei farmaci attuali la pressione resta sopra la soglia in questa fascia: 02:00–06:00, media 148/92. Valutazione del medico.');
});

test('pressione: i nomi scritti in terapia si riconoscono, le combinazioni danno più principi, il resto non si indovina', () => {
  assert.deepEqual(riconosci('Amlodipin Mepha 10 mg'), ['amlodipina']);
  assert.deepEqual(riconosci('COVERSUM N 5mg'), ['perindopril']);
  assert.deepEqual(riconosci('Exforge HCT 10/160/12.5').sort(), ['amlodipina', 'idroclorotiazide', 'valsartan']);
  assert.deepEqual(riconosci('valsartan + HCT').sort(), ['idroclorotiazide', 'valsartan']);
  assert.deepEqual(riconosci('Beloc ZOK 50'), ['metoprololo']);
  assert.deepEqual(riconosci('Aspirina Cardio 100'), []);
  assert.deepEqual(riconosci('Atorvastatina 20'), []);
  assert.deepEqual([orario('8'), orario('8.30'), orario('08:30'), orario('20h00'), orario('25'), orario('sera')], ['08:00', '08:30', '08:30', '20:00', null, null]);
});

test('pressione: la tabella in bozza sta in piedi riga per riga, e un farmaco incoerente non si può confermare', () => {
  assert.ok(FARMACI_BOZZA.length >= 40);
  assert.equal(new Set(FARMACI_BOZZA.map((f) => f.principio)).size, FARMACI_BOZZA.length, 'nessun principio due volte');
  for (const f of FARMACI_BOZZA) assert.equal(controllaFarmaco(f), null, f.principio);
  assert.match(controllaFarmaco({ inizio_h: 6, picco_h: 2, durata_h: 24, emivita_h: 8 }) ?? '', /inizio/);
  assert.match(controllaFarmaco({ inizio_h: 1, picco_h: 30, durata_h: 24, emivita_h: 8 }) ?? '', /picco/);
  assert.match(controllaFarmaco({ inizio_h: 1, picco_h: 2, durata_h: 24, emivita_h: 0 }) ?? '', /emivita/);
});

test('pressione: le proposte di orario sono spente di serie, e le accende solo PRESSIONE_PROPOSTE=1', () => {
  assert.equal(proposteAccese({}), false);
  assert.equal(proposteAccese({ PRESSIONE_PROPOSTE: '0' }), false);
  assert.equal(proposteAccese({ PRESSIONE_PROPOSTE: 'si' }), false);
  assert.equal(proposteAccese({ PRESSIONE_PROPOSTE: '1' }), true);
});

test('pressione, cartella: di chi è un file si legge dal nome del file o dalle prime righe, senza indovinare', () => {
  assert.deepEqual(identitaDaFile('Rossi Maria 12.06.1955.csv', 'Data;Ora;Sys;Dia\n'), { nome: 'Rossi Maria', nascita: '1955-06-12', da: 'nome_del_file' });
  assert.deepEqual(identitaDaFile('rossi_maria_1955-06-12.txt', ''), { nome: 'rossi maria', nascita: '1955-06-12', da: 'nome_del_file' });
  // Scritto dentro il file, sopra la tabella: vince sul nome del file.
  const dentro = 'Paziente: Bianchi Luca\nData di nascita: 03.02.1948\nApparecchio: X\n\nData;Ora;Sys;Dia\n01.03.2026;08:00;140;85\n';
  assert.deepEqual(identitaDaFile('export_0042.csv', dentro), { nome: 'Bianchi Luca', nascita: '1948-02-03', da: 'file' });
  assert.deepEqual(identitaDaFile('x.csv', 'Nachname;Müller\nVorname;Anna\nGeburtsdatum;1960-11-30\n'), { nome: 'Müller Anna', nascita: '1960-11-30', da: 'file' });
  // Senza data di nascita o senza nome non c'è un'identità completa: lo deciderà una persona.
  assert.equal(identitaDaFile('Rossi Maria.csv', '').nascita, null);
  assert.deepEqual(identitaDaFile('export_0042.csv', 'Data;Ora;Sys;Dia\n'), { nome: 'export', nascita: null, da: 'nome_del_file' });
  assert.equal(identitaDaFile('31.02.1955 Rossi.csv', '').nascita, null, 'una data che non esiste non è una data');
  // Una riga di misure non viene presa per un nome.
  assert.equal(identitaDaFile('a.csv', 'Name;08:00 140/85\n').nome, 'a');
});

test('pressione, cartella: che cosa si legge, che cosa si ignora, e perché no', () => {
  assert.equal(estensione('Rossi.CSV'), 'csv');
  assert.equal(perNonLeggerlo('profilo.csv', 5000), null);
  assert.match(perNonLeggerlo('profilo.xlsx', 5000) ?? '', /salvalo come CSV/);
  assert.equal(perNonLeggerlo('rapporto.pdf', 700_000), null, 'il rapporto in PDF si prova a leggere');
  assert.match(perNonLeggerlo('rapporto.pdf', 9_000_000) ?? '', /troppo grande/);
  assert.match(perNonLeggerlo('foto.jpg', 5000) ?? '', /non letto/);
  assert.match(perNonLeggerlo('profilo.csv', 900_000) ?? '', /troppo grande/);
  assert.match(perNonLeggerlo('profilo.csv', 0) ?? '', /vuoto/);
  for (const n of ['.DS_Store', '~$profilo.csv', 'Thumbs.db', 'desktop.ini', 'x.csv.crdownload', 'a.csv.perche.txt', '._Rossi.csv']) assert.ok(daIgnorare(n), n);
  assert.ok(!daIgnorare('Rossi Maria 12.06.1955.csv'));
  // Un file di Windows con gli accenti in Latin-1 si legge lo stesso.
  assert.equal(decodifica(new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72])), 'Müller');
  assert.equal(decodifica(new TextEncoder().encode('\uFEFFMüller')), 'Müller');
});

test('pressione: il rapporto in PDF del misuratore — misure dall’elenco, paziente dalla testata', () => {
  // Il testo come esce dal PDF (inventato): testata, e l'elenco «No. Data - Ora SIS DIA FC».
  const testata = 'Rapporto misurazione pressione\nperiodo di monitoraggio: 01-03-2026 – 02-03-2026\nProva Paziente          data rapporto: 8 ottobre, 2026\ne-mail sesso data di nascita altezza peso\n----- M 12-06-1955 175 cm 80 kg\n';
  const elenco = 'Elenco misurazioni\nNo. Data - Ora SIS DIA FC\n   1.    2026-03-01 08:00:00          132                 84                    71\n   2.    2026-03-01 08:30:00          128                 80                    69\n 100.    2026- 03-02 07:30:00          119                 72                    64\n';
  const r = rapportoDaTesto(testata + elenco)!;
  assert.equal(r.misure, 3);
  assert.deepEqual([r.nome, r.nascita], ['Prova Paziente', '1955-06-12']);
  assert.equal(r.csv.split('\n')[1], '2026-03-01;08:00;132;84;71');
  assert.equal(r.csv.split('\n')[3], '2026-03-02;07:30;119;72;64', 'la data con uno spazio dentro si legge lo stesso');
  // Lo stesso elenco con le celle andate a capo (un altro estrattore di testo) dà le stesse misure.
  const aCapo = elenco.replace(/ {2,}/g, '\n');
  assert.equal(rapportoDaTesto(testata + aCapo)!.misure, 3);
  // Quello che `leggiFile` riceve è leggibile, e senza frequenza la riga vale lo stesso.
  assert.equal(leggiFile(r.csv).misure.length, 3);
  assert.equal(rapportoDaTesto('1. 2026-03-01 08:00:00 132 84\n')!.csv.split('\n')[1], '2026-03-01;08:00;132;84;');
  // La data di nascita scritta a parole.
  assert.equal(rapportoDaTesto('Rossi Maria data rapporto: 1 marzo, 2026\ndata di nascita\n3 febbraio, 1948\n1. 2026-03-01 08:00:00 132 84 70\n')!.nascita, '1948-02-03');
  // Un PDF senza elenco delle misure non è un rapporto: niente da leggere.
  assert.equal(rapportoDaTesto('Referto di visita cardiologica. Pressione 130/80 il 01.03.2026.'), null);
});

