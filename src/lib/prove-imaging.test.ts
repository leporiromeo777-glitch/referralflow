import test from 'node:test';
import assert from 'node:assert/strict';
import { chiaveNas, eSulNas, leggiConfNas, percorsoNas, relativoSicuro } from './imaging-esterno';
import { abbinaPaziente, etichetta, filtroVuoto, finestreDi, leggiFiltro, leggiRicerca, raggruppa, ricercaVuota, scegliLotto, slugNome, type MetaMinima } from './imaging-ordina';

const base: MetaMinima = {
  study_uid: 'S1', series_uid: 'SE1', sop_uid: 'I1', modalita: 'ct', data_esame: '2026-09-11',
  descrizione_esame: 'TAC torace', descrizione_serie: 'assiale', numero_serie: 1, numero_immagine: 1,
  paziente_nome: 'Rossi Mario', paziente_nascita: '1960-05-12', righe: 512, colonne: 512, frame: 1, immagine: true,
};
const m = (x: Partial<MetaMinima>): MetaMinima => ({ ...base, ...x });

test('imaging: i file sciolti si raggruppano per esame e per serie, in ordine di apparecchio', () => {
  // arrivano mescolati, come da un CD
  const e = raggruppa([
    { indice: 0, meta: m({ sop_uid: 'I3', numero_immagine: 3 }) },
    { indice: 1, meta: m({ sop_uid: 'I1', numero_immagine: 1 }) },
    { indice: 2, meta: m({ series_uid: 'SE2', numero_serie: 2, sop_uid: 'J1', descrizione_serie: 'coronale' }) },
    { indice: 3, meta: m({ sop_uid: 'I2', numero_immagine: 2 }) },
    { indice: 4, meta: m({ study_uid: 'S2', series_uid: 'SE9', sop_uid: 'K1', modalita: 'mr' }) },
  ]);
  assert.equal(e.length, 2);
  const uno = e.find((x) => x.study_uid === 'S1')!;
  assert.deepEqual(uno.serie.map((s) => s.serie_uid), ['SE1', 'SE2']);
  assert.deepEqual(uno.serie[0].immagini.map((i) => i.sop_uid), ['I1', 'I2', 'I3']);
  assert.equal(uno.n_immagini, 4);
  assert.equal(uno.modalita, 'CT');
});

test('imaging: lo stesso file importato due volte non diventa due immagini', () => {
  const e = raggruppa([
    { indice: 0, meta: m({}) },
    { indice: 1, meta: m({}) },
  ]);
  assert.equal(e[0].n_immagini, 1);
});

test('imaging: un file senza i tre identificativi non entra', () => {
  const e = raggruppa([
    { indice: 0, meta: m({ study_uid: '' }) },
    { indice: 1, meta: m({ series_uid: '' }) },
    { indice: 2, meta: m({ sop_uid: '' }) },
  ]);
  assert.equal(e.length, 0);
});

test('imaging: un esame con più modalità le elenca tutte', () => {
  const e = raggruppa([
    { indice: 0, meta: m({}) },
    { indice: 1, meta: m({ series_uid: 'SE2', sop_uid: 'J1', modalita: 'sr' }) },
  ]);
  assert.equal(e[0].modalita, 'CT, SR');
});

test('imaging: senza descrizione l’etichetta la fanno modalità e parte del corpo', () => {
  assert.equal(etichetta(m({})), 'TAC torace');
  assert.equal(etichetta(m({ descrizione_esame: '', parte_corpo: 'HEAD' })), 'HEAD');
  assert.equal(etichetta(m({ descrizione_esame: '', parte_corpo: '' })), 'CT');
});

