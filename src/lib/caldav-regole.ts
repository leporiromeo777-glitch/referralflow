// CalDAV di MediOnline: regole pure (23.9.2026). Niente rete, niente DB,
// niente sessione: si provano in src/lib/prove-caldav.test.ts.
//
// Che cosa sappiamo del server (misurato, vedi [[Piattaforma/Cassa dei Medici
// documenti e interfacce]]):
// - un calendario per agenda, con displayname «Dr. med. Nome Cognome»;
// - gli eventi portano solo DTSTART/DTEND/SUMMARY/DESCRIPTION/LOCATION/UID:
//   niente colore, niente stato di fatturazione, niente id di MediOnline;
// - il server salva un evento sotto «<UID>.ics», qualunque nome di file abbia
//   mandato il client;
// - le scritture sono permesse (read, write) e funzionano: PUT → 201.

export type CalendarioDav = { href: string; nome: string; scrivibile: boolean; calendario: boolean };

// Titoli che precedono il nome nel displayname dei calendari.
const TITOLI = /\b(prof|dr|dott|dottssa|drssa|dssa|med|pd|dietista|fisioterapista|ecografista|sig|sigra)\b\.?/gi;

export function nomeCalendarioPulito(nome: string): string {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bdr\.ssa\b/gi, ' ')
    .replace(TITOLI, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Abbinamento severo calendario → medico: le parole del nome del medico devono
// essere esattamente quelle del calendario, senza titoli e in qualunque
// ordine. «Privato MM» non è nessuno; due medici con lo stesso nome non si
// indovinano. Chi non si abbina resta da abbinare a mano.
export function abbinaCalendario(nome: string, medici: { id: string; nome: string }[]): string | null {
  const parole = (s: string) => nomeCalendarioPulito(s).split(' ').filter(Boolean).sort().join(' ');
  const cal = parole(nome);
  if (!cal) return null;
  const trovati = medici.filter((m) => parole(m.nome) === cal);
  return trovati.length === 1 ? trovati[0].id : null;
}

// ---------- XML delle risposte (WebDAV multistatus) ----------

function decodifica(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#13;/g, '\r').replace(/&#10;/g, '\n')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function risposte(xml: string): string[] {
  return [...String(xml || '').matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/g)].map((m) => m[1]);
}

