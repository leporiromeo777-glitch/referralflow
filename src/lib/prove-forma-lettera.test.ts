// La forma della lettera vecchia: grassetto letto dall'immagine o dal Word,
// a capo dalla geometria, e come tutto questo arriva nella lettera nuova e
// nel Word (6.10.2026). Testi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  A_CAPO, applicaGrassetti, famigliaDi, grassettiDaHtml, modelloFamiglia, grassettiDelCorpo, leggiPagina, leggiPgm, leggiTsv, righePerIlTesto,
  riordinaGrassetti, stessoTesto, type Grassetto, type Pagina, type Parola,
} from './forma-lettera';
import { impagina, pulisciScansione, stampella } from './aggiorna-lettera';
import { generaDocxReferto } from './referto-docx';

// Una pagina finta: ogni lettera è un'asta verticale, spessa 3 pixel se
// normale e 5 se in grassetto. `righe`: parole con «*» davanti = grassetto.
function paginaFinta(righe: { y: number; parole: string[] }[]): { pg: Pagina; parole: Parola[] } {
  const larghezza = 1400, altezza = 700;
  const px = new Uint8Array(larghezza * altezza).fill(255);
  const parole: Parola[] = [];
  righe.forEach((riga, n) => {
    let x = 100;
    for (const grezza of riga.parole) {
      const forte = grezza.startsWith('*');
      const t = forte ? grezza.slice(1) : grezza;
      const w = t.length * 14;
      for (let i = 0; i < t.length; i++) {
        for (let yy = riga.y; yy < riga.y + 30; yy++) px.fill(0, yy * larghezza + x + i * 14, yy * larghezza + x + i * 14 + (forte ? 5 : 3));
      }
      parole.push({ t, x, y: riga.y, w, h: 30, riga: `1.1.${n + 1}` });
      x += w + 16;
    }
  });
  return { pg: { larghezza, altezza, px }, parole };
}

// Otto parole da dieci lettere riempiono la riga fino al margine.
const piena = (prima?: string) => [prima ?? 'pazientexx', ...Array(7).fill('controllox')];

test('pagina: grassetto dal tratto, righe vuote e a capo dalla geometria', () => {
  const { pg, parole } = paginaFinta([
    { y: 40, parole: piena() },
    { y: 80, parole: ['riferiscex', 'benessere.'] },                    // riga corta: sotto c'è un a capo voluto
    { y: 120, parole: ['*Diagnosi:', 'cardiopatia', 'ipertensiva'] },   // etichetta in testa alla riga
    { y: 200, parole: ['*Esame', '*clinico'] },                         // riga vuota sopra, titolo intero
    { y: 240, parole: piena() },
    { y: 280, parole: ['controllox', '*nessun', '*dolore', 'toracicoxx', 'riferitoxx', 'sottosforzoxx', 'intensoxxxxx', 'oggixxxxxxxxx'] },
    { y: 320, parole: ['*segue', 'controllox', 'normalexx'] },          // il testo scorre dalla riga sopra: non è un'etichetta
  ]);
  const { righe, misurate } = leggiPagina(pg, parole);
  assert.ok(misurate >= 20);
  assert.deepEqual(righe.map((r) => r.stacco), ['vuota', null, 'capo', 'vuota', 'capo', null, null]);
  const g = righe.flatMap((r) => r.grassetti);
  assert.deepEqual(g.map((x) => x.testo), ['Diagnosi:', 'Esame clinico', 'nessun dolore', 'segue']);
  assert.deepEqual(g[0], { testo: 'Diagnosi:', etichetta: true, stacco: 'capo' });
  assert.deepEqual(g[1], { testo: 'Esame clinico', etichetta: true, stacco: 'vuota' });
  assert.equal(g[2].etichetta, false);
  assert.equal(g[3].etichetta, false, 'in testa a una riga dove il testo scorre: non è un\'etichetta');
  const per = righePerIlTesto([righe]);
  assert.equal(per.filter((r) => r === A_CAPO).length, 2);
  assert.equal(per.filter((r) => r === '').length, 1);
});

