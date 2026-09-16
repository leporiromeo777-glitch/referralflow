import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETRI_DEFAULT, fondiParametri } from './parametri';
import { costruisciGrafo, entraNelPiano, leggiPrestazioni, medicoAbilitato, salaPreferita, salePossibili } from './grafo';
import { rigidita, ritardoMedico, statoSala, transizioneAmmessa } from './stato';
import { mediana, riepilogoDurate, scartoMedico, stimaDurata } from './previsione';
import { pianifica, type VisitaDaPianificare } from './riparatore';
import { decidiIngresso, livelloComunicazione, spostaABlocco } from './orizzonte';
import { avviso, confronta, frase, fraseAssorbito } from './spiega';

// Tutto inventato. Pazienti come codici, mai nomi veri.
const P = PARAMETRI_DEFAULT;
const MD_SALE = `- Agende fuori dal piano: Labor
- Prestazioni fuori dal piano: Colloquio telefonico, Risonanza magnetica (tranne Vera Lucia Paiocchi)
- Sempre e solo: Vera Lucia Paiocchi in Sala 1
- Solo in: Marco Moccetti in Sala 2 o Sala 3

## Sala 1
- Di: Vera Lucia Paiocchi
- Stato: validato

## Sala 2
- Di: Marco Moccetti
- Stato: proposta

## Sala 3
- Di: condivisa
- Stato: proposta

## Sala 5
- Di: Daniela Cassani
- Funzione: Ecografia
- Stato: proposta

## Sport 1
- Di: Bruno Capelli
- Ultima: sì
- Stato: proposta
`;
const MD_PREST = `## Visita cardiologica
- Durata: 20
- Breve: 10
- Preparazione: pressione e peso, 3 minuti, assistente
- Sale: tutte
- Apparecchi: nessuno

## Ecocardiogramma
- Durata: 30
- Preparazione: spogliato, gel, elettrodi, 5 minuti, assistente
- Ripristino: 3
- Sale: Sala 5
- Apparecchi: ecografo
- Medici: Daniela Cassani, Marco Moccetti

## Holter ECG 24h
- Durata: 15
- Preparazione: nessuna
- Sale: tutte
- Medico: non serve

## Risonanza magnetica
- Durata: 45
- Preparazione: nessuna
- Sale: Sala 1 (Vera Lucia Paiocchi)
`;
const G = costruisciGrafo({ mdSale: MD_SALE, mdPrestazioni: MD_PREST, distanze: [{ da: 'Sala 2', a: 'Sport 1', secondi: 180 }] });

test('la pagina delle prestazioni si legge: durata, preparazione, sale, eccezioni, senza medico', () => {
  const p = leggiPrestazioni(MD_PREST);
  const v = p.find((x) => x.nome === 'Visita cardiologica')!;
  assert.equal(v.durata, 20); assert.equal(v.breve, 10);
  assert.deepEqual(v.preparazione, { nome: 'pressione e peso', minuti: 3, ruolo: 'assistente' });
  assert.equal(v.sale, 'tutte');
  const e = p.find((x) => x.nome === 'Ecocardiogramma')!;
  assert.deepEqual(e.sale, ['Sala 5']); assert.deepEqual(e.apparecchi, ['ecografo']); assert.equal(e.ripristino, 3);
  assert.equal(e.preparazione!.nome, 'spogliato, gel, elettrodi', 'il nome della preparazione tiene le virgole prima dei minuti');
  const h = p.find((x) => x.nome === 'Holter ECG 24h')!;
  assert.equal(h.senzaMedico, true); assert.equal(h.preparazione, null);
  const r = p.find((x) => x.nome === 'Risonanza magnetica')!;
  assert.deepEqual(r.sale, []); assert.deepEqual(r.eccezioni, [{ sala: 'Sala 1', chi: 'Vera Lucia Paiocchi' }]);
});

