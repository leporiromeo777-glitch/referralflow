import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { elencoStanze, leggiProposta, modificaAmmessa, soloIn, vincoloDi, type ModificaSala, type RigaPiano, type SoloIn } from '@/lib/sale';

// I vincoli della pagina wiki: servono sia contro una proposta del modello sia
// contro una correzione a mano. Una correzione vale per il giorno, una regola
// vale sempre: se si contraddicono vince la regola.
async function vincoliDelleSale(): Promise<SoloIn[]> {
  try {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    return soloIn(readFileSync(path.join(process.cwd(), 'docs/wiki/Medici/Sale.md'), 'utf-8'));
  } catch { return []; }
}
import { preparaPianoSale, statoLavoro } from '@/lib/piano-sale';
import { vietato } from '@/lib/permessi';

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
  const nonPermesso = vietato(session.role, 'sale');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  return NextResponse.json({ lavoro: statoLavoro(session.studioId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'sale');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
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

  const [piano] = await query<{ id: string; modifiche: ModificaSala[]; righe: RigaPiano[]; proposta: string | null }>(
    `select id, modifiche, righe, proposta from piano_sale where studio_id = $1 and giorno = current_date`,
    [session.studioId]
  );
  if (!piano) return NextResponse.json({ errore: 'Il piano di oggi non è ancora pronto.' }, { status: 400 });

  // Confermare APPLICA: la giornata sotto cambia subito. Si applicano solo le
  // righe che si capiscono senza interpretare — stanza del piano, persona in
  // studio oggi, un turno solo in quella stanza — e le altre tornano indietro
  // con il motivo, invece di sparire ([[src/lib/sale]], `leggiProposta`).
  if (azione === 'accetta') {
    if (!piano.proposta) return NextResponse.json({ errore: 'Non c’è nessuna proposta da confermare.' }, { status: 400 });
    const persone = (await query<{ nome: string }>(
      `select distinct pr.nome from appointments a join providers pr on pr.id = a.provider_id
        where a.studio_id = $1 and a.starts_at::date = current_date and pr.attivo order by 1`, [session.studioId]
    )).map((r) => r.nome);
    // I vincoli valgono anche contro una proposta: chi sta sempre e solo in
    // una stanza non ci si sposta nemmeno se il modello lo suggerisce.
    const vincoli = await vincoliDelleSale();
    const lettura = leggiProposta(piano.proposta, piano.righe ?? [], persone, vincoli);
    const da = (session.email || '').split('@')[0];
    const restanti = (piano.modifiche ?? []).filter((m) => !lettura.applicabili.some((a) => a.stanza.toLowerCase() === m.stanza?.toLowerCase()));
    const nuove: ModificaSala[] = [];
    for (const a of lettura.applicabili) {
      const riga = (piano.righe ?? []).find((r) => r.stanza === a.stanza);
      for (const seg of riga?.segmenti ?? []) nuove.push({ stanza: a.stanza, dalle: seg.dalle, chi: a.chi, da, fonte: 'ai' });
    }
    await query(
      `update piano_sale set accettata_at = now(), accettata_da = $2, modifiche = $3::jsonb, updated_at = now() where id = $1`,
      [piano.id, session.id, JSON.stringify([...restanti, ...nuove])]
    );
    return NextResponse.json({ ok: true, applicate: lettura.applicabili.map((a) => `${a.stanza} → ${a.chi}`), saltate: lettura.saltate });
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
    // Una correzione vale per il giorno, una regola vale sempre: se si
    // contraddicono non si salva la correzione, e si dice quale regola.
    const vincoli = await vincoliDelleSale();
    if (!modificaAmmessa({ stanza: riga.stanza, dalle, chi }, vincoli)) {
      const v = vincoloDi(chi, vincoli);
      return NextResponse.json({
        errore: `${chi} sta solo in ${v ? elencoStanze(v.stanze) : 'altre stanze'}: la correzione non è stata salvata. La regola si cambia nella pagina «Medici/Sale».`,
      }, { status: 400 });
    }
    const da = (session.email || '').split('@')[0];
    const restanti = (piano.modifiche ?? []).filter((m) => !(m.stanza?.toLowerCase() === stanza.toLowerCase() && m.dalle === dalle));
    const modifiche = [...restanti, { stanza: riga.stanza, dalle, chi, da, fonte: 'mano' as const }];
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