test('pagina: senza grassetto non se ne inventa; una parola sola in mezzo vuole un tratto netto', () => {
  const liscia = paginaFinta([{ y: 40, parole: piena() }, { y: 80, parole: piena() }, { y: 120, parole: piena() }]);
  assert.equal(leggiPagina(liscia.pg, liscia.parole).righe.flatMap((r) => r.grassetti).length, 0);
  const pochi = paginaFinta([{ y: 40, parole: ['*Diagnosi:', 'cardiopatia'] }]);
  assert.equal(leggiPagina(pochi.pg, pochi.parole).righe.flatMap((r) => r.grassetti).length, 0, 'troppe poche parole per sapere qual è il tratto normale');
});

test('pgm e tsv', () => {
  const pg = leggiPgm(Buffer.concat([Buffer.from('P5\n# commento\n3 2\n255\n'), Buffer.from([0, 128, 255, 255, 128, 0])]));
  assert.deepEqual([pg.larghezza, pg.altezza, [...pg.px]], [3, 2, [0, 128, 255, 255, 128, 0]]);
  assert.throws(() => leggiPgm(Buffer.from('P6\n1 1\n255\n\0')));
  const tsv = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '4\t1\t1\t1\t1\t0\t10\t10\t200\t30\t-1\t', '5\t1\t1\t1\t1\t1\t10\t10\t90\t30\t96.1\tCaro', '5\t1\t1\t1\t1\t2\t110\t10\t90\t30\t12.0\tsporco', '5\t1\t1\t1\t2\t1\t10\t50\t90\t30\t91\tcollega,'].join('\n');
  assert.deepEqual(leggiTsv(tsv).map((p) => [p.t, p.riga]), [['Caro', '1.1.1'], ['collega,', '1.1.2']]);
});

test('Word: i pezzi in grassetto, etichette e titoli', () => {
  const g = grassettiDaHtml('<p>Caro collega,</p><p></p><p><strong>Diagnosi:</strong> cardiopatia &amp; ipertensione</p><p>Riferisce <strong>nessun dolore</strong> toracico.</p><p><strong>Esame clinico</strong></p><h2>Conclusione</h2>');
  assert.deepEqual(g, [
    { testo: 'Diagnosi:', etichetta: true, stacco: 'vuota' },
    { testo: 'nessun dolore', etichetta: false },
    { testo: 'Esame clinico', etichetta: true, stacco: 'capo' },
    { testo: 'Conclusione', etichetta: true, stacco: 'capo' },
  ]);
});

const G: Grassetto[] = riordinaGrassetti([
  { testo: 'Diagnosi:', etichetta: true, stacco: 'capo' },
  { testo: 'Fattori di rischio:', etichetta: true, stacco: 'capo' },
  { testo: 'rischio', etichetta: false },
  { testo: 'nessun dolore toracico', etichetta: false },
  { testo: 'Diagnosi:', etichetta: true, stacco: 'capo' },
]);

test('elenco: senza doppioni, le frasi lunghe prima', () => {
  assert.deepEqual(G.map((g) => g.testo), ['nessun dolore toracico', 'Fattori di rischio:', 'Diagnosi:', 'rischio']);
});

test('nella riga nuova: etichetta solo in testa, frase ovunque, maiuscole e accenti liberi', () => {
  const unisci = (r: string) => applicaGrassetti(r, G).map((p) => (p.b ? `[${p.t}]` : p.t)).join('');
  assert.equal(unisci('Diagnosi: cardiopatia ipertensiva.'), '[Diagnosi:] cardiopatia ipertensiva.');
  assert.equal(unisci('La diagnosi è nota. Diagnosi: stabile.'), 'La diagnosi è nota. [Diagnosi:] stabile.', 'in mezzo alla frase no, in testa a una frase sì');
  assert.equal(unisci('Fattori di rischio: ipertensione, a rischio elevato.'), '[Fattori di rischio:] ipertensione, a [rischio] elevato.');
  assert.equal(unisci('Riferisce NESSUN dolore toracico sotto sforzo.'), 'Riferisce [NESSUN dolore toracico] sotto sforzo.');
  assert.equal(unisci('Arischio e rischioso restano normali.'), 'Arischio e rischioso restano normali.', 'solo a parola intera');
  assert.deepEqual(applicaGrassetti('Niente da segnare.', G), [{ t: 'Niente da segnare.', b: false }]);
  assert.equal(applicaGrassetti('Già visto.', [{ testo: 'gia visto', etichetta: false }]).map((p) => (p.b ? `[${p.t}]` : p.t)).join(''), '[Già visto].');
});

