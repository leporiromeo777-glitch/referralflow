import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';
import { isUuid } from '@/lib/cartella';

export const runtime = 'nodejs';

// Foto profilo di un medico inviante registrato. Accessibile a qualunque utente
// autenticato (è un annuario professionale della piattaforma). Il file vero è
// nello storage; qui si risolve avatar_key → immagine.
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse('Non autorizzato', { status: 401 });
  if (!isUuid(params.userId)) return new NextResponse('Non trovato', { status: 404 });

  const [row] = await query<{ avatar_key: string | null }>(
    'select avatar_key from inviante_profiles where user_id = $1',
    [params.userId]
  );
  if (!row?.avatar_key) return new NextResponse('Non trovato', { status: 404 });

  const { body, contentType } = await getFile(row.avatar_key);
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
