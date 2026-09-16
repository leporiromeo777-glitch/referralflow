import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { agendaEsclusa, agendeFuoriPiano, applicaModifiche, assegnaVisite, prese, capienza, daSistemarePerPrompt, deduciMedici, escluso, fasceLibere, fuoriDalPiano, leggiProposta, prestazioneEsclusa, prestazioniFuoriPiano, soloIn, daDeciderePerPrompt, leggiSale, pianoDelGiorno, salePerPrompt, titolare } from './sale';

const MD = `
## Sala 3
- Di: Marco Moccetti
- Dalle 13:00: Tiziano Moccetti
- Giorni: lun mar mer gio
- Nota: il venerdì resta di Marco
- Stato: proposta

## Sala 5
- Di: condivisa
- Chi: Davide Girola, Georgios Moschovitis, Miko Pedrotti
- Stato: proposta

## Appar
- Di: Vera Paiocchi
- Funzione: Apparecchi
- Stato: validato
`;

test('sale: il parser legge titolare, fascia oraria, giorni, chi divide e stato', () => {
  const s = leggiSale(MD);
  assert.equal(s.length, 3);
  const tre = s[0];
  assert.equal(tre.nome, 'Sala 3');
  assert.equal(tre.di, 'Marco Moccetti');
  assert.deepEqual(tre.fasce, [{ dalle: '13:00', chi: 'Tiziano Moccetti' }]);
  assert.deepEqual(tre.giorni, ['lun', 'mar', 'mer', 'gio']);
  assert.equal(s[2].stato, 'validato');
  assert.deepEqual(s[1].chi, ['Davide Girola', 'Georgios Moschovitis', 'Miko Pedrotti']);
});

test('sale: «Funzione» dice a che serve la stanza e arriva fino al piano del giorno', () => {
  const s = leggiSale(MD);
  assert.equal(s[2].funzione, 'Apparecchi');
  assert.equal(s[0].funzione, '', 'una stanza senza «Funzione» non se la inventa');
  const piano = pianoDelGiorno(s, ['Vera Paiocchi'], 'mar');
  assert.equal(piano.righe.find((r) => r.stanza === 'Appar')?.funzione, 'Apparecchi');
});

test('sala 3: di Marco la mattina, di Tiziano dalle 13, e di Marco tutto il venerdì', () => {
  const [tre] = leggiSale(MD);
  const presenti = ['Dr. med. Marco Moccetti', 'Prof. Dr. med. Tiziano Moccetti'];
  assert.equal(titolare(tre, '09:00', 'mar', presenti).chi, 'Marco Moccetti');
  assert.equal(titolare(tre, '13:00', 'mar', presenti).chi, 'Tiziano Moccetti');
  assert.equal(titolare(tre, '16:30', 'mar', presenti).chi, 'Tiziano Moccetti');
  // venerdì la regola oraria non vale: la sala resta del titolare
  assert.equal(titolare(tre, '15:00', 'ven', presenti).chi, 'Marco Moccetti');
});

test('sala 3: se Tiziano non è in studio, il pomeriggio resta di Marco', () => {
  const [tre] = leggiSale(MD);
  assert.equal(titolare(tre, '15:00', 'mar', ['Dr. med. Marco Moccetti']).chi, 'Marco Moccetti');
});

test('sala condivisa: con uno solo presente è sua, con due resta da decidere', () => {
  const cinque = leggiSale(MD)[1];
  assert.equal(titolare(cinque, '10:00', 'lun', ['Dr. Davide Girola']).chi, 'Davide Girola');
  const due = titolare(cinque, '10:00', 'lun', ['Dr. Davide Girola', 'Dr. med. Miko Pedrotti']);
  assert.equal(due.chi, '');
  assert.ok(due.perche.includes('condivisa fra'));
  assert.equal(titolare(cinque, '10:00', 'lun', ['Dr. med. Bruno Capelli']).perche, 'libera');
});

test('capienza: dice il picco e le ore in cui le stanze non bastano', () => {
  const app = [
    { inizio: 540, fine: 570 }, { inizio: 540, fine: 570 }, { inizio: 540, fine: 570 },
    { inizio: 600, fine: 630 },
  ];
  const c = capienza(app, 2);
  assert.equal(c.picco, 3);
  assert.deepEqual(c.oreOltre, ['09:00']);
  assert.equal(capienza(app, 5).oreOltre.length, 0, 'con stanze a sufficienza non segnala nulla');
  assert.equal(capienza([], 3).picco, 0);
});