test('solo il grassetto del corpo; stesso testo riletto', () => {
  const corpo = 'Caro collega, rivedo il paziente. Diagnosi: cardiopatia. ' + 'Sta bene e non riferisce disturbi. '.repeat(8) + 'Cordiali saluti. Dr. med. Mario Rossi';
  const g = grassettiDelCorpo([{ testo: 'Diagnosi:', etichetta: true }, { testo: 'Studio Cardiologico', etichetta: true }, { testo: 'Mario Rossi', etichetta: false }], corpo);
  assert.deepEqual(g.map((x) => x.testo), ['Diagnosi:'], 'né la carta intestata né la firma');
  const a = 'ipertensione arteriosa trattata con ramipril controllo ambulatoriale '.repeat(5);
  assert.ok(stessoTesto(a, a.replace('ramipril', 'ramipri1')) >= 0.85);
  assert.ok(stessoTesto(a, 'tutt altro testo con parole diverse dalla lettera '.repeat(5)) < 0.3);
});

test('lettera nuova: a capo davanti alle etichette della lettera vecchia', () => {
  const e: Grassetto[] = [{ testo: 'Diagnosi:', etichetta: true, stacco: 'capo' }, { testo: 'Procedere', etichetta: true, stacco: 'vuota' }, { testo: 'Il paziente', etichetta: true }];
  assert.equal(impagina('Rivedo il paziente. Diagnosi: cardiopatia. Il paziente sta bene. Procedere: controllo fra un anno.', new Set(), ' ', e),
    'Rivedo il paziente.\nDiagnosi: cardiopatia. Il paziente sta bene.\n\nProcedere: controllo fra un anno.');
  assert.equal(impagina('La diagnosi resta. Procederei così.', new Set(), ' ', e), 'La diagnosi resta. Procederei così.', 'solo se la frase COMINCIA con l\'etichetta intera');
  const s = stampella({ lettera: 'Caro collega,\n\nrivedo il paziente in controllo. Diagnosi: cardiopatia ipertensiva nota da anni.', dettato: 'Caro collega,\n\nrivedo il paziente. Diagnosi: cardiopatia ipertensiva. Clinicamente compensato.', grassetti: e });
  assert.ok(s.testo.includes('rivedo il paziente.\nDiagnosi: cardiopatia ipertensiva.'), s.testo);
  assert.equal(s.impaginata, true);
});

test('scansione riletta: l\'a capo voluto resta un a capo, la riga vuota un paragrafo', () => {
  const t = pulisciScansione(['Caro collega,', '', 'rivedo il paziente', 'in controllo.', A_CAPO, 'Diagnosi: cardiopatia.', '', 'Clinicamente compensato.'].join('\n'));
  assert.equal(t, 'Caro collega,\n\nrivedo il paziente in controllo.\nDiagnosi: cardiopatia.\n\nClinicamente compensato.');
});

