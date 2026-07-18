// Agenda iCal di esempio per provare la sincronizzazione in locale.
// Calendario unico con più medici e appuntamenti di "oggi". Solo in sviluppo.

export const dynamic = 'force-dynamic';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }

  const today = ymd(new Date());
  const ev = (uid: string, hhmm: string, durMin: number, summary: string, descr: string, loc: string) => {
    const end = `${String(Math.floor((parseInt(hhmm.slice(0, 2)) * 60 + parseInt(hhmm.slice(2)) + durMin) / 60)).padStart(2, '0')}${String((parseInt(hhmm.slice(0, 2)) * 60 + parseInt(hhmm.slice(2)) + durMin) % 60).padStart(2, '0')}`;
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;TZID=Europe/Zurich:${today}T${hhmm}00`,
      `DTEND;TZID=Europe/Zurich:${today}T${end}00`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${descr}`,
      `LOCATION:${loc}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ].join('\r\n');
  };

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cassa dei Medici//Agenda demo//IT',
    'CALSCALE:GREGORIAN',
    ev('demo-1', '0900', 30, 'Bianchi Marco — Dr.ssa Verdi', 'Visita cardiologica', 'Studio 1'),
    ev('demo-2', '0930', 30, 'Ferrari Anna — Dr. Neri', 'Ecocardiografia di controllo', 'Eco 1'),
    ev('demo-3', '1015', 20, 'Rossi Elena — Dr.ssa Verdi', 'Controllo pressione', 'Studio 1'),
    ev('demo-4', '1100', 30, 'Galli Piero — Dr. Bruno', 'Prima visita', 'Studio 2'),
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
}
