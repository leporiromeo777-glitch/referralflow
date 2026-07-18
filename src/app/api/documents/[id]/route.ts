import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';
import { logDocumento, isUuid } from '@/lib/cartella';

export const runtime = 'nodejs';

// Download di un documento della cartella del paziente: solo lo studio
// proprietario, e ogni lettura finisce nel registro accessi (art. 4 OPDa).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });
  if (!isUuid(params.id)) return new NextResponse('Non trovato', { status: 404 });

  const [doc] = await query<{ storage_key: string; filename: string }>(
    `select storage_key, filename from patient_documents
      where id = $1 and studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!doc) return new NextResponse('Non trovato', { status: 404 });

  await logDocumento(params.id, 'lettura', {
    studioId: session.studioId,
    userId: session.id,
  });

  const { body, contentType } = await getFile(doc.storage_key);
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
    },
  });
}