test('Word: le frasi in grassetto escono in grassetto, il testo resta intero', async () => {
  const base = { medico: 'Dr. med. Prova', intestazione: '', telefono: '', destinatario: 'Dr. med. Bianchi', via: '', data: '06.10.2026', titolo: 'RAPPORTO', paziente: 'Verdi Anna', piede: '', copia: '' };
  const testo = 'Caro collega,\n\nrivedo la paziente.\nDiagnosi: cardiopatia <lieve> & stabile.\nRiferisce nessun dolore toracico.';
  const xmlDi = async (grassetti?: Grassetto[]) => (await JSZip.loadAsync(await generaDocxReferto({ ...base, testo, grassetti }))).files['word/document.xml'].async('string');
  const senza = await xmlDi();
  const con = await xmlDi(G);
  const testoDi = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
  assert.equal(testoDi(con), testoDi(senza), 'stesso testo, con o senza grassetto');
  const run = (xml: string) => [...xml.matchAll(/<w:r[\s>](?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g)].map((m) => m[0]);
  const forti = run(con).filter((r) => /<w:b\/>/.test(r)).map((r) => /<w:t[^>]*>([^<]*)</.exec(r)?.[1]);
  assert.ok(forti.includes('Diagnosi:') && forti.includes('nessun dolore toracico'), JSON.stringify(forti));
  assert.ok(!run(senza).some((r) => /<w:b\/>/.test(r) && /Diagnosi/.test(r)), 'senza elenco niente grassetto nel testo');
  assert.ok(con.includes(' cardiopatia &lt;lieve&gt; &amp; stabile.'), 'i caratteri speciali restano protetti');
  assert.ok(/<w:rPr><w:rFonts[^>]*\/><w:b\/><w:bCs\/>/.test(con), 'il grassetto sta dopo il font, come vuole lo schema');
});

test('revisione: la pagina dipinge il grassetto con la stessa regola del server', () => {
  const src = readFileSync('public/prototipo/bridge/04-referti-revisione.js', 'utf8');
  const da = src.indexOf('function rfGrassettoTrova'), a = src.indexOf('// Nel testo della revisione il grassetto si DIPINGE');
  assert.ok(da > 0 && a > da);
  const trova = vm.runInNewContext(`(${src.slice(da, a).trim()})`) as (t: string, g: Grassetto[]) => [number, number][];
  const cat = (testo: string) => ({ testo, etichetta: true, stacco: 'capo' as const, modello: modelloFamiglia(famigliaDi(testo)) ?? undefined });
  const g: (Grassetto & { modello?: string })[] = [...G, { testo: 'già visto (2024)', etichetta: false }, cat('Fattori di rischio cardiovascolari:'), cat('Comorbidità'), cat('Terapia attuale:')];
  for (const t of ['FRCV: ipertensione. Comorbilità: nessuna. Sulle comorbidità: niente.\n– Terapia in atto: ramipril. Allergie: nessuna.','Diagnosi: cardiopatia. La diagnosi è nota. Diagnosi: stabile.', 'Riga uno.\nFattori di rischio: ipertensione, a rischio elevato.\n• Diagnosi: x', 'Riferisce NESSUN dolore toracico; gia visto (2024) e arischio.']) {
    const server = t.split('\n').flatMap((r) => applicaGrassetti(r, g).filter((p) => p.b).map((p) => p.t)).sort();
    const pagina = trova(t, g).map(([x, y]) => t.slice(x, y)).sort();
    assert.ok(server.length > 0);
    assert.equal(JSON.stringify(pagina), JSON.stringify(server));
  }
});

test('categorie: la stessa categoria scritta in un altro modo va in grassetto e a capo', () => {
  assert.equal(famigliaDi('FRCV:'), 'frcv');
  assert.equal(famigliaDi('Fattori di rischio cardiovascolari'), 'frcv');
  assert.equal(famigliaDi('Fattori di rischio cardio-vascolare:'), 'frcv');
  assert.equal(famigliaDi('Comorbilità:'), 'comorbidita');
  assert.equal(famigliaDi('Terapia in atto'), 'terapia');
  assert.equal(famigliaDi('Elettrocardiogramma:'), 'ecg');
  for (const no of ['Il paziente', 'ipertensione arteriosa', 'Diagnosi di cardiopatia ischemica cronica stabile', '']) assert.equal(famigliaDi(no), null, no);
  const vecchie: Grassetto[] = [
    { testo: 'Fattori di rischio cardiovascolari:', etichetta: true, stacco: 'capo' },
    { testo: 'Comorbidità', etichetta: true, stacco: 'vuota' },      // in grassetto senza i due punti
    { testo: 'ipertensione', etichetta: false },                      // una frase qualunque: non è una categoria
  ];
  const unisci = (r: string) => applicaGrassetti(r, vecchie).map((p) => (p.b ? `[${p.t}]` : p.t)).join('');
  assert.equal(unisci('FRCV: ipertensione arteriosa, dislipidemia.'), '[FRCV:] [ipertensione] arteriosa, dislipidemia.');
  assert.equal(unisci('Rivedo il paziente. Comorbilità: ipotiroidismo.'), 'Rivedo il paziente. [Comorbilità]: ipotiroidismo.', 'i due punti in grassetto solo se lo erano nella lettera');
  assert.equal(unisci('Sui fattori di rischio cardiovascolari: nulla di nuovo.'), 'Sui fattori di rischio cardiovascolari: nulla di nuovo.', 'solo se l\'etichetta è tutta la testa della frase');
  assert.equal(unisci('Terapia: ramipril.'), 'Terapia: ramipril.', 'una categoria che le lettere del paziente non hanno in grassetto resta normale');
  assert.equal(impagina('Rivedo il paziente. FRCV: ipertensione. Comorbilità: ipotiroidismo. Terapia: ramipril.', new Set(), ' ', vecchie),
    'Rivedo il paziente.\nFRCV: ipertensione.\n\nComorbilità: ipotiroidismo. Terapia: ramipril.');
});
