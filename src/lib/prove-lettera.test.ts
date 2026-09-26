import test from 'node:test';
import assert from 'node:assert/strict';
import { contenutoSenzaIntestazioni, promptPer, unParagrafo } from './referto-struttura';

// Dati INVENTATI: nessun testo di pazienti veri.
const CHIUSURA = 'Cordiali saluti,';

test('corpo in un solo paragrafo: le righe fra apertura e saluto diventano una sola', () => {
  const lettera = [
    'Caro Dottor Bianchi,', '',
    'non ritorno sull’anamnesi del paziente.', 'Rivedo in data 02.09.2026 il paziente a margine.', '',
    'FRCV: ipertensione arteriosa.', '',
    'In conclusione, alla luce degli elementi di cui sopra, propongo di continuare.', '',
    CHIUSURA,
  ].join('\n');
  const out = unParagrafo(lettera, CHIUSURA);
  const righe = out.split('\n');
  assert.equal(righe[0], 'Caro Dottor Bianchi,');
  assert.equal(righe[1], '');
  assert.equal(righe[2], 'non ritorno sull’anamnesi del paziente. Rivedo in data 02.09.2026 il paziente a margine. FRCV: ipertensione arteriosa. In conclusione, alla luce degli elementi di cui sopra, propongo di continuare.');
  assert.equal(righe[righe.length - 1], CHIUSURA);
  // nessuna riga vuota dentro il corpo
  assert.equal(righe.filter((r) => r === '').length, 2);
});

test('un solo paragrafo: senza saluto finale, e già in un paragrafo, resta com’è', () => {
  const senzaSaluto = 'Caro collega,\n\nprimo blocco.\n\nsecondo blocco.';
  assert.equal(unParagrafo(senzaSaluto, CHIUSURA), 'Caro collega,\n\nprimo blocco. secondo blocco.');
  const gia = `Caro collega,\n\nuna riga sola di corpo.\n\n${CHIUSURA}`;
  assert.equal(unParagrafo(gia, CHIUSURA), gia);
});

test('il prompt chiede un paragrafo solo quando il profilo lo vuole, altrimenti i paragrafi', () => {
  const uno = promptPer('lettera', { chiusura: CHIUSURA, corpoUnico: true });
  assert.match(uno, /TUTTO IN UN SOLO PARAGRAFO/);
  assert.ok(!/SEPARATI L'UNO DALL'ALTRO DA UNA RIGA VUOTA/.test(uno));
  assert.match(uno, /scrivi ESATTAMENTE «Cordiali saluti,»/);
  const tanti = promptPer('lettera', { chiusura: CHIUSURA });
  assert.match(tanti, /SEPARATI L'UNO DALL'ALTRO DA UNA RIGA VUOTA/);
  assert.ok(!/TUTTO IN UN SOLO PARAGRAFO/.test(tanti));
  // il rapporto a sezioni non è toccato
  assert.ok(!/{corpo}/.test(promptPer('rapporto', {})));
  assert.ok(!/{corpo}/.test(uno));
});

// La guardia «troppo corto» misura il contenuto, non l'impalcatura: un
// rapporto a sezioni rifatto come lettera perde i titoli, non le frasi.
test('contenutoSenzaIntestazioni: via i titoli di sezione e le righe vuote, le frasi restano', () => {
  const rapporto = 'ANAMNESI:\nIl paziente riferisce dispnea da sforzo da tre mesi.\n\nESAME OBIETTIVO\nToni validi, nessun soffio.\n\nCONCLUSIONI:\nQuadro compatibile con scompenso lieve.\n';
  const c = contenutoSenzaIntestazioni(rapporto);
  assert.ok(!/ANAMNESI|ESAME OBIETTIVO|CONCLUSIONI/.test(c));
  assert.equal(c.split('\n').length, 3);
  assert.ok(c.includes('dispnea da sforzo'));
  // un testo senza intestazioni non cambia (a parte i vuoti)
  const dettato = 'Gentile collega,\nle scrivo per il paziente visto oggi.\nCordiali saluti';
  assert.equal(contenutoSenzaIntestazioni(dettato), dettato);
  // una riga lunga in maiuscolo è contenuto, non un titolo
  const urlo = 'IL PAZIENTE HA AVUTO UN EPISODIO SINCOPALE DURANTE LA NOTTE DI IERI';
  assert.equal(contenutoSenzaIntestazioni(urlo), urlo);
});

// Rubrica degli invianti: omonimi mai indovinati (26.9.2026). Nomi inventati.
import { paroleNome, scegliInRubrica, type RigaRubrica } from './referti-lettera';
const RUBRICA: RigaRubrica[] = [
  { nome: 'Mattia Maggi', email: 'mattia@esempio.ch', studio: null, specialita: 'medicina interna generale' },
  { nome: 'Stefano Maggi', email: 'stefano@esempio.ch', studio: null, specialita: 'medicina interna' },
  { nome: 'Dr.ssa med. Vera Lucia Paiocchi', email: 'vera@esempio.ch', studio: null, specialita: null },
  { nome: 'Edy Massera', email: 'edy@esempio.ch', studio: null, specialita: null },
  { nome: 'François Diederik Rego', email: 'rego@esempio.ch', studio: null, specialita: null },
];
const mail = (n: string) => scegliInRubrica(n, RUBRICA)?.email ?? null;

test('rubrica: un cognome solo e unico basta, qualunque titolo e ordine', () => {
  assert.equal(mail('Dr. med. Massera'), 'edy@esempio.ch');
  assert.equal(mail('Massera Edy'), 'edy@esempio.ch');
  assert.equal(mail('Dr.ssa Paiocchi'), 'vera@esempio.ch');
  assert.equal(mail('Dr. Francois Rego'), 'rego@esempio.ch', 'accenti ignorati');
  assert.deepEqual(paroleNome('Prof. Dr. med. Tiziano Moccetti'), ['tiziano', 'moccetti']);
});

test('rubrica: due omonimi di cognome → serve il nome, altrimenti nessuno', () => {
  assert.equal(mail('Dr. Maggi'), null, 'mai l\'ultimo inserito');
  assert.equal(mail('Dr. med. Stefano Maggi'), 'stefano@esempio.ch');
  assert.equal(mail('Maggi Mattia'), 'mattia@esempio.ch');
  assert.equal(mail('Dr. Luca Maggi'), null, 'nome che non c\'è: nessuno');
  assert.equal(mail('Dr. Bianchi'), null);
  assert.equal(mail('Dr. Luca Massera'), null, 'cognome giusto, nome sbagliato: nessuno');
  assert.equal(mail('Dr. med.'), null);
});
