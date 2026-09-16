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

  // La baseline dell'orchestrazione (16.9.2026, Piattaforma/Orchestrazione
  // sale §4) si prepara da sola, agganciata a questo giro: una volta al
  // giorno, poi si riusa. Il vecchio piano «una stanza per medico»
  // (cron/piano-sale, con la proposta notturna del modello) non si chiama più:
  // la Home e la pagina Sale leggono il gemello. La rotta resta per chi la
  // volesse a mano.
  void fetch(`${req.nextUrl.origin}/api/cron/orchestrazione?key=${encodeURIComponent(key ?? '')}`, {
    signal: AbortSignal.timeout(180_000),
  }).catch(() => {});

  return NextResponse.json({ feeds: feeds.length, ok, errori });
}
