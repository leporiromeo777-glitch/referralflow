import { NextResponse, type NextRequest } from 'next/server';
import { chiaveCronValida } from '@/lib/cron-chiave';
import { giroAnalisi } from '@/lib/dividi/analisi';
import { giroOcr } from '@/lib/documenti-ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// OCR dei documenti della cartella senza testo (28.9.2026): la chiama
// mac/automazioni.sh ogni quarto d'ora. Parte solo a catena ferma e dura
// minuti: la risposta non lo aspetta.
export async function POST(req: NextRequest) {
  if (!chiaveCronValida(req)) return new NextResponse('Not found', { status: 404 });
  void giroOcr().catch((e: any) => console.error(`[ocr] giro: ${e?.code ?? e?.name ?? 'errore'}`));
  // Le cartelle complete da dividere: separatori e modello locale, dopo l'OCR ([[Piattaforma/Dividi cartella]]).
  void giroAnalisi().catch((e: any) => console.error(`[dividi] giro: ${e?.code ?? e?.name ?? 'errore'}`));
  return NextResponse.json({ ok: true, avviato: true });
}
export const GET = POST;
