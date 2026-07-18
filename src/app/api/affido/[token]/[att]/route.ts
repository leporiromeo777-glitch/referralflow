import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';

export const runtime = 'nodejs';

// Download degli allegati di un affido esterno: l'autenticazione è il token
// lungo con scadenza (stesso principio delle pagine /affido/[token]).
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; att: string } }
) {
  const [att] = await query<{ storage_key: string; filename: string }>(
    `select a.storage_key, a.filename
       from external_attachments a
       join external_referrals er on er.id = a.external_referral_id
      where a.id = $1 and er.token = $2 and er.token_expires_at > now()`,
    [params.att, params.token]
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
