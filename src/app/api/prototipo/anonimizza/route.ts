import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { anonimizza, TESTO_MAX } from '@/lib/anonimizza';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Anonimizzazione per l'interfaccia nuova (14.9.2026): stessa libreria della
// piattaforma (`src/lib/anonimizza.ts`: modello LOCALE che individua i dati
// identificativi, il CODICE li sostituisce con segnaposto, rete di regole per
// AVS, e-mail e telefoni svizzeri). Testo incollato o file .txt/.md/.pdf/.docx.
// Che cosa resta: una riga di registro (chi, quando, da dove, quanto lungo,
// quanti segnaposto per tipo) e — per gli ULTIMI CINQUE documenti — il testo
// ANONIMIZZATO, così si può riscaricare senza rifare il lavoro. Mai
// l'originale, mai il nome del file, mai la tabella dei segnaposto: quella è
// la chiave per tornare indietro, e tenerla accanto al testo annullerebbe il
// senso della pagina (`anonimizzazioni`, migrazioni 053 e 054).
const QUANTI_TESTI = 5;
const FILE_MAX = 10 * 1024 * 1024;
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin']);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  let testo = '';
  let origine = 'testo';
  const tipo = req.headers.get('content-type') ?? '';
  if (tipo.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ errore: 'modulo_non_valido' }, { status: 400 });
    testo = String(form.get('testo') ?? '');
    const file = form.get('file');
    if (file instanceof File && file.size > 0) {
      if (file.size > FILE_MAX) return NextResponse.json({ errore: 'Il file supera i 10 MB.' }, { status: 413 });
      const nome = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());
      origine = nome.endsWith('.pdf') ? 'pdf' : nome.endsWith('.docx') ? 'docx' : 'file';
      try {
        if (nome.endsWith('.pdf')) {
          const { PDFParse } = await import('pdf-parse');
          const parser = new PDFParse({ data: buffer });
          const r = await parser.getText();
          testo = typeof r === 'string' ? r : String((r as { text?: string })?.text ?? '');
          try { await parser.destroy(); } catch { /* ignora */ }
          if (!testo.trim()) return NextResponse.json({ errore: 'Questo PDF non contiene testo selezionabile (probabilmente una scansione): posso anonimizzare solo PDF con testo.' }, { status: 422 });
        } else if (nome.endsWith('.docx')) {
          const mammoth = (await import('mammoth')).default;
          testo = (await mammoth.extractRawText({ buffer })).value;
        } else if (nome.endsWith('.doc')) {
          return NextResponse.json({ errore: 'Il vecchio formato .doc non è supportato: salva come .docx e riprova.' }, { status: 415 });
        } else if (/\.(txt|md|csv|json|html?)$/.test(nome) || file.type.startsWith('text/')) {
          testo = buffer.toString('utf-8');
        } else {
          return NextResponse.json({ errore: 'Formato non supportato: incolla il testo oppure carica un .txt, un .docx o un PDF.' }, { status: 415 });
        }
      } catch {
        return NextResponse.json({ errore: 'Non riesco a leggere questo file.' }, { status: 422 });
      }
    }
  } else {
    const corpo = await req.json().catch(() => null);
    testo = String(corpo?.testo ?? '');
  }
  testo = testo.replace(/\r/g, '').trim();
  if (!testo) return NextResponse.json({ errore: 'Incolla un testo o carica un file.' }, { status: 400 });
  if (testo.length > TESTO_MAX) return NextResponse.json({ errore: `Il testo è troppo lungo (massimo ${Math.round(TESTO_MAX / 1000)}mila caratteri).` }, { status: 413 });
  const t0 = Date.now();
  try {
    const esito = await anonimizza(testo);
    const ms = Date.now() - t0;
    console.log(`[anonimizza] prototipo origine=${origine} caratteri=${testo.length} sostituzioni=${esito.sostituzioni.length} modello=${esito.modello} ${ms}ms`);
    let registro = true;
    const perTipo: Record<string, number> = {};
    for (const x of esito.sostituzioni) {
      const k = String(x.segnaposto ?? '').replace(/[[\]_\d]/g, '').trim() || 'altro';
      perTipo[k] = (perTipo[k] ?? 0) + 1;
    }
    try {
      await query(
        `insert into anonimizzazioni (studio_id, user_id, origine, caratteri, sostituzioni, per_tipo, modello, ms, testo)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [session.studioId, session.id, origine, testo.length, esito.sostituzioni.length, JSON.stringify(perTipo), esito.modello, ms, esito.testo]
      );
      // Oltre il quinto il testo si cancella da solo: la riga resta, il
      // documento no. Non è una pulizia da fare a mano, se no non si fa.
      await query(
        `update anonimizzazioni set testo = null
          where studio_id = $1 and testo is not null
            and id not in (select id from anonimizzazioni where studio_id = $1 and testo is not null order by created_at desc limit $2)`,
        [session.studioId, QUANTI_TESTI]
      );
    } catch (e) { registro = false; console.warn(`[anonimizza] registro non scritto: ${(e as Error).message}`); }
    // `registro: false` non blocca l'anonimizzazione, ma la pagina lo dice:
    // il file in testa promette «resta una riga di registro (chi, quando, da
    // dove)», e se quella riga non c'è nessuno deve scoprirlo dai log.
    return NextResponse.json({ ok: true, registro, originale: testo, testo: esito.testo, sostituzioni: esito.sostituzioni, modello: esito.modello, ms }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(`[anonimizza] prototipo fallita: ${(e as Error)?.message ?? e}`);
    return NextResponse.json({ errore: 'Il modello locale non ha risposto: riprova tra un minuto.' }, { status: 503 });
  }
}

// Lo storico: le ultime anonimizzazioni dello studio — numeri, e per le
// ultime cinque anche il testo anonimizzato da riscaricare (`?id=…`).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ errore: 'id_non_valido' }, { status: 400 });
    const [riga] = await query<{ testo: string | null; created_at: string }>(
      'select testo, created_at::text from anonimizzazioni where id = $1 and studio_id = $2', [id, session.studioId]);
    if (!riga) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    if (!riga.testo) return NextResponse.json({ errore: 'Questo documento non c’è più: se ne tengono solo gli ultimi cinque.' }, { status: 410 });
    console.log(`[anonimizza] riscaricato id=${id} da=${session.email}`);
    return NextResponse.json({ ok: true, testo: riga.testo, created_at: riga.created_at }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const storico = await query<{ id: string; origine: string; caratteri: number; sostituzioni: number; per_tipo: Record<string, number>; modello: string | null; ms: number | null; created_at: string; da: string | null; ha_testo: boolean }>(
    `select a.id, a.origine, a.caratteri, a.sostituzioni, a.per_tipo, a.modello, a.ms, a.created_at::text,
            split_part(u.email, '@', 1) as da, (a.testo is not null) as ha_testo
       from anonimizzazioni a left join users u on u.id = a.user_id
      where a.studio_id = $1 order by a.created_at desc limit 50`,
    [session.studioId]
  );
  return NextResponse.json({ storico, quanti_testi: QUANTI_TESTI }, { headers: { 'Cache-Control': 'no-store' } });
}