// L'abbinamento è la parte pericolosa: attaccare le immagini al paziente
// sbagliato è il danno peggiore che questa pagina possa fare.
test('imaging: si abbina solo con nome E data di nascita, e mai fra omonimi', () => {
  const P = [
    { id: 'a', cognome: 'Rossi', nome: 'Mario', data_nascita: '1960-05-12' },
    { id: 'b', cognome: 'Rossi', nome: 'Mario', data_nascita: '1975-01-30' },
    { id: 'c', cognome: 'Bianchi', nome: 'Luisa', data_nascita: '1950-03-03' },
  ];
  assert.deepEqual(abbinaPaziente('Rossi Mario', '1960-05-12', P), { id: 'a', motivo: 'abbinato' });
  // due omonimi, nessuna data nel file: non si sceglie
  assert.deepEqual(abbinaPaziente('Rossi Mario', '', P), { id: null, motivo: 'omonimi' });
  // data che non corrisponde a nessuno dei due: non si forza
  assert.deepEqual(abbinaPaziente('Rossi Mario', '1999-09-09', P), { id: null, motivo: 'nascita_diversa' });
  // un solo omonimo ma senza data nel file: resta da verificare
  assert.deepEqual(abbinaPaziente('Bianchi Luisa', '', P), { id: null, motivo: 'nascita_diversa' });
  assert.deepEqual(abbinaPaziente('Verdi Anna', '1960-05-12', P), { id: null, motivo: 'nessuno' });
  assert.deepEqual(abbinaPaziente('', '1960-05-12', P), { id: null, motivo: 'senza_nome' });
});

test('imaging: il nome del DICOM combacia anche se invertito o accentato', () => {
  assert.equal(slugNome('ROSSI^MARIO'), slugNome('Mario Rossi'));
  assert.equal(slugNome('Tamò Gianni'), slugNome('gianni tamo'));
});

test('imaging: le finestre sono quelle della modalità, e non si inventano', () => {
  assert.equal(finestreDi('CT').length, 5);
  assert.equal(finestreDi('CT, SR')[1].nome, 'Polmone');
  assert.deepEqual(finestreDi('MR'), []);
  assert.deepEqual(finestreDi('boh'), []);
});

test('pagina Immagini di sola consultazione: gli strumenti di misura sono spenti se non li si accende', async () => {
  const { misureAccese } = await import('./imaging-misure-accese');
  const prima = process.env.IMAGING_MISURE;
  try {
    delete process.env.IMAGING_MISURE; assert.equal(misureAccese(), false, 'di serie spenti');
    process.env.IMAGING_MISURE = 'si'; assert.equal(misureAccese(), false, 'solo «1» li accende');
    process.env.IMAGING_MISURE = '1'; assert.equal(misureAccese(), true);
  } finally {
    if (prima === undefined) delete process.env.IMAGING_MISURE; else process.env.IMAGING_MISURE = prima;
  }
});


test('imaging: lo spool si svuota a lotti, per numero e per peso, e un file enorme passa da solo', () => {
  const MB = 1024 * 1024;
  const file = [{ nome: 'a', byte: 100 * MB }, { nome: 'b', byte: 200 * MB }, { nome: 'c', byte: 150 * MB }, { nome: 'd', byte: 10 * MB }];
  assert.deepEqual(scegliLotto(file, 400, 384 * MB), ['a', 'b']);            // il terzo sforerebbe
  assert.deepEqual(scegliLotto(file, 1, 384 * MB), ['a']);                    // il numero vince
  assert.deepEqual(scegliLotto([{ nome: 'x', byte: 900 * MB }, { nome: 'y', byte: MB }], 400, 384 * MB), ['x']);  // mai zero
  assert.deepEqual(scegliLotto([], 400, 384 * MB), []);
});