test('le stanze possibili incrociano prestazione, vincoli del medico ed esclusive altrui', () => {
  assert.deepEqual(salePossibili(G, 'Dr.ssa med. Vera Lucia Paiocchi', 'Visita cardiologica'), ['Sala 1'], 'esclusiva: solo la sua');
  assert.deepEqual(salePossibili(G, 'Dr. med. Marco Moccetti', 'Visita cardiologica'), ['Sala 2', 'Sala 3'], 'solo in: le sue due');
  assert.deepEqual(salePossibili(G, 'Dr. med. François Rego', 'Visita cardiologica'), ['Sala 2', 'Sala 3', 'Sala 5', 'Sport 1'], 'libero: tutte meno la Sala 1 esclusiva di un\'altra');
  assert.deepEqual(salePossibili(G, 'Daniela Cassani', 'Ecocardiogramma'), ['Sala 5'], 'la prestazione la chiude sulla stanza dell\'ecografo');
  assert.deepEqual(salePossibili(G, 'Marco Moccetti', 'Ecocardiogramma'), [], 'eco in Sala 5, ma lui può stare solo in 2 o 3: nessuna stanza — e va detto');
  assert.deepEqual(salePossibili(G, 'Vera Lucia Paiocchi', 'Risonanza magnetica'), ['Sala 1'], 'l\'eccezione per persona apre la stanza');
  assert.deepEqual(salePossibili(G, 'François Rego', 'Risonanza magnetica'), [], 'per gli altri la risonanza non ha stanze');
  assert.equal(medicoAbilitato(G, 'François Rego', 'Ecocardiogramma'), false);
  assert.equal(medicoAbilitato(G, 'François Rego', 'Visita cardiologica'), true, 'senza riga Medici sono tutti abilitati');
  assert.equal(salaPreferita(G, 'Dr. med. Marco Moccetti'), 'Sala 2', 'la riga Di: è una preferenza, non un vincolo');
});

test('chi e che cosa entra nel piano: le stesse regole della pagina delle sale', () => {
  assert.equal(entraNelPiano(G, { medico: 'Rego', prestazione: 'Visita cardiologica', agenda: 'frego' }), true);
  assert.equal(entraNelPiano(G, { medico: '', prestazione: '', agenda: 'Labor' }), false);
  assert.equal(entraNelPiano(G, { medico: 'Rego', prestazione: 'Colloquio telefonico', agenda: 'frego' }), false);
  assert.equal(entraNelPiano(G, { medico: 'Rego', prestazione: 'Risonanza magnetica', agenda: 'frego' }), false);
  assert.equal(entraNelPiano(G, { medico: 'Vera Lucia Paiocchi', prestazione: 'Risonanza magnetica', agenda: 'vpaio' }), true, 'l\'eccezione della pagina vale anche qui');
});

test('la macchina a stati rifiuta le transizioni non ammesse e il sistema non richiama nessuno', () => {
  assert.equal(transizioneAmmessa('in_attesa', 'chiamato', 'sistema'), true);
  assert.equal(transizioneAmmessa('chiamato', 'in_attesa', 'sistema'), false, 'richiamare lo può fare solo una persona');
  assert.equal(transizioneAmmessa('chiamato', 'in_attesa', 'persona'), true);
  assert.equal(transizioneAmmessa('pronto', 'in_attesa', 'persona'), false, 'da pronto non si torna indietro');
  assert.equal(transizioneAmmessa('in_visita', 'visita_finita', 'dettato'), true, 'l\'audio del dettato chiude la visita');
  assert.equal(transizioneAmmessa('atteso', 'in_visita', 'robot'), true, 'il robot può saltare gli stati che non vede');
  assert.equal(rigidita('in_attesa', 700, 600, P), 0);
  assert.equal(rigidita('in_attesa', 605, 600, P), 2, 'a 5 minuti la stanza è fissa anche se è ancora in attesa');
  assert.equal(rigidita('in_attesa', 600, 600, P), 3);
  assert.equal(rigidita('pronto', 700, 600, P), 3, 'pronto è congelato qualunque sia l\'ora');
  assert.equal(rigidita('in_attesa', 700, 600, P, 2), 2, 'un comando alza la rigidità');
  assert.equal(statoSala({ dentro: [{ stato: 'in_visita' }] }), 'occupata_visita');
  assert.equal(statoSala({ dentro: [{ stato: 'pronto' }] }), 'occupata_pronto');
  assert.equal(statoSala({ dentro: [], riservata: true }), 'riservata');
  assert.equal(statoSala({ dentro: [{ stato: 'in_visita' }], fuoriServizio: true }), 'fuori_servizio');
  assert.equal(ritardoMedico({ inVisita: true, inizioReale: 600, durataStimata: 15, residuo: 0, adesso: 620 }), 5);
  assert.equal(ritardoMedico({ inVisita: true, inizioReale: 600, durataStimata: 15, residuo: 6, adesso: 610 }), 6, 'prima della fine stimata resta solo il residuo');
});

