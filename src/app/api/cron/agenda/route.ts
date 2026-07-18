import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { syncFeed } from '@/lib/agenda-sync';

export const dynamic = 'force-dynamic';

// Sync automatico dell'agenda: chiamato dal cron ogni 15 minuti.
// Sincronizza tutti i feed attivi di tutti gli studi (il pulsante
// «Sincronizza ora» resta come aggiornamento immediato).
export async function GET(req: NextRequest) {
  const secret = process.env.REMINDER_SECRET;
  const key = req.nextUrl.searchParams.get('key');
  if (!secret || key !== secret) {
    return new NextResponse('Not found', { status: 404 });
  }

  const feeds = await query<{ id: string; nome: string }>(
    'select id, nome from agenda_feeds where attivo = true'
  );

  let ok = 0;
  let errori = 0;
  for (const f of feeds) {
    const res = await syncFeed(f.id);
    if (res.ok) ok++;
    else errori++;
  }

  return NextResponse.json({ feeds: feeds.length, ok, errori });
}