test('imaging: i filtri dell’elenco (anno, provenienza, stato) accettano solo valori noti', () => {
  assert.deepEqual(leggiFiltro({ anno: '2024', origine: 'nas', stato: 'senza' }), { anno: 2024, origine: 'nas', stato: 'senza' });
  assert.deepEqual(leggiFiltro({ anno: 2026, origine: 'rete' }), { anno: 2026, origine: 'rete', stato: null });
  // Ciò che non è un anno, una provenienza o uno stato conosciuti non filtra niente (e non arriva alla query).
  assert.deepEqual(leggiFiltro({ anno: '20x4', origine: "nas' or 1=1", stato: 'tutti' }), { anno: null, origine: null, stato: null });
  assert.deepEqual(leggiFiltro({ anno: 99999 }), { anno: null, origine: null, stato: null });
  assert.ok(filtroVuoto(leggiFiltro(null)) && filtroVuoto(leggiFiltro({})) && !filtroVuoto(leggiFiltro({ stato: 'verifica' })));
});

test('imaging: la ricerca nell’elenco capisce date, anni e parole, e non indovina', () => {
  assert.deepEqual(leggiRicerca('3.5.1950'), { data: '1950-05-03', anno: null, parole: [] });
  assert.deepEqual(leggiRicerca('03/05/1950'), { data: '1950-05-03', anno: null, parole: [] });
  assert.deepEqual(leggiRicerca('1950-05-03'), { data: '1950-05-03', anno: null, parole: [] });
  assert.deepEqual(leggiRicerca('Rossi 2026'), { data: null, anno: 2026, parole: ['rossi'] });
  assert.deepEqual(leggiRicerca('  De   Luca '), { data: null, anno: null, parole: ['de', 'luca'] });
  // Una data che non esiste non diventa una data: resta una parola che non trova niente.
  assert.equal(leggiRicerca('31.2.2020').data, null);
  // I caratteri jolly non passano, e una lettera sola non è una ricerca.
  assert.deepEqual(leggiRicerca('%_ a ros%si').parole, ['rossi']);
  assert.ok(ricercaVuota(leggiRicerca('  ')));
  assert.ok(ricercaVuota(leggiRicerca('a')));
  assert.ok(!ricercaVuota(leggiRicerca('2025')));
});


test('imaging: le chiavi delle immagini sul NAS non possono uscire dalla cartella collegata', () => {
  assert.equal(chiaveNas('2024/3fa9/77b1/1.2.3_image.dcm'), 'nas:2024/3fa9/77b1/1.2.3_image.dcm');
  assert.ok(eSulNas('nas:2024/x.dcm') && !eSulNas('imaging/studio/x.dcm') && !eSulNas(null));
  assert.equal(percorsoNas('nas:2024/a/b.dcm', '/Volumes/Archivio/'), '/Volumes/Archivio/2024/a/b.dcm');
  for (const cattivo of ['../etc/passwd', '2024/../../x', '/assoluto/x', '2024//x', '2024/./x', '', 'a\0b']) assert.equal(relativoSicuro(cattivo), null, cattivo);
  assert.equal(percorsoNas('nas:../x', '/Volumes/Archivio'), null);
  assert.equal(percorsoNas('imaging/x.dcm', '/Volumes/Archivio'), null, 'una chiave normale non si risolve sul NAS');
  assert.equal(percorsoNas('nas:2024/x.dcm', ''), null);
  assert.equal(percorsoNas('nas:2024/x.dcm', 'relativa'), null);
});

test('imaging: la configurazione del NAS porta indirizzo e cartella, mai una password', () => {
  const c = leggiConfNas('# commento\nURL=smb://archivio@192.168.0.243/Archivio-Dati\nRADICE=/Volumes/Archivio-Dati/\n');
  assert.deepEqual(c, { radice: '/Volumes/Archivio-Dati', url: 'smb://archivio@192.168.0.243/Archivio-Dati' });
  // Un indirizzo con la password dentro non si accetta: non deve stare in un file.
  assert.equal(leggiConfNas('URL=smb://archivio:segreta@192.168.0.243/Archivio\nRADICE=/Volumes/A').url, null);
  assert.equal(leggiConfNas('RADICE=Volumes/relativa').radice, null);
  assert.equal(leggiConfNas('RADICE=/Volumes/../etc').radice, null);
  assert.deepEqual(leggiConfNas(''), { radice: null, url: null });
});