test('la previsione: fissata, mediana del medico, mediana della prestazione, catalogo', () => {
  assert.equal(mediana([3, 1, 2]), 2); assert.equal(mediana([1, 2, 3, 4]), 3); assert.equal(mediana([]), null);
  const oss = [
    ...Array.from({ length: 10 }, (_, i) => ({ prestazione: 'Visita cardiologica', medico: 'Rego', ora: 540, minuti: 22 + (i % 3) })),
    ...Array.from({ length: 10 }, (_, i) => ({ prestazione: 'Visita cardiologica', medico: 'Girola', ora: 540, minuti: 18 + (i % 2) })),
  ];
  assert.equal(stimaDurata({ prestazione: 'Visita cardiologica', medico: 'Rego', ora: 540, catalogo: 20, osservate: oss }).fonte, 'mediana_medico');
  assert.equal(stimaDurata({ prestazione: 'Visita cardiologica', medico: 'Rego', ora: 540, catalogo: 20, osservate: oss }).minuti, 23);
  const m = stimaDurata({ prestazione: 'Visita cardiologica', medico: 'Moschovitis', ora: 540, catalogo: 20, osservate: oss });
  assert.equal(m.fonte, 'mediana_prestazione'); assert.equal(m.minuti, 21, 'mediana di tutti (19 e 22 in mezzo → 21), scarto zero per chi non ha misure');
  assert.equal(stimaDurata({ prestazione: 'Ecocardiogramma', medico: 'Rego', ora: 540, catalogo: 30, osservate: oss }).fonte, 'catalogo');
  assert.equal(stimaDurata({ prestazione: 'Visita cardiologica', medico: 'Rego', ora: 540, catalogo: 20, osservate: oss, fissate: [{ prestazione: 'Visita cardiologica', medico: '', minuti: 25 }] }).minuti, 25, 'la parola dello studio vince');
  assert.equal(stimaDurata({ prestazione: 'Visita cardiologica', medico: 'Rego', ora: 540, catalogo: 20, osservate: oss, primaVisita: true }).minuti, 28, 'prima visita: +5 finché non è misurato');
  assert.equal(scartoMedico('Rego', oss), 2, 'Rego sta sopra la mediana della prestazione (21) di 2');
  assert.equal(riepilogoDurate(oss).length, 2);
});

const visita = (id: string, medico: string, teorica: number, extra: Partial<VisitaDaPianificare> = {}): VisitaDaPianificare => ({
  id, medico, prestazione: 'Visita cardiologica', teorica, durata: 20, prep: 3, ripristino: 0,
  salePossibili: ['Sala 2', 'Sala 3', 'Sala 5', 'Sport 1'], salaPreferita: null, apparecchi: [], assistenti: ['ass'],
  senzaMedico: false, arrivo: null, stato: 'atteso', rigidita: 0, salaFissa: null, inizioFisso: null, comunicato: null, priorita: 0, ...extra,
});
const stanze = ['Sala 2', 'Sala 3', 'Sala 5', 'Sport 1'].map((nome) => ({ nome, posti: 1, bloccata: [] as [number, number][], ultima: nome.startsWith('Sport') }));
const base = (adesso: number, visite: VisitaDaPianificare[], medici: { nome: string; liberoDa: number; inSala: string | null; ritardo: number }[] = []) => ({
  adesso, visite, stanze, medici, assistenti: [{ nome: 'ass', liberoDa: 0 }], apparecchi: [],
  distanza: (a: string | null, b: string) => (a && b === 'Sport 1' && a !== 'Sport 1' ? 180 : 60),
});

test('il medico è mobile: due visite di fila stanno in due stanze, la seconda si prepara mentre finisce la prima', () => {
  const piano = pianifica(base(500, [visita('a', 'Marco Moccetti', 540, { salePossibili: ['Sala 2', 'Sala 3'], salaPreferita: 'Sala 2' }), visita('b', 'Marco Moccetti', 560, { salePossibili: ['Sala 2', 'Sala 3'], salaPreferita: 'Sala 2' })]), P);
  assert.equal(piano.visite.a.sala, 'Sala 2', 'la prima nella sua preferita');
  assert.equal(piano.visite.a.inizio, 540);
  assert.equal(piano.visite.b.sala, 'Sala 3', 'la seconda entra in un\'altra stanza: alle 09:12 la Sala 2 è ancora occupata');
  assert.equal(piano.visite.b.inizio, 561, 'un minuto di spostamento fra le due stanze');
  assert.equal(piano.visite.b.ingresso, 553, 'entra otto minuti prima del medico');
  assert.deepEqual(piano.sequenze['Marco Moccetti'].map((t) => t.sala), ['Sala 2', 'Sala 3']);
});

