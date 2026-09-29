// CalDAV di MediOnline (23.9.2026): regole pure e client contro un finto
// server locale. Niente rete verso la Cassa, niente DB, niente dati veri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  abbinaCalendario, componiEvento, confrontaGiorni, hrefEvento, istanteZurigo, leggiCalendari, leggiDatiCalendario,
  nomeCalendarioPulito, nuovoUid, piega, sovrapposti, titoloPaziente, uidNostro, validaScrittura,
} from './caldav-regole';
import { parseICal } from './ical';

const MEDICI = [
  'Andrea Ferri', 'Daniela Conti', 'Dr. Davide Galli', 'Dr. med. Bruno Carli', 'Dr. med. François Diederik Renaud',
  'Dr. med. Marco Marchi', 'Dr.ssa med. Vera Lucia Pagani', 'Prof. Dr. med. Tiziano Marchi', 'Vanja Pellegrini',
].map((nome, i) => ({ id: `m${i}`, nome }));

test('calendario → medico: titoli tolti, ordine libero, niente indovinelli', () => {
  const di = (n: string) => MEDICI.find((m) => m.id === abbinaCalendario(n, MEDICI))?.nome ?? null;
  assert.equal(di('Dr. med. Marco Marchi'), 'Dr. med. Marco Marchi');
  assert.equal(di('Prof. Dr. med. Tiziano Marchi'), 'Prof. Dr. med. Tiziano Marchi');
  assert.equal(di('Dr. med. Davide Galli'), 'Dr. Davide Galli');
  assert.equal(di('Dr.ssa med. Vera Lucia Pagani'), 'Dr.ssa med. Vera Lucia Pagani');
  assert.equal(di('Dietista Pellegrini Vanja'), 'Vanja Pellegrini');
  assert.equal(di('Dr. med. Francois Diederik Renaud'), 'Dr. med. François Diederik Renaud');
  assert.equal(di('Privato MM'), null);
  assert.equal(di('Dr. med. Marchi'), null, 'un nome a metà non basta');
  const doppi = [...MEDICI, { id: 'x', nome: 'Marco Marchi' }];
  assert.equal(abbinaCalendario('Dr. med. Marco Marchi', doppi), null, 'due omonimi: nessuno');
  assert.equal(nomeCalendarioPulito('  Prof.  Dr. med.  Tiziano   Marchi '), 'tiziano marchi');
});

test('evento: CRLF, UTC, testo protetto, righe piegate a 75 byte', () => {
  const uid = nuovoUid('0f8b9c2e-1111-4222-8333-444455556666');
  const ics = componiEvento({
    uid, inizio: new Date('2026-10-01T06:30:00Z'), fine: new Date('2026-10-01T07:00:00Z'),
    titolo: 'Rossi; Mario, controllo\\annuale', note: 'riga uno\nriga due ' + 'è'.repeat(60), adesso: new Date('2026-09-23T10:00:00Z'),
  });
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'solo CRLF');
  assert.match(ics, /\r\nDTSTART:20261001T063000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261001T070000Z\r\n/);
  assert.match(ics, /SUMMARY:Rossi\\; Mario\\, controllo\\\\annuale/);
  for (const riga of ics.split('\r\n')) assert.ok(Buffer.byteLength(riga, 'utf8') <= 75, `riga troppo lunga: ${riga.length}`);
  // e il nostro parser la rilegge uguale
  const [ev] = parseICal(ics);
  assert.equal(ev.uid, uid);
  assert.equal(ev.summary, 'Rossi; Mario, controllo\\annuale');
  assert.equal(ev.description, 'riga uno\nriga due ' + 'è'.repeat(60));
  assert.equal(ev.start.toISOString(), '2026-10-01T06:30:00.000Z');
  assert.equal(piega('a'.repeat(160)).split('\r\n ').join(''), 'a'.repeat(160));
});

test('ora svizzera: estate, inverno, ora che non esiste', () => {
  assert.equal(istanteZurigo('2026-09-24', '08:30')?.toISOString(), '2026-09-24T06:30:00.000Z');
  assert.equal(istanteZurigo('2026-12-01', '08:30')?.toISOString(), '2026-12-01T07:30:00.000Z');
  assert.equal(istanteZurigo('2027-03-28', '02:30'), null, 'salto di marzo');
  assert.equal(istanteZurigo('2026-10-25', '01:30')?.toISOString(), '2026-10-24T23:30:00.000Z');
  assert.equal(istanteZurigo('2026-13-01', '08:00'), null);
  assert.equal(istanteZurigo('2026-09-24', '8:30'), null);
});

