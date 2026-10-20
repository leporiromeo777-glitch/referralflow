import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { partiWord } from '@/lib/referto-word';

export const dynamic = 'force-dynamic';

// Il foglio della revisione semplice (20.10.2026, richiesta dello studio: «non un foglio bianco ma il foglio della
// lettera, col cuore, che si aggiorna col nome del paziente o del medico, con le dimensioni del Word»): le parti del
// Word attorno al testo, calcolate dalla STESSA funzione del Word (partiWord). Il testo lo scrive la pagina.
//   GET → { medico, intestazione, destinatario, via, data, titolo, paziente, piede, copia, vuoti, formato }
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'reports');
  if (no) return no;
  if (!isUuid(id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const p = await partiWord({ studioId: session.studioId, email: session.email }, id);
  if ('errore' in p) return NextResponse.json({ errore: p.errore }, { status: p.status });
  const d = p.dati;
  return NextResponse.json({
    medico: d.medico, intestazione: d.intestazione, destinatario: d.destinatario, via: d.via, data: d.data, titolo: d.titolo,
    paziente: d.paziente, piede: d.piede, copia: d.copia,
    // paragrafi vuoti fra destinatario e «Lugano,»: quelli dello stampo (9) o quelli del formato lettera
    vuoti: d.spaziDestinatario ?? 9, formato: p.formato,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