test('stessa stanza uno dopo l\'altro solo con dieci minuti di pausa; chi ha una stanza sola è esente', () => {
  // Rego con una stanza sola disponibile: la seconda visita aspetta la pausa.
  const una = pianifica(base(500, [visita('a', 'Rego', 540, { salePossibili: ['Sala 3'] }), visita('b', 'Rego', 560, { salePossibili: ['Sala 3'] })]), P);
  assert.equal(una.visite.a.inizio, 540);
  assert.equal(una.visite.b.inizio, 570, 'finita alle 10:00, la seconda nella stessa stanza non prima delle 10:10');
  // Con due stanze la seconda va nell'altra, senza aspettare.
  const due = pianifica(base(500, [visita('a', 'Rego', 540, { salePossibili: ['Sala 3', 'Sala 5'] }), visita('b', 'Rego', 560, { salePossibili: ['Sala 3', 'Sala 5'] })]), P);
  assert.equal(due.visite.b.sala, 'Sala 5');
  assert.equal(due.visite.b.inizio, 561);
  // Paiocchi ha la Sala 1 e basta: due di fila senza pausa.
  const vp = pianifica({ ...base(500, [visita('a', 'Paiocchi', 540, { salePossibili: ['Sala 1'], stessaStanzaLibera: true }), visita('b', 'Paiocchi', 560, { salePossibili: ['Sala 1'], stessaStanzaLibera: true })]), stanze: [{ nome: 'Sala 1', posti: 1, bloccata: [], ultima: false }] }, P);
  assert.equal(vp.visite.b.inizio, 568, 'solo gli otto minuti in cui il paziente si prepara nella stanza, niente pausa in più');
});

test('mai due medici nella stessa stanza allo stesso momento; lo stesso medico sì, fino ai posti', () => {
  const piano = pianifica(base(500, [
    visita('r1', 'Rego', 540, { salePossibili: ['Sala 3'] }),
    visita('t1', 'Tiziano', 540, { salePossibili: ['Sala 3'] }),
  ]), P);
  assert.equal(piano.visite.r1.sala, 'Sala 3');
  assert.equal(piano.visite.t1.inizio, 568, 'Tiziano entra quando Rego ha finito (10:00) più gli otto minuti in cui il suo paziente si prepara nella stanza: non insieme');
  const due = pianifica(base(500, [visita('a', 'Rego', 540, { salePossibili: ['Sala 3'] }), visita('b', 'Rego', 540, { salePossibili: ['Sala 3'] })], []), P);
  assert.equal(due.visite.b.inizio, 570, 'con un medico solo e una stanza da un posto, il secondo entra dopo la pausa di dieci minuti nella stessa stanza');
});

test('un congelato non si muove, e chi arriva dopo gli gira attorno', () => {
  const piano = pianifica(base(600, [
    visita('p', 'Rego', 590, { stato: 'pronto', rigidita: 3, salaFissa: 'Sala 3', inizioFisso: 600, arrivo: 585 }),
    visita('q', 'Rego', 600, { arrivo: 598 }),
  ], [{ nome: 'Rego', liberoDa: 600, inSala: null, ritardo: 0 }]), P);
  assert.equal(piano.visite.p.sala, 'Sala 3'); assert.equal(piano.visite.p.inizio, 600);
  assert.ok(piano.visite.q.inizio >= 620, 'il secondo dopo il congelato');
  assert.notEqual(piano.visite.q.sala, 'Sala 3', 'e in un\'altra stanza, così è pronto quando Rego esce');
});

