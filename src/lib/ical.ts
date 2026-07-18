// Mini-parser iCal (RFC 5545) senza dipendenze esterne.
// Copre ciò che serve per leggere un'agenda: VEVENT con UID/DTSTART/DTEND/
// SUMMARY/DESCRIPTION/LOCATION/ORGANIZER/STATUS. Le date gestite: UTC (suffisso Z),
// con TZID (es. Europe/Zurich) e date intere (VALUE=DATE). Le date "floating"
// (senza zona) sono interpretate nel fuso dello studio (Europe/Zurich).

const DEFAULT_TZ = 'Europe/Zurich';

export type ICalEvent = {
  uid: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  summary: string;
  description: string;
  location: string;
  organizer: string;
  status: string;
};

type RawProp = { name: string; params: Record<string, string>; value: string };

// Srotola le righe piegate (continuazione = riga che inizia con spazio o tab).
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseProp(line: string): RawProp | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = head.split(';');
  const name = segs[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const seg of segs.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq !== -1) params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }
  return { name, params, value };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Offset (in ms) del fuso `timeZone` all'istante `date`: utc - local.
function tzOffsetMs(timeZone: string, date: Date): number {
  const asUTC = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asTZ = new Date(date.toLocaleString('en-US', { timeZone }));
  return asUTC.getTime() - asTZ.getTime();
}

// Converte i componenti orari (interpretati nel fuso dato) nell'istante UTC.
function wallTimeToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string
): Date {
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const offset = tzOffsetMs(timeZone, new Date(naiveUtc));
  return new Date(naiveUtc + offset);
}

function parseDate(prop: RawProp): { date: Date; allDay: boolean } | null {
  const v = prop.value.trim();
  // Data intera: YYYYMMDD (mezzanotte nel fuso dello studio).
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const [, y, mo, d] = m;
    return { date: wallTimeToUtc(+y, +mo, +d, 0, 0, 0, DEFAULT_TZ), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  }
  const tz = prop.params.TZID || DEFAULT_TZ;
  return { date: wallTimeToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
}

export function parseICal(text: string): ICalEvent[] {
  const lines = unfold(text);
  const events: ICalEvent[] = [];
  let cur: RawProp[] | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = [];
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) events.push(buildEvent(cur));
      cur = null;
      continue;
    }
    if (cur) {
      const p = parseProp(line);
      if (p) cur.push(p);
    }
  }
  // Scarta eventi senza data d'inizio valida.
  return events.filter((e) => e.start instanceof Date && !isNaN(e.start.getTime()));
}

function buildEvent(props: RawProp[]): ICalEvent {
  const get = (name: string) => props.find((p) => p.name === name);
  const text = (name: string) => {
    const p = get(name);
    return p ? unescapeText(p.value).trim() : '';
  };

  const dtstart = get('DTSTART');
  const dtend = get('DTEND');
  const start = dtstart ? parseDate(dtstart) : null;
  const end = dtend ? parseDate(dtend) : null;

  return {
    uid: text('UID'),
    start: start ? start.date : new Date(NaN),
    end: end ? end.date : null,
    allDay: start ? start.allDay : false,
    summary: text('SUMMARY'),
    description: text('DESCRIPTION'),
    location: text('LOCATION'),
    organizer: text('ORGANIZER'),
    status: (get('STATUS')?.value || '').toUpperCase(),
  };
}
