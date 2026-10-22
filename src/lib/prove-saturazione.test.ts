// Saturazione notturna (22.10.2026): i controlli su ciò che arriva dal generatore, i totali di tutte le notti, i livelli.
// Tutte le notti sono inventate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impronta, livelloOdi, nomeReferto, notteValida, ora, unisci, validaInvio, type Notte } from './saturazione/regole';

const T0 = Date.UTC(2026, 9, 18, 23, 12);
function notte(inizio: number, ore: number, extra: Partial<Notte> = {}): Notte {
  const min = ore * 60, nV = Math.round(min * 15);
  return {
    inizio, fine: inizio + min * 60000, durata: min, valide: min, passo: 4,
    spo2: { media: 95.5, min: 85, max: 98 }, fc: { media: 66, min: 55, max: 84 },
    t90: 3, cad3: 30, cad4: 20, odi3: 30 / ore, odi4: 20 / ore,
    hist: { 95: nV - 100, 89: 100 }, nValide: nV,
    serie: Array.from({ length: Math.round(min * 2) }, (_, k) => ({ m: k / 2, s: 95, f: 66 })), eventi4: [12.5, 40],
    ...extra,
  };
}

test('saturazione: una notte del generatore si accetta, una fuori scala no, col perché', () => {
  assert.equal(typeof notteValida(notte(T0, 7)), 'object');
  assert.match(String(notteValida({ ...notte(T0, 7), fine: T0 - 1 })), /inizio e fine/);
  assert.match(String(notteValida({ ...notte(T0, 7), spo2: { media: 140, min: 85, max: 98 } })), /saturazione/);
  assert.match(String(notteValida({ ...notte(T0, 7), cad4: 50, cad3: 30 })), /valori/);
  assert.match(String(notteValida({ ...notte(T0, 7), hist: { 30: 4 } })), /istogramma/);
  assert.match(String(notteValida({ ...notte(T0, 7), serie: Array(3000).fill({ m: 1, s: 95, f: 60 }) })), /curva/);
  assert.match(String(notteValida({ ...notte(T0, 7), fc: { media: 900, min: 55, max: 84 } })), /frequenza/);
});

test('saturazione: i totali di tutte le notti come nel generatore (pesati sulle misure valide), la stessa notte una volta', () => {
  const a = notte(T0, 8, { spo2: { media: 96, min: 88, max: 99 } }), b = notte(T0 + 86400000, 6, { spo2: { media: 94, min: 82, max: 97 }, t90: 9 });
  const u = unisci([b, a, { ...a }]);
  assert.equal(u.notti.length, 2);
  assert.equal(u.notti[0].inizio, T0);
  const t = u.totale;
  assert.equal(t.notti, 2); assert.equal(t.min, 82); assert.equal(t.max, 99); assert.equal(t.t90, 12); assert.equal(t.cad4, 40);
  assert.equal(Math.round(t.media! * 100) / 100, Math.round(((96 * a.nValide + 94 * b.nValide) / (a.nValide + b.nValide)) * 100) / 100);
  assert.equal(Math.round(t.odi4 * 100) / 100, Math.round((40 / 14) * 100) / 100);
  assert.equal(t.hist['89'], 200);
  assert.equal(Math.round(t.t90pct! * 1000) / 1000, Math.round((12 / (14 * 60)) * 100 * 1000) / 1000);
});

test('saturazione: livelli dell’ODI 4% come il rapporto (<5 norma, 5–15 lieve, 15–30 moderato, >30 marcato)', () => {
  assert.deepEqual([livelloOdi(4.9), livelloOdi(5), livelloOdi(14.9), livelloOdi(15), livelloOdi(29.9), livelloOdi(30), livelloOdi(null)], ['norma', 'lieve', 'lieve', 'moderato', 'moderato', 'marcato', null]);
});

test('saturazione: l’invio — paziente con nascita (anche gg.mm.aaaa), notti, referto PDF o Word; impronta e ora', () => {
  const pdf = Buffer.from('%PDF-1.7 rapporto di prova').toString('base64');
  const v = validaInvio({ paziente: { cognome: 'Provasonno', nome: 'Lia', data_nascita: '04.03.1950' }, notti: [notte(T0, 7)], referto: { nome_file: 'Rapporto/del sonno.pdf', pdf_base64: pdf }, valutazione: '  da rivedere  ' });
  assert.ok(!('errore' in v));
  if ('errore' in v) return;
  assert.equal(v.chi.nascita, '1950-03-04'); assert.equal(v.referto?.tipo, 'pdf'); assert.equal(v.referto?.nome, 'Rapporto del sonno.pdf'); assert.equal(v.valutazione, 'da rivedere'); assert.equal(v.apparecchio, 'O2Ring');
  assert.equal(impronta(v.chi, v.notti), `lia provasonno|1950-03-04|${Math.round(T0 / 60000)}`);
  assert.equal(impronta({ cognome: 'LIA', nome: 'Provasonno', nascita: '1950-03-04' }, v.notti), impronta(v.chi, v.notti));
  assert.equal(ora(T0), '2026-10-18T23:12');
  assert.match(String((validaInvio({ paziente: { cognome: 'A', nome: 'B' }, notti: [notte(T0, 7)] }) as any).errore), /data di nascita/);
  assert.match(String((validaInvio({ paziente: { cognome: 'A', nome: 'B', data_nascita: '1950-03-04' }, notti: [] }) as any).errore), /almeno una notte/);
  assert.match(String((validaInvio({ paziente: { cognome: 'A', nome: 'B', data_nascita: '1950-03-04' }, notti: Array(15).fill(notte(T0, 7)) }) as any).errore), /Troppe notti/);
  assert.match(String((validaInvio({ paziente: { cognome: 'A', nome: 'B', data_nascita: '1950-03-04' }, notti: [notte(T0, 7)], referto: { pdf_base64: Buffer.from('PK..').toString('base64') } }) as any).errore), /non è un PDF/);
  assert.match(String((validaInvio({ paziente: { cognome: 'A', nome: 'B', data_nascita: '1950-03-04' }, notti: [{ ...notte(T0, 7), durata: -1 }] }) as any).errore), /Notte 1: durata/);
  assert.equal(nomeReferto('', 'docx'), 'Rapporto del sonno.docx');
});
