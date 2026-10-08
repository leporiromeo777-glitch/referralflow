import { NextResponse, type NextRequest } from 'next/server';
import { sessioneStudio, senzaCache } from '../_comune';
import { puoOrch } from '@/lib/orchestrazione/ruoli';
import { eventoDaTesto, registraComando, ritiraComando } from '@/lib/orchestrazione/orchestratore';
export const dynamic = 'force-dynamic';
// Un comando (§11) diventa un vincolo con autore e scadenza. Un testo libero
// passa dal modello piccolo e torna DA CONFERMARE: non si applica da solo.
export async function POST(req: NextRequest) {
  const a = await sessioneStudio('operare'); if ('r' in a) return a.r;
  const c = await req.json().catch(() => null);
  // Scrivere a parole che cosa succede («è arrivata la signora…») lo fa chiunque
  // stia coi pazienti: torna un'interpretazione DA CONFERMARE. I comandi veri,
  // quelli che cambiano il piano, restano a chi decide.
  if (c?.testo) return NextResponse.json(await eventoDaTesto(a.s.studioId, String(c.testo), a.s.id), senzaCache);
  if (!puoOrch(a.s.role, 'decidere')) return NextResponse.json({ errore: 'I comandi che cambiano il piano li dà la segreteria o il medico.', codice: 'ruolo_non_ammesso' }, { status: 403 });
  if (c?.azione === 'ritira' && c?.id) return NextResponse.json(await ritiraComando(a.s.studioId, String(c.id)), senzaCache);
  const comando = String(c?.comando ?? '');
  if (!comando) return NextResponse.json({ errore: 'comando mancante' }, { status: 400 });
  const esito = await registraComando(a.s.studioId, comando, c?.parametri ?? {}, a.s.id);
  return NextResponse.json(esito, { ...senzaCache, status: esito.ok ? 200 : 400 });
}