test('controlli prima di scrivere', () => {
  const adesso = new Date('2026-09-23T10:00:00Z');
  const base = { data: '2026-09-24', ora: '09:00', durata: 30, titolo: 'Rossi Mario (01.02.1950)' };
  const ok = validaScrittura(base, adesso);
  assert.ok(ok.ok && ok.s.fine.getTime() - ok.s.inizio.getTime() === 30 * 60_000);
  const no = (c: Partial<typeof base>, frase: RegExp) => {
    const r = validaScrittura({ ...base, ...c }, adesso);
    assert.ok(!r.ok && frase.test(r.errore), JSON.stringify(c));
  };
  no({ data: '2026-09-22' }, /passato/);
  no({ data: '2029-01-01' }, /due anni/);
  no({ ora: '05:30' }, /6:00/);
  no({ ora: '21:45', durata: 30 }, /22:00/);
  no({ durata: 2 }, /durata/);
  no({ durata: 600 }, /durata/);
  no({ titolo: 'x' }, /titolo/);
  no({ titolo: 'x'.repeat(121) }, /titolo/);
  no({ ora: '25:00' }, /non valide/);
});

test('sovrapposizioni, UID nostri, indirizzi, titolo come in MediOnline', () => {
  const t = (s: string) => new Date(s);
  const ev = [{ start: t('2026-09-24T07:00:00Z'), end: t('2026-09-24T07:30:00Z') }, { start: t('2026-09-24T08:00:00Z'), end: null }];
  assert.equal(sovrapposti(ev, t('2026-09-24T07:30:00Z'), t('2026-09-24T08:00:00Z')), 0, 'estremi che si toccano non si accavallano');
  assert.equal(sovrapposti(ev, t('2026-09-24T07:15:00Z'), t('2026-09-24T07:45:00Z')), 1);
  assert.equal(sovrapposti(ev, t('2026-09-24T06:00:00Z'), t('2026-09-24T09:00:00Z')), 2);
  const uid = nuovoUid('0f8b9c2e-1111-4222-8333-444455556666');
  assert.ok(uidNostro(uid));
  for (const altro of ['9a7f3c1e-1234-4bcd-9ef0-123456789abc', 'referralflow-x@altro.ch', 'referralflow-../../x@referralflow.ch', '']) assert.ok(!uidNostro(altro), altro);
  assert.equal(hrefEvento('/caldav/calendars/abc/', uid), `/caldav/calendars/abc/${uid}.ics`);
  assert.equal(hrefEvento('/caldav/calendars/abc', 'a b@x'), '/caldav/calendars/abc/a%20b@x.ics');
  assert.equal(titoloPaziente({ cognome: 'Rossi', nome: 'Mario', data_nascita: '1950-02-01' }), 'Rossi Mario (01.02.1950)');
  assert.equal(titoloPaziente({ cognome: 'Rossi', nome: 'Mario', data_nascita: null }), 'Rossi Mario');
});

