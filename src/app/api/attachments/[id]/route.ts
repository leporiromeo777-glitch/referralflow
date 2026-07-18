import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse('Non autorizzato', { status: 401 });

  // L'allegato è visibile solo allo studio proprietario della referral.
  const [att] = await query<{ storage_key: string; filename: string }>(
    `select a.storage_key, a.filename
       from attachments a
       join referrals r on r.id = a.referral_id
      where a.id = $1 and r.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!att) return new NextResponse('Non trovato', { status: 404 });

  const { body, contentType } = await getFile(att.storage_key);
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(att.filename)}"`,
    },
  });
}