function tag(corpo: string, nome: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`).exec(corpo);
  return m ? m[1] : null;
}

export function leggiCalendari(xml: string): CalendarioDav[] {
  return risposte(xml).map((r) => {
    const priv = [...r.matchAll(/<(?:[\w-]+:)?privilege>\s*<(?:[\w-]+:)?([a-z-]+)/g)].map((m) => m[1]);
    return {
      href: decodifica((tag(r, 'href') || '').trim()),
      nome: decodifica((tag(r, 'displayname') || '').trim()),
      calendario: /<(?:[\w-]+:)?calendar\s*\/>|<(?:[\w-]+:)?calendar>/.test(tag(r, 'resourcetype') || ''),
      scrivibile: priv.some((p) => p === 'write' || p === 'write-content' || p === 'all' || p === 'bind'),
    };
  });
}

// Le risorse di un REPORT calendar-query: indirizzo e testo iCalendar.
export function leggiDatiCalendario(xml: string): { href: string; ics: string }[] {
  return risposte(xml)
    .map((r) => ({ href: decodifica((tag(r, 'href') || '').trim()), ics: decodifica(tag(r, 'calendar-data') || '') }))
    .filter((x) => x.ics.includes('BEGIN:VEVENT'));
}

export const XML_CALENDARI = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:current-user-privilege-set/></d:prop></d:propfind>';

export function xmlIntervallo(da: Date, a: Date): string {
  return '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
    + '<d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'
    + `<c:time-range start="${utc(da)}" end="${utc(a)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

// ---------- evento da scrivere ----------

export function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function testoIcs(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 §3.1: righe di al più 75 ottetti, continuazione con uno spazio.
// Si taglia sui caratteri, contando i byte UTF-8, per non spezzare una lettera.
export function piega(riga: string): string {
  const out: string[] = [];
  let cur = '', byte = 0;
  for (const ch of riga) {
    const n = Buffer.byteLength(ch, 'utf8');
    const lim = out.length === 0 ? 75 : 74;
    if (byte + n > lim) { out.push(cur); cur = ''; byte = 0; }
    cur += ch; byte += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export const PREFISSO_UID = 'referralflow-';
export const DOMINIO_UID = '@referralflow.ch';

export function nuovoUid(casuale: string): string {
  return `${PREFISSO_UID}${casuale}${DOMINIO_UID}`;
}

// Solo gli eventi che abbiamo creato noi si possono cancellare da qui.
export function uidNostro(uid: string): boolean {
  return /^referralflow-[0-9a-f-]{8,64}@referralflow\.ch$/.test(String(uid || ''));
}

// Il server salva sotto «<UID>.ics»: l'indirizzo si ricava dall'UID.
export function hrefEvento(hrefCalendario: string, uid: string): string {
  const base = hrefCalendario.endsWith('/') ? hrefCalendario : `${hrefCalendario}/`;
  return `${base}${encodeURIComponent(uid).replace(/%40/g, '@')}.ics`;
}

export function componiEvento(e: { uid: string; inizio: Date; fine: Date; titolo: string; note?: string; adesso: Date }): string {
  const righe = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ReferralFlow//agenda//IT',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.adesso)}`,
    `DTSTART:${utc(e.inizio)}`,
    `DTEND:${utc(e.fine)}`,
    `SUMMARY:${testoIcs(e.titolo)}`,
    ...(e.note ? [`DESCRIPTION:${testoIcs(e.note)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return righe.map(piega).join('\r\n') + '\r\n';
}

// ---------- controlli prima di scrivere ----------

// Ora e minuti nel fuso dello studio.
function oraLocale(d: Date): number {
  const p = new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

// Da «2026-09-24» e «08:30» all'istante vero, ora svizzera (anche al cambio d'ora).
export function istanteZurigo(data: string, ora: string): Date | null {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
  const mo = /^(\d{2}):(\d{2})$/.exec(String(ora || ''));
  if (!md || !mo) return null;
  const [y, M, d, h, mi] = [+md[1], +md[2], +md[3], +mo[1], +mo[2]];
  if (M < 1 || M > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, M - 1, d, h, mi);
  const off = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t));
    const v = (k: string) => Number(p.find((x) => x.type === k)?.value);
    return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute')) - t;
  };
  const primo = off(naive);
  const t = naive - off(naive - primo);
  const r = new Date(t);
  // Un'ora che non esiste (salto di marzo) non si scrive.
  return oraLocale(r) === h * 60 + mi ? r : null;
}

export type Scrittura = { inizio: Date; fine: Date; titolo: string; note: string };

export function validaScrittura(c: { data: string; ora: string; durata: number; titolo: string; note?: string }, adesso: Date):
  { ok: true; s: Scrittura } | { ok: false; errore: string } {
  const inizio = istanteZurigo(c.data, c.ora);
  if (!inizio) return { ok: false, errore: 'Data o ora non valide.' };
  const durata = Math.round(Number(c.durata));
  if (!Number.isFinite(durata) || durata < 5 || durata > 480) return { ok: false, errore: 'La durata va da 5 minuti a 8 ore.' };
  const fine = new Date(inizio.getTime() + durata * 60_000);
  if (inizio.getTime() < adesso.getTime() - 5 * 60_000) return { ok: false, errore: 'Non si fissano appuntamenti nel passato.' };
  if (inizio.getTime() > adesso.getTime() + 2 * 366 * 86_400_000) return { ok: false, errore: 'Al massimo due anni avanti.' };
  const ini = oraLocale(inizio), fin = ini + durata;
  if (ini < 6 * 60 || fin > 22 * 60) return { ok: false, errore: "L'appuntamento deve stare fra le 6:00 e le 22:00." };
  const titolo = String(c.titolo || '').replace(/\s+/g, ' ').trim();
  if (titolo.length < 2 || titolo.length > 120) return { ok: false, errore: 'Il titolo va da 2 a 120 caratteri.' };
  const note = String(c.note || '').trim().slice(0, 500);
  return { ok: true, s: { inizio, fine, titolo, note } };
}

// Quanti eventi dell'elenco si accavallano con [inizio, fine).
export function sovrapposti(eventi: { start: Date; end: Date | null }[], inizio: Date, fine: Date): number {
  return eventi.filter((e) => {
    const a = e.start.getTime();
    const b = (e.end ?? new Date(a + 60_000)).getTime();
    return a < fine.getTime() && b > inizio.getTime();
  }).length;
}

// Titolo nello stesso formato di MediOnline, così il robot e l'abbinamento
// severo lo riconoscono quando torna indietro: «Cognome Nome (gg.mm.aaaa)».
export function titoloPaziente(p: { cognome: string; nome: string; data_nascita?: string | null }): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(p.data_nascita || ''));
  const nome = `${String(p.cognome || '').trim()} ${String(p.nome || '').trim()}`.trim();
  return d ? `${nome} (${d[3]}.${d[2]}.${d[1]})` : nome;
}

// ---------- controllo incrociato ----------

// Giorno locale (YYYY-MM-DD) nel fuso dello studio.
export function giornoZurigo(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(d);
}

export type Differenza = { giorno: string; caldav: number; robot: number };

// Per giorno: quanti appuntamenti vede il CalDAV e quanti il robot. Escono
// solo i giorni dove i due non coincidono.
export function confrontaGiorni(caldav: Date[], robot: Date[]): Differenza[] {
  const conta = (xs: Date[]) => xs.reduce((m, d) => m.set(giornoZurigo(d), (m.get(giornoZurigo(d)) || 0) + 1), new Map<string, number>());
  const a = conta(caldav), b = conta(robot);
  const giorni = [...new Set([...a.keys(), ...b.keys()])].sort();
  return giorni.map((g) => ({ giorno: g, caldav: a.get(g) || 0, robot: b.get(g) || 0 })).filter((x) => x.caldav !== x.robot);
}
