// Pressione: l'invio dal generatore dei referti Aktiia (20.10.2026) — la parte
// pura: il corpo che arriva diventa il testo che `leggiFile` legge già, e
// ciò che non va si rifiuta con una frase. Tutti i dati sono inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASSIMO_MISURE, nomeReferto, validaInvio } from './pressione/invio-regole';
import { leggiFile } from './pressione/calcolo';

const due = (n: number) => String(n).padStart(2, '0');
function misure(n: number, giorno = 15) {
  return Array.from({ length: n }, (_, k) => {
    const min = 8 * 60 + k * 40, g = giorno + Math.floor(min / 1440), m = min % 1440;
    return { quando: `2026-10-${due(g)}T${due(Math.floor(m / 60))}:${due(m % 60)}`, sis: 130 + (k % 7), dia: 80 + (k % 5), fc: k % 9 ? 64 : null };
  });
}
const DOCX_FINTO = Buffer.from('PK\u0003\u0004 finto docx').toString('base64');
const base = () => ({ paziente: { cognome: 'Provainvio', nome: 'Lia', data_nascita: '1950-03-04' }, misure: misure(40), sveglia: '06:30', sonno: '23:00', referto: { nome_file: 'Referto pressione Provainvio Lia 15-10-2026.docx', docx_base64: DOCX_FINTO } });

test('invio Aktiia: il corpo diventa il testo che il lettore della pagina sa già leggere', () => {
  const v = validaInvio(base());
  assert.ok(!('errore' in v));
  if ('errore' in v) return;
  assert.equal(v.chi.nome, 'Provainvio Lia');
  assert.equal(v.chi.nascita, '1950-03-04');
  assert.equal(v.sveglia, '06:30');
  assert.equal(v.apparecchio, 'Aktiia');
  assert.ok(v.referto && v.referto.dati[0] === 0x50 && v.referto.nome.endsWith('.docx'));
  const l = leggiFile(v.testo);
  assert.equal(l.errore, undefined);
  assert.equal(l.misure.length, 40);
  assert.equal(l.scartate, 0);
  assert.equal(l.misure[0].quando, '2026-10-15T08:00');
  assert.equal(l.misure[1].fc, 64);
  assert.equal(l.misure[0].fc, null);               // una frequenza mancante resta vuota, la misura vale
});

test('invio Aktiia: senza nome, data di nascita o misure non si accetta', () => {
  const senza = (f: (c: any) => void) => { const c: any = base(); f(c); return validaInvio(c); };
  assert.match((senza((c) => { c.paziente.cognome = ''; }) as any).errore, /cognome e nome/);
  assert.match((senza((c) => { c.paziente.data_nascita = '31.02.1950'; }) as any).errore, /data di nascita/);
  assert.match((senza((c) => { c.misure = misure(5); }) as any).errore, /almeno 10/);
  assert.match((senza((c) => { c.misure = misure(MASSIMO_MISURE + 1); }) as any).errore, /Troppe misure/);
  assert.match((senza((c) => { c.misure[3].quando = '2026-10-15 08:00'; }) as any).errore, /data e ora/);
  assert.match((senza((c) => { c.misure[3].sis = '120/80'; }) as any).errore, /non numerici/);
  assert.match((senza((c) => { c.sonno = c.sveglia; }) as any).errore, /sveglia e sonno/);
});

test('invio Aktiia: il referto deve essere un docx, e il nome del file resta pulito', () => {
  const c: any = base(); c.referto.docx_base64 = Buffer.from('%PDF-1.7').toString('base64');
  assert.match((validaInvio(c) as any).errore, /non è un file Word/);
  c.referto.docx_base64 = 'non base64 !!';
  assert.match((validaInvio(c) as any).errore, /non è valido/);
  const senzaReferto: any = base(); delete senzaReferto.referto;
  const v = validaInvio(senzaReferto);
  assert.ok(!('errore' in v) && v.referto === null);
  assert.equal(nomeReferto('../../etc/passwd'), 'etc passwd.docx');
  assert.equal(nomeReferto(''), 'Referto pressione.docx');
});