test('sale: la pagina vera si legge e ogni stanza ha un titolare o chi la divide', () => {
  const md = readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8');
  const s = leggiSale(md);
  // Quante stanze siano lo decide lo studio nella pagina, non questo test:
  // qui si controlla che la pagina si legga e che nessuna regola sia monca.
  assert.ok(s.length >= 1, `nessuna stanza letta dalla pagina vera`);
  for (const x of s) assert.ok(x.di || x.chi.length, `${x.nome} senza titolare`);
  assert.ok(s.some((x) => x.fasce.length), 'almeno una stanza ha una regola oraria');
});

test('una sala «condivisa» senza dire fra chi lo dichiara, non stampa un elenco vuoto', () => {
  const s = leggiSale('## RIA\n- Di: condivisa\n- Stato: proposta\n');
  const t = salePerPrompt(s);
  assert.ok(!t.includes('condivisa fra ;'), t);
  assert.ok(t.includes('non è scritto fra chi'));
});

test('piano: fasce contigue con lo stesso titolare si fondono', () => {
  const p = pianoDelGiorno(leggiSale(MD), ['Dr. med. Marco Moccetti'], 'mar');
  const tre = p.righe.find((r) => r.stanza === 'Sala 3')!;
  assert.equal(tre.segmenti.length, 1, 'senza Tiziano la 3 è di Marco tutto il giorno');
  assert.equal(tre.segmenti[0].chi, 'Marco Moccetti');
});

test('piano: con Tiziano la Sala 3 si spezza in due fasce', () => {
  const p = pianoDelGiorno(leggiSale(MD), ['Dr. med. Marco Moccetti', 'Prof. Dr. med. Tiziano Moccetti'], 'mar');
  const tre = p.righe.find((r) => r.stanza === 'Sala 3')!;
  assert.equal(tre.segmenti.length, 2);
  assert.deepEqual(tre.segmenti.map((s) => [s.dalle, s.chi]), [['07:00', 'Marco Moccetti'], ['13:00', 'Tiziano Moccetti']]);
});

test('piano: una stanza condivisa con due presenti finisce in «da decidere»', () => {
  const p = pianoDelGiorno(leggiSale(MD), ['Dr. Davide Girola', 'Dr. med. Miko Pedrotti'], 'lun');
  assert.equal(p.daDecidere.length, 1);
  assert.equal(p.daDecidere[0].stanza, 'Sala 5');
  // con uno solo non c'è niente da decidere
  const solo = pianoDelGiorno(leggiSale(MD), ['Dr. Davide Girola'], 'lun');
  assert.equal(solo.daDecidere.length, 0);
});

test('piano: quello che si manda al modello ha il già deciso, le caselle aperte e chi c’è', () => {
  const presenti = ['Dr. Davide Girola', 'Dr. med. Miko Pedrotti'];
  const t = daDeciderePerPrompt(pianoDelGiorno(leggiSale(MD), presenti, 'lun'), presenti);
  assert.ok(t.includes('IN STUDIO OGGI: Dr. Davide Girola, Dr. med. Miko Pedrotti'));
  assert.ok(t.includes('GIÀ DECISO DALLE REGOLE:'));
  assert.ok(t.includes('Sala 5'));
});

test('correzioni a mano: cambiano la fascia del giorno, non la regola', () => {
  const piano = pianoDelGiorno(leggiSale(MD), ['Marco Moccetti', 'Tiziano Moccetti'], 'mar');
  const prima = piano.righe.find((r) => r.stanza === 'Sala 3')!;
  assert.equal(prima.segmenti[0].chi, 'Marco Moccetti');
  const dopo = applicaModifiche(piano.righe, [{ stanza: 'Sala 3', dalle: '07:00', chi: 'Vera Paiocchi', da: 'Anna' }]);
  const tre = dopo.find((r) => r.stanza === 'Sala 3')!;
  assert.equal(tre.segmenti[0].chi, 'Vera Paiocchi');
  assert.equal(tre.segmenti[0].manuale, true);
  assert.match(tre.segmenti[0].perche, /a mano da Anna/);
  assert.equal(tre.segmenti[1].chi, 'Tiziano Moccetti', 'le altre fasce non si toccano');
  assert.equal(piano.righe.find((r) => r.stanza === 'Sala 3')!.segmenti[0].chi, 'Marco Moccetti', 'il piano di partenza resta intatto');
});

