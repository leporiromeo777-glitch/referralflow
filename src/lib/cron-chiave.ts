import 'server-only';
import type { NextRequest } from 'next/server';

// La chiave delle chiamate automatiche (18.9.2026).
//
// Prima viaggiava solo nella query string: `curl ".../api/cron/agenda?key=…"`
// mette il segreto nella riga di comando, visibile nella tabella dei processi
// a chiunque usi il Mac, e nei log di qualunque proxy. Ora si può mandare
// nell'intestazione `Authorization: Bearer …`, che è come lo manda
// mac/automazioni.sh; `?key=` resta accettata perché la usano i lanci a mano
// e le note nella wiki.
export function chiaveCronValida(req: NextRequest): boolean {
  const atteso = process.env.REMINDER_SECRET;
  if (!atteso) return false;
  const testata = req.headers.get('authorization') ?? '';
  const bearer = testata.toLowerCase().startsWith('bearer ') ? testata.slice(7).trim() : '';
  return bearer === atteso || req.nextUrl.searchParams.get('key') === atteso;
}