test('risposte XML: calendari coi permessi, dati del calendario con le entità', () => {
  const xml = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:response><D:href>/caldav/calendars/</D:href><D:propstat><D:prop><D:displayname>calendars</D:displayname><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
    <D:response><D:href>/caldav/calendars/aaa/</D:href><D:propstat><D:prop><D:displayname>Dr. med. Uno &amp; Due</D:displayname><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:current-user-privilege-set><D:privilege><D:read/></D:privilege><D:privilege><D:write/></D:privilege></D:current-user-privilege-set></D:prop></D:propstat></D:response>
    <D:response><D:href>/caldav/calendars/bbb/</D:href><D:propstat><D:prop><D:displayname>Sola lettura</D:displayname><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:current-user-privilege-set><D:privilege><D:read/></D:privilege></D:current-user-privilege-set></D:prop></D:propstat></D:response>
  </D:multistatus>`;
  const c = leggiCalendari(xml);
  assert.deepEqual(c.map((x) => [x.href, x.nome, x.calendario, x.scrivibile]), [
    ['/caldav/calendars/', 'calendars', false, false],
    ['/caldav/calendars/aaa/', 'Dr. med. Uno & Due', true, true],
    ['/caldav/calendars/bbb/', 'Sola lettura', true, false],
  ]);
  const dati = `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/caldav/calendars/aaa/x.ics</d:href><d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
UID:x&#13;
DTSTART;TZID=W. Europe Standard Time:20260924T090000&#13;
SUMMARY:Prova &lt;finta&gt;&#13;
END:VEVENT&#13;
END:VCALENDAR</cal:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;
  const [r] = leggiDatiCalendario(dati);
  assert.equal(r.href, '/caldav/calendars/aaa/x.ics');
  const [ev] = parseICal(r.ics);
  assert.equal(ev.summary, 'Prova <finta>');
  assert.equal(ev.start.toISOString(), '2026-09-24T07:00:00.000Z', 'un TZID sconosciuto vale come ora dello studio, senza eccezioni');
});

test('controllo incrociato: escono solo i giorni diversi, giorno svizzero', () => {
  const d = (s: string) => new Date(s);
  const caldav = [d('2026-09-21T07:00:00Z'), d('2026-09-21T08:00:00Z'), d('2026-09-22T22:30:00Z')];
  const robot = [d('2026-09-21T07:00:00Z'), d('2026-09-21T08:00:00Z')];
  assert.deepEqual(confrontaGiorni(caldav, robot), [{ giorno: '2026-09-23', caldav: 1, robot: 0 }], '22:30Z del 22 è il 23 in Svizzera');
});

// ---------- client contro un finto server CalDAV ----------

type Finto = { url: string; chiudi: () => Promise<void>; eventi: Map<string, string>; richieste: string[] };