test('correzioni a mano: «chi» vuoto libera la sala, e l\'ultima correzione vince', () => {
  const piano = pianoDelGiorno(leggiSale(MD), ['Vera Paiocchi'], 'mar');
  const dopo = applicaModifiche(piano.righe, [
    { stanza: 'Appar', dalle: '07:00', chi: 'Marco Moccetti' },
    { stanza: 'Appar', dalle: '07:00', chi: '' },
  ]);
  const a = dopo.find((r) => r.stanza === 'Appar')!.segmenti[0];
  assert.equal(a.chi, '');
  assert.equal(a.manuale, true);
  assert.match(a.perche, /liberata a mano/);
});

const MD_VISITE = `
## Sala 1
- Di: Marco Moccetti
- Stato: proposta

## Sala 2
- Di: Marco Moccetti
- Stato: proposta

## Appar
- Di: Vera Paiocchi
- Stato: proposta
`;

test('visite: due pazienti insieme di chi ha due stanze finiscono uno per stanza', () => {
  const piano = pianoDelGiorno(leggiSale(MD_VISITE), ['Marco Moccetti'], 'mar');
  const v = assegnaVisite(piano.righe, [
    { id: 'a', chi: 'Dr. med. Marco Moccetti', start: '09:00', dur: 30 },
    { id: 'b', chi: 'Dr. med. Marco Moccetti', start: '09:00', dur: 30 },
  ]);
  assert.deepEqual(v['Sala 1'].map((x) => x.id), ['a']);
  assert.deepEqual(v['Sala 2'].map((x) => x.id), ['b']);
  assert.equal(v['Sala 1'][0].fine, '09:30');
  assert.ok(!v['Sala 1'][0].sovra && !v['Sala 2'][0].sovra);
});

test('visite: quando le stanze non bastano la visita resta segnata, non sparisce', () => {
  const piano = pianoDelGiorno(leggiSale(MD_VISITE), ['Marco Moccetti'], 'mar');
  const v = assegnaVisite(piano.righe, ['a', 'b', 'c'].map((id) => ({ id, chi: 'Marco Moccetti', start: '09:00', dur: 30 })));
  const tutte = [...v['Sala 1'], ...v['Sala 2']];
  assert.equal(tutte.length, 3, 'nessuna visita persa');
  assert.equal(tutte.filter((x) => x.sovra).length, 1);
});

test('visite: una dopo l’altra riusano la stessa stanza; senza stanza non si mostrano', () => {
  const piano = pianoDelGiorno(leggiSale(MD_VISITE), ['Marco Moccetti'], 'mar');
  const v = assegnaVisite(piano.righe, [
    { id: 'a', chi: 'Marco Moccetti', start: '09:00', dur: 30 },
    { id: 'b', chi: 'Marco Moccetti', start: '09:30', dur: 30 },
    { id: 'x', chi: 'Qualcun Altro', start: '09:00', dur: 30 },
  ]);
  assert.deepEqual(v['Sala 1'].map((x) => x.id), ['a', 'b']);
  assert.deepEqual(v['Sala 2'], []);
  assert.deepEqual(v['Appar'], [], 'la stanza di chi oggi non c’è resta vuota');
});

test('visite: due nella stessa stanza allo stesso momento stanno in corsie diverse', () => {
  const piano = pianoDelGiorno(leggiSale('## Sola\n- Di: Marco Moccetti\n- Stato: proposta\n'), ['Marco Moccetti'], 'mar');
  const v = assegnaVisite(piano.righe, [
    { id: 'a', chi: 'Marco Moccetti', start: '09:00', dur: 30 },
    { id: 'b', chi: 'Marco Moccetti', start: '09:15', dur: 30 },
    { id: 'c', chi: 'Marco Moccetti', start: '11:00', dur: 30 },
  ])['Sola'];
  const per = Object.fromEntries(v.map((x) => [x.id, x]));
  assert.notEqual(per.a.corsia, per.b.corsia, 'a e b si sovrappongono: corsie diverse');
  assert.equal(per.a.corsie, 2);
  assert.equal(per.b.corsie, 2);
  assert.equal(per.c.corsia, 0, 'finito il gruppo si riparte dalla prima corsia');
  assert.equal(per.c.corsie, 1);
  // la regola che conta: mai due visite sovrapposte nella stessa corsia
  for (const x of v) for (const y of v) {
    if (x.id >= y.id || x.corsia !== y.corsia) continue;
    assert.ok(x.fine <= y.inizio || y.fine <= x.inizio, `${x.id} e ${y.id} si sovrappongono nella corsia ${x.corsia}`);
  }
});

