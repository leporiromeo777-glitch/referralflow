import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { salvaDalModulo } from '@/lib/referti-salva';
import { isUuid } from '@/lib/cartella';
import { registraEvento } from '@/lib/referti-eventi';
import { misuraAlloScaricamento } from '@/lib/audit/misura-lavoro';
import { costruisciWord } from '@/lib/referto-word';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Il referto in Word (costruito da src/lib/referto-word.ts). Solo utenti dello
// studio proprietario; nome del file neutro.
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// POST dal modulo della revisione guidata: prima salva testo e campi come
// sono nella pagina (bozza aperta), poi genera il Word da ciò che è salvato.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse('Non trovato', { status: 404 });
  const form = await req.formData().catch(() => null);
  await salvaDalModulo(form, session.studioId, id, session.id, 'word');
  return GET(req, ctx);
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });
  if (!isUuid(params.id)) return new NextResponse('Non trovato', { status: 404 });
  const w = await costruisciWord({ studioId: session.studioId, email: session.email }, params.id);
  if ('errore' in w) return new NextResponse(w.errore, { status: w.status });
  // Evento «word_scaricato» (13.9.2026): serve alla procedura «lettere in
  // ritardo» (referto confermato senza Word prodotto). Solo id, mai testo.
  void registraEvento(session.studioId, params.id, 'word_scaricato', session.id, { stato: w.stato });
  // Misura delle correzioni anche senza «Conferma» (29.9.2026): nello studio
  // la lettera si chiude scaricando il Word. Solo numeri, mai il testo.
  if (w.stato === 'bozza') void misuraAlloScaricamento({ studioId: session.studioId, bozzaId: params.id, userId: session.id, ruoloUtente: session.role, momento: 'word' });
  return new NextResponse(new Uint8Array(w.docx), {
    headers: {
      'Content-Type': MIME_DOCX,
      'Content-Disposition': `attachment; filename="${w.nomeFile}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
