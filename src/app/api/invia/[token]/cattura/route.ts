import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { estraiImpegnativa, catturaAttiva } from '@/lib/impegnativa';
import { isAllowedPublicUpload, MAX_UPLOAD_SIZE } from '@/lib/upload';
import { isCatturaLocked, recordCattura } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Cattura AI dell'impegnativa: l'inviante carica foto/PDF della richiesta e
// riceve i campi estratti per precompilare il modulo. Autorizzata dal token
// del modulo (medico noto), limitata per token (l'API costa). Non salva il
// file: lo legge in memoria, estrae, e lo scarta. La revisione umana resta.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!catturaAttiva()) return new NextResponse('Funzione non attiva', { status: 404 });

  const token = params.token;
  const [doc] = await query<{ id: string }>(
    'select id from referring_doctors where token = $1 and token_expires_at > now()',
    [token]
  );
  if (!doc) return new NextResponse('Link non valido', { status: 403 });

  if (isCatturaLocked(token)) {
    return NextResponse.json(
      { ok: false, errore: 'Troppe letture in poco tempo: riprovi tra qualche minuto.' },
      { status: 429 }
    );
  }
  recordCattura(token);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, errore: 'Nessun file ricevuto.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE || !isAllowedPublicUpload(file)) {
    return NextResponse.json(
      { ok: false, errore: 'File non valido: PDF o foto (JPG/PNG), max 10 MB.' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const campi = await estraiImpegnativa(buffer, file.type || '');
  if (!campi) {
    return NextResponse.json(
      { ok: false, errore: 'Non sono riuscito a leggere l’impegnativa: compili a mano.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, campi });
}