test('quel che si manda al modello dice anche le sale vuote e chi è senza stanza', () => {
  const piano = pianoDelGiorno(leggiSale(MD_VISITE), ['Marco Moccetti'], 'mar');
  const t = daSistemarePerPrompt(piano, ['Marco Moccetti'],
    [{ stanza: 'Sala 2', di: 'Marco Moccetti', dalle: '07:00', alle: '19:30' }],
    [{ chi: 'Daniela Cassani', n: 10 }]);
  assert.match(t, /QUANDO LE STANZE SONO LIBERE OGGI[^\n]*:\n- Sala 2 07:00-19:30 \(intestata a Marco Moccetti\)/);
  assert.match(t, /CHI LAVORA OGGI SENZA UNA SALA:\n- Daniela Cassani: 10 visite/);
  assert.ok(!t.includes('Paziente'), 'nel testo per il modello non entrano pazienti');
  const vuoto = daSistemarePerPrompt(piano, ['Marco Moccetti'], [], []);
  assert.match(vuoto, /nessuna: ogni fascia di ogni stanza ha visite/);
  assert.match(vuoto, /nessuno: tutti hanno una stanza/);
});

const PROPOSTA_VERA = `Sala 5 → Girola: Moschovitis ha già Sport 3, la condivisione è ridondante e la stanza va a chi non ne ha.
Sala 2 (intestata a Moccetti) → Cassani, 10 visite: prestito per la giornata, non cambio di intestazione.
Sport 1 (intestata a Capelli) → appuntamenti senza medico, 9 visite: prestito per la giornata.
Bronz, 3 visite: stanze vuote esaurite, non le viene assegnata una sala.
La conferma di ogni assegnazione spetta a chi è in studio.`;

test('la proposta si legge riga per riga, e la persona si cerca dopo la freccia', () => {
  const regole = leggiSale(`
## Sala 2
- Di: Marco Moccetti
- Stato: proposta

## Sala 5
- Di: condivisa
- Chi: Davide Girola, Georgios Moschovitis
- Stato: proposta

## Sport 1
- Di: Bruno Capelli
- Stato: proposta
`);
  const piano = pianoDelGiorno(regole, ['Marco Moccetti', 'Davide Girola', 'Georgios Moschovitis'], 'mar');
  const l = leggiProposta(PROPOSTA_VERA, piano.righe, ['Dr. med. Marco Moccetti', 'Dr. Davide Girola', 'Daniela Cassani', 'Dr. med. Georgios Moschovitis']);
  assert.deepEqual(l.applicabili.map((x) => [x.stanza, x.chi]), [
    ['Sala 5', 'Dr. Davide Girola'],
    ['Sala 2', 'Daniela Cassani'],
  ], '«(intestata a Moccetti)» non deve rubare l’assegnazione a Cassani');
  // «appuntamenti senza medico» non è una persona: la riga resta scritta e non applicata
  assert.equal(l.saltate.length, 1);
  assert.match(l.saltate[0].riga, /^Sport 1/);
  assert.match(l.saltate[0].perche, /nessuno di chi è in studio/);
});

test('la proposta non applica righe ambigue o su stanze con due turni', () => {
  const regole = leggiSale(`
## Sala 3
- Di: Marco Moccetti
- Dalle 13:00: Tiziano Moccetti
- Stato: proposta
`);
  const piano = pianoDelGiorno(regole, ['Marco Moccetti', 'Tiziano Moccetti'], 'mar');
  const l = leggiProposta('Sala 3 → Moccetti: prende la stanza.', piano.righe, ['Dr. med. Marco Moccetti', 'Prof. Dr. med. Tiziano Moccetti']);
  assert.equal(l.applicabili.length, 0);
  assert.match(l.saltate[0].perche, /due persone|due turni/);
});

test('chi è fuori dal piano si legge dalla pagina e si riconosce anche col nome girato', () => {
  const md = `# Sale\n\n- Nota: qualcosa\n- Fuori dal piano: Andrea Bronz, Tal dei Tali\n\n## Sala 1\n- Di: Marco Moccetti\n- Stato: proposta\n`;
  const fuori = fuoriDalPiano(md);
  assert.deepEqual(fuori, ['Andrea Bronz', 'Tal dei Tali']);
  assert.ok(escluso('Bronz Andrea', fuori));
  assert.ok(escluso('Dr. Andrea Bronz', fuori));
  assert.ok(!escluso('Marco Moccetti', fuori));
  assert.equal(leggiSale(md).length, 1, 'la riga non diventa una stanza');
  assert.deepEqual(fuoriDalPiano('## Sala 1\n- Fuori dal piano: Tizio\n'), [], 'vale solo prima delle stanze');
});