async function fintoServer(): Promise<Finto> {
  const eventi = new Map<string, string>();
  const richieste: string[] = [];
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      richieste.push(`${req.method} ${req.url}`);
      const atteso = `Basic ${Buffer.from('utente-prova:segreto-prova').toString('base64')}`;
      if (req.headers.authorization !== atteso) { res.writeHead(401); return res.end(); }
      if (req.method === 'PROPFIND' && req.url === '/caldav/calendars/') {
        res.writeHead(207, { 'Content-Type': 'application/xml' });
        return res.end(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:response><d:href>/caldav/calendars/</d:href><d:propstat><d:prop><d:displayname>calendars</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
          <d:response><d:href>/caldav/calendars/cal1/</d:href><d:propstat><d:prop><d:displayname>Dr. med. Finto Medico</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set></d:prop></d:propstat></d:response>
        </d:multistatus>`);
      }
      const m = /^\/caldav\/calendars\/cal1\/(.+)$/.exec(req.url || '');
      if (req.method === 'REPORT' && req.url === '/caldav/calendars/cal1/') {
        const risp = [...eventi.entries()].map(([k, v]) => `<d:response><d:href>/caldav/calendars/cal1/${k}</d:href><d:propstat><d:prop><c:calendar-data>${v.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</c:calendar-data></d:prop></d:propstat></d:response>`).join('');
        res.writeHead(207); return res.end(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${risp}</d:multistatus>`);
      }
      if (req.method === 'PUT' && m) {
        // Come MediOnline: salva sotto «<UID>.ics», qualunque sia il nome mandato.
        const uid = /^UID:(.*)$/m.exec(corpo.replace(/\r/g, ''))?.[1] ?? '';
        const chiave = `${uid}.ics`;
        if (req.headers['if-none-match'] === '*' && eventi.has(chiave)) { res.writeHead(412); return res.end(); }
        eventi.set(chiave, corpo); res.writeHead(201); return res.end();
      }
      if (req.method === 'DELETE' && m) {
        const chiave = decodeURIComponent(m[1]);
        if (!eventi.has(chiave)) { res.writeHead(404); return res.end(); }
        eventi.delete(chiave); res.writeHead(204); return res.end();
      }
      res.writeHead(405); res.end();
    });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const porta = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${porta}/caldav/calendars/`, eventi, richieste, chiudi: () => new Promise((ok) => srv.close(() => ok())) };
}

test('client: elenca, legge, scrive senza sovrascrivere, cancella, resta sul suo server', async () => {
  const finto = await fintoServer();
  const dir = mkdtempSync(path.join(tmpdir(), 'caldav-prova-'));
  const confFile = path.join(dir, 'conf');
  writeFileSync(confFile, `CALDAV_UTENTE=utente-prova\nCALDAV_PASSWORD=segreto-prova\nCALDAV_BASE=${finto.url}\n`, { mode: 0o600 });
  process.env.CALDAV_CONF = confFile;
  try {
    const { confCaldav, elencaCalendari, eventiIntervallo, creaEvento, cancellaEvento, dav } = await import('./caldav-client');
    const conf = await confCaldav();
    assert.ok(conf);
    const cal = await elencaCalendari(conf!);
    assert.deepEqual(cal.map((c) => [c.href, c.nome, c.scrivibile]), [['/caldav/calendars/cal1/', 'Dr. med. Finto Medico', true]]);

    const uid = nuovoUid('0f8b9c2e-1111-4222-8333-444455556666');
    const ics = componiEvento({ uid, inizio: new Date('2026-10-01T06:30:00Z'), fine: new Date('2026-10-01T07:00:00Z'), titolo: 'Finto Paziente', adesso: new Date() });
    assert.equal(await creaEvento(conf!, '/caldav/calendars/cal1/', uid, ics), 201);
    assert.equal(await creaEvento(conf!, '/caldav/calendars/cal1/', uid, ics), 412, 'mai sovrascrivere');
    const ev = await eventiIntervallo(conf!, '/caldav/calendars/cal1/', new Date('2026-10-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'));
    assert.equal(ev.length, 1);
    assert.equal(ev[0].uid, uid);
    assert.equal(ev[0].summary, 'Finto Paziente');
    assert.equal(await cancellaEvento(conf!, '/caldav/calendars/cal1/', uid), 204);
    assert.equal(await cancellaEvento(conf!, '/caldav/calendars/cal1/', uid), 404);
    assert.equal(finto.eventi.size, 0);

    await assert.rejects(() => dav(conf!, 'GET', 'https://esempio.invalid/rubato'), /fuori dal server/);
    assert.ok(!finto.richieste.some((r) => r.includes('rubato')));

    writeFileSync(confFile, `CALDAV_UTENTE=utente-prova\nCALDAV_PASSWORD=sbagliata\nCALDAV_BASE=${finto.url}\n`);
    await assert.rejects(async () => elencaCalendari((await confCaldav())!), /rifiuta le credenziali/);

    writeFileSync(confFile, 'CALDAV_UTENTE=x\nCALDAV_PASSWORD=y\nCALDAV_BASE=http://esempio.ch/caldav/\n');
    assert.equal(await confCaldav(), null, 'in chiaro solo verso questo computer');
  } finally {
    delete process.env.CALDAV_CONF;
    await finto.chiudi();
  }
});

test('scrittura in MediOnline: spenta se non la si accende a mano, limitabile a dei calendari', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'caldav-scrittura-'));
  const f = path.join(dir, 'c.conf');
  process.env.CALDAV_CONF = f;
  try {
    const { confCaldav } = await import('./caldav-client');
    writeFileSync(f, 'CALDAV_UTENTE=u\nCALDAV_PASSWORD=p\n');
    assert.equal((await confCaldav())!.scrittura, 'spenta', 'di serie spenta');
    writeFileSync(f, 'CALDAV_UTENTE=u\nCALDAV_PASSWORD=p\nCALDAV_SCRITTURA=si\n');
    assert.equal((await confCaldav())!.scrittura, 'spenta', 'solo «attiva» la accende');
    writeFileSync(f, 'CALDAV_UTENTE=u\nCALDAV_PASSWORD=p\nCALDAV_SCRITTURA=attiva\nCALDAV_SOLO_CALENDARI=Agenda di prova, Seconda\n');
    const c = (await confCaldav())!;
    assert.equal(c.scrittura, 'attiva');
    assert.deepEqual(c.soloCalendari, ['Agenda di prova', 'Seconda']);
  } finally {
    delete process.env.CALDAV_CONF;
  }
});