test('il ritardo del medico sposta i suoi, chi non è arrivato non parte prima dell\'ora, le stanze bloccate non si usano', () => {
  const piano = pianifica(base(600, [visita('a', 'Rego', 600), visita('b', 'Girola', 600, { salePossibili: ['Sala 5'] })],
    [{ nome: 'Rego', liberoDa: 612, inSala: 'Sala 2', ritardo: 12 }]), P);
  assert.equal(piano.visite.a.inizio, 612, 'Rego è libero alle 10:12: la visita comincia allora');
  assert.equal(piano.visite.a.sala, 'Sala 2', 'e resta nella stanza dov\'è, senza spostarsi');
  assert.equal(piano.visite.b.inizio, 600);
  const presto = pianifica(base(595, [visita('c', 'Rego', 620, { arrivo: 590 })]), P);
  assert.equal(presto.visite.c.inizio, 595, 'arrivato alle 09:50 con il medico libero: si anticipa, ma non prima di adesso');
  const futuro = pianifica(base(500, [visita('c', 'Rego', 620, { arrivo: 590 })]), P);
  assert.equal(futuro.visite.c.inizio, 620, 'alle 08:20 non è ancora arrivato: si pianifica all\'ora teorica');
  const bloccata = pianifica({ ...base(500, [visita('d', 'Rego', 600, { salePossibili: ['Sala 3'] })]), stanze: [{ nome: 'Sala 3', posti: 1, bloccata: [[560, 700]], ultima: false }] }, P);
  assert.equal(bloccata.visite.d.inizio, 700 + 8, 'bloccata fino alle 11:40: entra dopo, con l\'anticipo');
});

test('senza stanza compatibile lo si dice; le «ultime» si usano solo se serve; i cuscinetti del mattino', () => {
  const nessuna = pianifica(base(500, [visita('x', 'Marco Moccetti', 600, { salePossibili: [] })]), P);
  assert.equal(nessuna.senzaSala.length, 1);
  assert.match(nessuna.senzaSala[0].perche, /nessuna stanza compatibile/);
  const una = pianifica(base(500, [visita('u', 'Capelli', 600)]), P);
  assert.notEqual(una.visite.u.sala, 'Sport 1', 'con le normali libere lo sport non si apre');
  const con = pianifica({ ...base(500, Array.from({ length: 7 }, (_, i) => visita(`c${i}`, 'Rego', 540 + i * 20))), conCuscinetti: true }, { ...P, cuscinetto_ogni_visite: 3, cuscinetto_min: 10 });
  assert.equal(con.visite.c3.inizio, 612, 'dopo tre visite (che alternano due stanze: +1 min di spostamento ciascuna) dieci minuti di cuscinetto: 602 + 10');
});

test('fra più stanze si preferisce quella già comunicata: la stabilità è un termine dell\'obiettivo', () => {
  const piano = pianifica(base(500, [visita('a', 'Rego', 600, { comunicato: { sala: 'Sala 5', ingresso: 592 } })]), P);
  assert.equal(piano.visite.a.sala, 'Sala 5');
  assert.equal(piano.termini.modifica, 0);
  const cambio = pianifica(base(500, [visita('a', 'Rego', 600, { comunicato: { sala: 'Sala 5', ingresso: 592 }, salePossibili: ['Sala 3'] })]), P);
  assert.equal(cambio.termini.modifica, P.pesi.modifica_stanza, 'cambio di stanza a parità d\'ora: costa il fisso');
});

test('l\'orizzonte: soglie di comunicazione, ingresso intelligente, spostamento a blocco', () => {
  assert.equal(livelloComunicazione(3, false, P), 'silenzio');
  assert.equal(livelloComunicazione(8, false, P), 'mappa');
  assert.equal(livelloComunicazione(20, false, P), 'accoglienza');
  assert.equal(livelloComunicazione(2, true, P), 'accoglienza', 'un cambio di stanza si dice sempre');
  assert.equal(decidiIngresso({ arrivoMedico: 640, adesso: 600, prep: 3, pazienteArrivato: true, stanzaLibera: true, assistenteLibero: true }, P).azione, 'attendi', 'a 40 minuti resta in sala d\'attesa');
  assert.equal(decidiIngresso({ arrivoMedico: 610, adesso: 600, prep: 3, pazienteArrivato: true, stanzaLibera: true, assistenteLibero: true }, P).azione, 'non_ancora', 'si chiama alle 10:02');
  assert.equal(decidiIngresso({ arrivoMedico: 606, adesso: 600, prep: 3, pazienteArrivato: true, stanzaLibera: true, assistenteLibero: true }, P).azione, 'chiama');
  assert.equal(decidiIngresso({ arrivoMedico: 606, adesso: 600, prep: 3, pazienteArrivato: false, stanzaLibera: true, assistenteLibero: true }, P).azione, 'non_ancora');
  const mossi = spostaABlocco([{ id: 'z', sala: 'Sala 2', ingresso: 800, inizio: 808, fine: 828, assistente: null, apparecchi: [], attesa: 0, perche: {} }], { Rego: 12 }, () => 'Rego');
  assert.equal(mossi[0].inizio, 820); assert.equal(mossi[0].sala, 'Sala 2');
});