test('la pagina vera tiene Andrea Bronz fuori dal piano', () => {
  const md = readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8');
  assert.ok(escluso('Andrea Bronz', fuoriDalPiano(md)));
});

test('anche le prestazioni possono stare fuori dal piano, e le due righe non si confondono', () => {
  const md = `# Sale\n\n- Fuori dal piano: Andrea Bronz\n- Prestazioni fuori dal piano: Intervento, Risonanza magnetica, TAC\n\n## Sala 1\n- Di: Marco Moccetti\n- Stato: proposta\n`;
  assert.deepEqual(fuoriDalPiano(md), ['Andrea Bronz']);
  assert.deepEqual(prestazioniFuoriPiano(md).map((x) => x.nome), ['Intervento', 'Risonanza magnetica', 'TAC']);
  const p = prestazioniFuoriPiano(md);
  assert.ok(prestazioneEsclusa('Risonanza magnetica', 'Chiunque', p));
  assert.ok(prestazioneEsclusa('TAC', 'Chiunque', p));
  assert.ok(!prestazioneEsclusa('Visita cardiologica', 'Chiunque', p));
  assert.ok(!prestazioneEsclusa('Ecocardiogramma', 'Chiunque', p));
  assert.equal(leggiSale(md).length, 1);
});

test('la pagina vera tiene fuori interventi, telefonate e risonanze — ma non quelle di Paiocchi', () => {
  const md = readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8');
  const p = prestazioniFuoriPiano(md);
  for (const x of ['Intervento', 'Risonanza magnetica', 'TAC', 'Colloquio telefonico']) {
    assert.ok(prestazioneEsclusa(x, 'Dr. med. Marco Moccetti', p), x);
  }
  // le risonanze e le TAC di Paiocchi occupano la sua sala, e vanno contate
  assert.ok(!prestazioneEsclusa('Risonanza magnetica', 'Dr.ssa med. Vera Lucia Paiocchi', p));
  assert.ok(!prestazioneEsclusa('TAC', 'Dr.ssa med. Vera Lucia Paiocchi', p));
  // ma una sua telefonata resta una telefonata
  assert.ok(prestazioneEsclusa('Colloquio telefonico', 'Dr.ssa med. Vera Lucia Paiocchi', p));
});

test('l’eccezione non spezza la voce sulle virgole dentro la parentesi', () => {
  const md = '- Prestazioni fuori dal piano: Risonanza magnetica (tranne Vera Paiocchi, François Rego), TAC\n\n## Sala 1\n- Di: Marco Moccetti\n';
  const p = prestazioniFuoriPiano(md);
  assert.deepEqual(p.map((x) => x.nome), ['Risonanza magnetica', 'TAC']);
  assert.deepEqual(p[0].tranne, ['Vera Paiocchi', 'François Rego']);
  assert.ok(!prestazioneEsclusa('Risonanza magnetica', 'Dr. med. François Diederik Rego', p));
  assert.ok(prestazioneEsclusa('Risonanza magnetica', 'Marco Moccetti', p));
});

test('la proposta si legge anche con «ASSEGNA» e con i numeri d’elenco', () => {
  const regole = leggiSale(`
## Sala 2
- Di: Marco Moccetti
- Stato: proposta

## Sport 1
- Di: Bruno Capelli
- Stato: proposta
`);
  const piano = pianoDelGiorno(regole, ['Marco Moccetti'], 'mar');
  const persone = ['Dr. med. Marco Moccetti', 'Daniela Cassani'];
  const nuovo = leggiProposta('ASSEGNA Sala 2 -> Daniela Cassani\nASSEGNA Sport 1 -> Marco Moccetti\nIl resto in prosa.', piano.righe, persone);
  assert.deepEqual(nuovo.applicabili.map((x) => [x.stanza, x.chi]), [['Sala 2', 'Daniela Cassani'], ['Sport 1', 'Dr. med. Marco Moccetti']]);
  const numerato = leggiProposta('1. Sala 2 → Cassani: prestito.\n2. Sport 1 (intestata a Capelli) → Marco Moccetti', piano.righe, persone);
  assert.deepEqual(numerato.applicabili.map((x) => x.stanza), ['Sala 2', 'Sport 1']);
  // senza freccia resta fuori: «assegnare a X» dopo i due punti non si indovina
  const senza = leggiProposta('Sport 1 (intestata a Capelli): assegnare a Marco Moccetti', piano.righe, persone);
  assert.equal(senza.applicabili.length, 0);
  assert.match(senza.saltate[0].perche, /non dice a chi/);
});

