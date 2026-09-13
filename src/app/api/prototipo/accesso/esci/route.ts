import { NextResponse } from 'next/server';
import { destroySession, destroyPending2fa } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Uscita dall'interfaccia nuova: cancella la sessione (e un'eventuale verifica in sospeso).
export async function POST() {
  destroySession();
  destroyPending2fa();
  return NextResponse.json({ ok: true });
}
