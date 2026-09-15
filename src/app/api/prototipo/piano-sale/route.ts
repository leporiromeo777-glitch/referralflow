import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import type { ModificaSala } from '@/lib/sale';
import { preparaPianoSale, statoLavoro } from '@/lib/piano-sale';

export const dynamic = 'force-dynamic';

// Le due cose che una persona può fare al piano delle sale del giorno
// (15.9.2026): prendere per buona la proposta del modello, e correggere una
// fascia a mano. Nient'altro: di chi è una stanza lo dice la pagina wiki
// «Medici/Sale», e una regola si cambia lì, non da qui.
//
// Una correzione vale per il giorno corrente e basta; il piano di domani
// riparte dalle regole. Nel corpo mai un paziente: stanze, colleghi, orari.

const ORA = /^\d{2}:\d{2}$/;

// A che punto è il piano che si sta preparando. Si chiede un paio di volte al
// secondo mentre gira: risponde con numeri, non con quel che il modello scrive.
export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  return NextResponse.json({ lavoro: statoLavoro(session.studioId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');

  // «Prepara con l'AI»: il lavoro parte e la risposta torna subito, perché il
  // modello locale ci mette minuti. L'avanzamento si chiede con la GET qui
  // sopra. È lo stesso lavoro che fa il cron di notte.
  if (azione === 'rigenera') {
    const gia = statoLavoro(session.studioId);
    if (gia?.attivo) return NextResponse.json({ ok: true, stato: 'già in corso', lavoro: gia });
    const studio = session.studioId;
    void preparaPianoSale(studio, { forza: true });
    return NextResponse.json({ ok: true, avviato: true, lavoro: statoLavoro(studio) });
  }

  const [piano] = await query<{ id: string; modifiche: ModificaSala[]; righe: { stanza: string; segmenti: { dalle: string }[] }[]; proposta: string | null }>(
    `select id, modifiche, righe, proposta from piano_sale where studio_id = $1 and giorno = current_date`,
    [session.studioId]
  );
  if (!piano) return NextResponse.json({ errore: 'Il piano di oggi non è ancora pronto.' }, { status: 400 });

  if (azione === 'accetta') {
    if (!piano.proposta) return NextResponse.json({ errore: 'Non c’è nessuna proposta da confermare.' }, { status: 400 });
    await query('update piano_sale set accettata_at = now(), accettata_da = $2, updated_at = now() where id = $1', [piano.id, session.id]);
    return NextResponse.json({ ok: true });
  }

  if (azione === 'assegna') {
    const stanza = String(c?.stanza ?? '').trim();
    const dalle = String(c?.dalle ?? '').trim();
    const chi = String(c?.chi ?? '').trim();
    if (!ORA.test(dalle)) return NextResponse.json({ errore: 'Ora non valida.' }, { status: 400 });
    // La fascia dev'essere una di quelle del piano: così una correzione non
    // può inventare una stanza o un orario che oggi non esistono.
    const riga = (piano.righe ?? []).find((r) => r.stanza.toLowerCase() === stanza.toLowerCase());
    if (!riga || !riga.segmenti.some((s) => s.dalle === dalle)) {
      return NextResponse.json({ errore: 'Questa fascia non è nel piano di oggi.' }, { status: 400 });
    }
    if (chi.length > 80) return NextResponse.json({ errore: 'Nome troppo lungo.' }, { status: 400 });
    const da = (session.email || '').split('@')[0];
    const restanti = (piano.modifiche ?? []).filter((m) => !(m.stanza?.toLowerCase() === stanza.toLowerCase() && m.dalle === dalle));
    const modifiche = [...restanti, { stanza: riga.stanza, dalle, chi, da }];
    await query('update piano_sale set modifiche = $2::jsonb, updated_at = now() where id = $1', [piano.id, JSON.stringify(modifiche)]);
    return NextResponse.json({ ok: true, modifiche });
  }

  if (azione === 'ripristina') {
    const stanza = String(c?.stanza ?? '').trim();
    const dalle = String(c?.dalle ?? '').trim();
    const modifiche = (piano.modifiche ?? []).filter((m) => !(m.stanza?.toLowerCase() === stanza.toLowerCase() && m.dalle === dalle));
    await query('update piano_sale set modifiche = $2::jsonb, updated_at = now() where id = $1', [piano.id, JSON.stringify(modifiche)]);
    return NextResponse.json({ ok: true, modifiche });
  }

  return NextResponse.json({ errore: 'Azione sconosciuta.' }, { status: 400 });
}