test('una proposta che si contraddice non si applica a metà', () => {
  const regole = leggiSale(`
## Sala 5
- Di: condivisa
- Chi: Miko Pedrotti, Sebastiano Franscella
- Stato: proposta

## Sport 3
- Di: condivisa
- Chi: Miko Pedrotti, Sebastiano Franscella
- Stato: proposta
`);
  const piano = pianoDelGiorno(regole, ['Miko Pedrotti', 'Sebastiano Franscella'], 'mer');
  const persone = ['Dr. med. Miko Pedrotti', 'Dr. med. Sebastiano Franscella'];
  // la risposta vera di deepseek-r1 al banco del 15.9: la Sala 5 a due persone
  const l = leggiProposta(
    'ASSEGNA Sala 5 -> Dr. med. Miko Pedrotti\nASSEGNA Sala 5 -> Dr. med. Sebastiano Franscella\nASSEGNA Sport 3 -> Dr. med. Sebastiano Franscella',
    piano.righe, persone);
  // La riga contraddittoria cade; le altre due restano, e nessuno finisce in
  // due stanze o due persone nella stessa stanza.
  assert.deepEqual(l.applicabili.map((x) => [x.stanza, x.chi]), [
    ['Sala 5', 'Dr. med. Miko Pedrotti'],
    ['Sport 3', 'Dr. med. Sebastiano Franscella'],
  ]);
  assert.equal(l.saltate.length, 1);
  assert.match(l.saltate[0].perche, /era già stata assegnata/);
  const stanze = l.applicabili.map((x) => x.stanza), chi = l.applicabili.map((x) => x.chi);
  assert.equal(new Set(stanze).size, stanze.length, 'una stanza sola per riga');
  assert.equal(new Set(chi).size, chi.length, 'una persona in una stanza sola');
});

test('il medico si deduce da chi vede quel paziente quel giorno, non si inventa', () => {
  const d = deduciMedici([
    { id: 'lab1', paziente: 'Gorla Claudio', start: '09:45', chi: '' },
    { id: 'vis1', paziente: 'Gorla Claudio', start: '10:15', chi: 'Dr. Davide Girola' },
    { id: 'vis2', paziente: 'Gorla Claudio', start: '16:00', chi: 'Dr. med. Marco Moccetti' },
    { id: 'lab2', paziente: 'Nessun Altro', start: '11:00', chi: '' },
    { id: 'lab3', paziente: '', start: '12:00', chi: '' },
  ]);
  assert.equal(d.lab1, 'Dr. Davide Girola', 'vince il medico più vicino nel tempo');
  assert.ok(!('lab2' in d), 'un paziente che non vede nessuno resta senza medico');
  assert.ok(!('lab3' in d), 'senza paziente non si deduce niente');
});

test('chi sta «sempre e solo» in una stanza non ne prende altre', () => {
  const md = `- Sempre e solo: Vera Lucia Paiocchi in Sala 1\n\n## Sala 1\n- Di: Vera Lucia Paiocchi\n- Stato: validato\n\n## Sala 2\n- Di: condivisa\n- Chi: Vera Lucia Paiocchi, Marco Moccetti\n- Stato: proposta\n`;
  const v = soloIn(md);
  assert.deepEqual(v, [{ chi: 'Vera Lucia Paiocchi', stanze: ['Sala 1'] }]);
  const piano = pianoDelGiorno(leggiSale(md), ['Vera Lucia Paiocchi'], 'mar');
  // senza vincolo la Sala 2 sarebbe sua (unica presente fra chi la divide)
  const senza = assegnaVisite(piano.righe, [{ id: 'a', chi: 'Dr.ssa med. Vera Lucia Paiocchi', start: '09:00', dur: 30 }]);
  assert.equal(senza['Sala 2'].length + senza['Sala 1'].length, 1);
  const con = assegnaVisite(piano.righe, [{ id: 'a', chi: 'Dr.ssa med. Vera Lucia Paiocchi', start: '09:00', dur: 30 }], v);
  assert.deepEqual(con['Sala 1'].map((x) => x.id), ['a']);
  assert.deepEqual(con['Sala 2'], [], 'nemmeno quando la stanza sarebbe libera');
  // e una proposta che prova a spostarla non si applica
  const l = leggiProposta('ASSEGNA Sala 2 -> Dr.ssa med. Vera Lucia Paiocchi', piano.righe, ['Dr.ssa med. Vera Lucia Paiocchi'], v);
  assert.equal(l.applicabili.length, 0);
  assert.match(l.saltate[0].perche, /solo in Sala 1/);
});