test('le spiegazioni: il diff e le frasi fisse', () => {
  const prima = { a: { id: 'a', sala: 'Sala 3', ingresso: 640, inizio: 648, fine: 668, assistente: null, apparecchi: [], attesa: 0, perche: {} } };
  const dopo = { a: { ...prima.a, ingresso: 652, inizio: 660, fine: 680 } };
  const [c] = confronta(prima, dopo, () => 'P-21', P);
  assert.equal(c.tipo, 'ora'); assert.equal(c.deltaMin, 12); assert.equal(c.livello, 'mappa');
  assert.equal(avviso(c), 'P-21: ingresso 10:40 → 10:52');
  assert.equal(frase(c, { tipo: 'visita_piu_lunga', medico: 'Dr. med. François Rego', restoInAttesa: true }),
    'P-21 è stato posticipato di 12 minuti (10:40 → 10:52) perché la visita precedente di Rego sta durando più del previsto. È rimasto in sala d\'attesa per non occupare inutilmente la Sala 3.');
  assert.equal(fraseAssorbito('Rego', 15, ['stanza_alternativa:Sala 4', 'riordino:P-21<>P-22'], 0),
    'Il ritardo di 15 minuti di Rego è stato assorbito usando la Sala 4 e invertendo P-21 e P-22. Nessun altro appuntamento si è mosso.');
  assert.equal(fondiParametri({ orizzonte_min: 120, pesi: { attesa: 50, sconosciuto: 1 }, cosa: 'x' }).orizzonte_min, 120);
  assert.equal(fondiParametri({ pesi: { attesa: 50 } }).pesi.attesa, 50);
});

import { leggiEvento, verificaEvento } from './interpreta';
import { applicaStrategia, leggiStrategia } from './escalation';

test('il modello piccolo risponde in forma fissa, e il codice verifica contro l\'elenco di oggi', () => {
  const e = leggiEvento('TIPO: paziente_in_ritardo\nPAZIENTE: P-07\nMEDICO:\nSTANZA:\nMINUTI: 30\nCOMANDO:\nNOTA: dopo il prelievo');
  assert.deepEqual(e, { tipo: 'paziente_in_ritardo', paziente: 'P-07', medico: '', stanza: '', minuti: 30, comando: '', nota: 'dopo il prelievo' });
  assert.equal(leggiEvento('TIPO: nessuno'), null);
  assert.equal(leggiEvento('Non ho capito.'), null);
  const oggi = { pazienti: ['P-01', 'P-07'], medici: ['Rego'], stanze: ['Sala 3'] };
  assert.equal(verificaEvento(e!, oggi).ok, true);
  assert.deepEqual(verificaEvento({ ...e!, paziente: 'P-99' }, oggi).problemi, ['paziente «P-99» non è fra quelli di oggi']);
  assert.ok(!verificaEvento(leggiEvento('TIPO: medico_in_ritardo\nMEDICO: Rego')!, oggi).ok, 'senza i minuti non è un ritardo');
});

test('la strategia del modello grande: solo la forma fissa, solo mosse ammesse, mai un congelato', () => {
  const s = leggiStrategia('<think>ragiono…</think>\nPIANO: 2\nMOSSA: stanza_alternativa:Sala 3\nMOSSA: riordino:P-21<>P-22\nMOSSA: cambia_medico:P-21\nPERCHE: Così P-22 non aspetta.\nSeconda riga.');
  assert.equal(s!.piano, 2);
  assert.deepEqual(s!.mosse, ['stanza_alternativa:Sala 3', 'riordino:P-21<>P-22'], 'la mossa che non esiste è caduta');
  assert.equal(leggiStrategia('Vi consiglio di aspettare.'), null);
  const visite = [{ id: 'P-21', medico: 'Rego', rigidita: 0, salePossibili: ['Sala 3'] }, { id: 'P-22', medico: 'Rego', rigidita: 3, salePossibili: ['Sala 3'] }, { id: 'P-30', medico: 'Girola', rigidita: 0, salePossibili: [] }];
  const a = applicaStrategia({ piano: 1, mosse: ['riordino:P-21<>P-22', 'riordino:P-21<>P-30', 'attesa:P-22', 'attesa:P-21', 'stanza_alternativa:Sala 9'], perche: '' }, visite, ['Sala 3']);
  assert.deepEqual([...a.forzaAttesa], ['P-21']);
  assert.equal(a.riordini.length, 0);
  assert.equal(a.scartate.length, 4, 'congelato, medici diversi, congelato, stanza sconosciuta');
});