test('«Solo in» ammette più stanze, e le separa con «o» perché la virgola separa le voci', () => {
  const md = `- Sempre e solo: Vera Lucia Paiocchi in Sala 1\n- Solo in: Marco Moccetti in Sala 2 o Sala 3\n\n## Sala 2\n- Di: Marco Moccetti\n- Stato: proposta\n\n## Sport 1\n- Di: Marco Moccetti\n- Ultima: sì\n- Stato: proposta\n`;
  const v = soloIn(md);
  assert.deepEqual(v, [
    { chi: 'Vera Lucia Paiocchi', stanze: ['Sala 1'] },
    { chi: 'Marco Moccetti', stanze: ['Sala 2', 'Sala 3'] },
  ]);
  const piano = pianoDelGiorno(leggiSale(md), ['Marco Moccetti'], 'mar');
  const visite = ['a', 'b', 'c'].map((id) => ({ id, chi: 'Dr. med. Marco Moccetti', start: '09:00', dur: 30 }));
  // Senza vincolo la terza visita traboccherebbe nella Sport 1; col vincolo no.
  assert.ok(assegnaVisite(piano.righe, visite)['Sport 1'].length > 0);
  const con = assegnaVisite(piano.righe, visite, v);
  assert.deepEqual(con['Sport 1'], [], 'nelle sale dello sport non ci va nemmeno quando la sua è piena');
  assert.equal(con['Sala 2'].length, 3, 'si accavallano in corsie nella sua stanza, invece di uscirne');
  const l = leggiProposta('ASSEGNA Sport 1 -> Marco Moccetti', piano.righe, ['Dr. med. Marco Moccetti'], v);
  assert.equal(l.applicabili.length, 0);
  assert.match(l.saltate[0].perche, /solo in Sala 2 o Sala 3/);
});

test('i vincoli fissi arrivano anche nel testo per il modello, non solo nel controllo dopo', () => {
  const md = `- Solo in: Marco Moccetti in Sala 2 o Sala 3\n\n## Sala 2\n- Di: Marco Moccetti\n- Stato: proposta\n`;
  const piano = pianoDelGiorno(leggiSale(md), ['Marco Moccetti'], 'mar');
  const testo = daSistemarePerPrompt(piano, ['Marco Moccetti'], [], [], soloIn(md));
  assert.match(testo, /VINCOLI FISSI/);
  assert.match(testo, /Marco Moccetti: solo in Sala 2 o Sala 3, mai altrove/);
  assert.ok(!daSistemarePerPrompt(piano, ['Marco Moccetti'], [], []).includes('VINCOLI FISSI'), 'senza vincoli non si scrive una sezione vuota');
});

test('un\'agenda fuori dal piano non porta nessuno in stanza: «Labor» è il prelievo', () => {
  const md = `- Agende fuori dal piano: Labor, Appar\n- Fuori dal piano: Andrea Bronz\n\n## Sala 1\n- Di: François Rego\n- Stato: proposta\n`;
  assert.deepEqual(agendeFuoriPiano(md), ['Labor', 'Appar']);
  assert.equal(agendaEsclusa('Labor', agendeFuoriPiano(md)), true);
  assert.equal(agendaEsclusa(' labor ', agendeFuoriPiano(md)), true, 'senza maiuscole né spazi');
  assert.equal(agendaEsclusa('frego', agendeFuoriPiano(md)), false);
  assert.equal(agendaEsclusa('', agendeFuoriPiano(md)), false, 'agenda non scritta non è esclusa');
  assert.deepEqual(agendeFuoriPiano('## Sala 1\n- Agende fuori dal piano: Labor\n'), [],
    'le righe in testa contano solo prima della prima stanza');
});

test('la stanza si prende per il tempo delle visite, non per tutto il giorno', () => {
  const md = `## Sala 3\n- Di: Marco Moccetti\n- Dalle 13:00: Tiziano Moccetti\n- Stato: proposta\n\n## Sala 4\n- Di: François Rego\n- Stato: proposta\n`;
  const piano = pianoDelGiorno(leggiSale(md), ['Marco Moccetti', 'Tiziano Moccetti', 'François Rego'], 'mar');
  // Marco lavora solo il pomeriggio, Tiziano riempie la sua fascia
  const visite = assegnaVisite(piano.righe, [
    { id: 'a', chi: 'Tiziano Moccetti', start: '13:30', dur: 30 },
    { id: 'b', chi: 'François Rego', start: '09:00', dur: 30 },
  ]);
  // La presa è il tempo che le visite occupano davvero, non la fascia intera.
  const p = prese(piano.righe, visite);
  assert.deepEqual(p['Sala 3'].map((x) => `${x.dalle}-${x.alle} ${x.chi}`), ['13:30-14:00 Tiziano Moccetti']);
  assert.deepEqual(p['Sala 4'].map((x) => `${x.dalle}-${x.alle}`), ['09:00-09:30']);
  const libere = fasceLibere(piano.righe, visite);
  assert.deepEqual(libere.map((x) => `${x.stanza} ${x.dalle}-${x.alle} ${x.di}`), [
    'Sala 3 07:00-13:00 Marco Moccetti',      // Marco non ha visite: la sua fascia è tutta libera
    'Sala 3 13:00-13:30 Tiziano Moccetti',    // prima della sua unica visita
    'Sala 3 14:00-19:30 Tiziano Moccetti',    // e dopo: non tiene la stanza fino a sera
    'Sala 4 07:00-09:00 François Rego',
    'Sala 4 09:30-19:30 François Rego',
  ]);
  // contata per giornata intera, la Sala 3 non sarebbe mai risultata libera
  assert.ok((visite['Sala 3'] ?? []).length > 0, 'la stanza ha visite, ma non nella prima fascia');
});

test('un buco più corto di mezz’ora fra due visite non è una stanza libera', () => {
  const md = `## Sala 9\n- Di: François Rego\n- Stato: proposta\n`;
  const piano = pianoDelGiorno(leggiSale(md), ['François Rego'], 'mar');
  // una visita alle 07:10: i dieci minuti prima non si annunciano come liberi
  const v = assegnaVisite(piano.righe, [{ id: 'a', chi: 'François Rego', start: '07:10', dur: 30 }]);
  const libere = fasceLibere(piano.righe, v);
  assert.deepEqual(libere.map((x) => `${x.dalle}-${x.alle}`), ['07:40-19:30']);
});

test('le sale «ultime» si riempiono solo quando le altre non bastano', () => {
  const md = `## Sala 9\n- Di: Georgios Moschovitis\n- Stato: proposta\n\n## Sport 1\n- Di: Georgios Moschovitis\n- Ultima: sì\n- Stato: proposta\n`;
  const sale = leggiSale(md);
  assert.equal(sale.find((x) => x.nome === 'Sport 1')?.ultima, true);
  assert.equal(sale.find((x) => x.nome === 'Sala 9')?.ultima, false);
  const piano = pianoDelGiorno(sale, ['Georgios Moschovitis'], 'mar');
  // una visita sola: va nella sala normale, non nello sport
  const una = assegnaVisite(piano.righe, [{ id: 'a', chi: 'Georgios Moschovitis', start: '09:00', dur: 30 }]);
  assert.deepEqual(una['Sala 9'].map((x) => x.id), ['a']);
  assert.deepEqual(una['Sport 1'], []);
  // due insieme: la seconda apre lo sport, perché la normale è occupata
  const due = assegnaVisite(piano.righe, [
    { id: 'a', chi: 'Georgios Moschovitis', start: '09:00', dur: 30 },
    { id: 'b', chi: 'Georgios Moschovitis', start: '09:00', dur: 30 },
  ]);
  assert.deepEqual(due['Sala 9'].map((x) => x.id), ['a']);
  assert.deepEqual(due['Sport 1'].map((x) => x.id), ['b']);
  // e nell'elenco delle fasce libere le «ultime» vengono dopo, e lo dicono
  const libere = fasceLibere(piano.righe, una);
  // la Sport 1 è libera tutto il giorno; la Sala 9 solo attorno alla visita
  assert.deepEqual(libere.map((x) => `${x.stanza} ${x.dalle}-${x.alle}`),
    ['Sala 9 07:00-09:00', 'Sala 9 09:30-19:30', 'Sport 1 07:00-19:30']);
  assert.equal(libere.find((x) => x.stanza === 'Sport 1')!.ultima, true);
  assert.equal(libere.find((x) => x.stanza === 'Sala 9')!.ultima, false);
});
