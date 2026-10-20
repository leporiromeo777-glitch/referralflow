import { NextRequest, NextResponse } from 'next/server';
import { riceviInvio, studioDaChiave } from '@/lib/pressione/invio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pressione: l'invio dal generatore dei referti Aktiia (20.10.2026,
// docs/wiki/Piattaforma/Pressione.md). Il generatore è un file HTML aperto dai
// computer dello studio (origine «null», file://): per questo la rotta risponde
// a qualunque origine, ma SOLO con la chiave dello studio (Authorization:
// Bearer …; in tabella c'è l'hash). Nessun cookie, nessuna sessione.
//   GET  → la chiave vale? (il tasto «Prova collegamento» del generatore)
//   POST → misure, paziente, giorno/notte e referto Word confermato.
// I dati viaggiano nel corpo, mai nell'indirizzo; nei log solo conteggi.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
};
const risposta = (corpo: unknown, status: number) => NextResponse.json(corpo, { status, headers: CORS });
const MASSIMO_CORPO = 12 * 1024 * 1024;   // referto Word (8 MB) in base64 + misure

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const studio = await studioDaChiave(req.headers.get('authorization'));
  if (!studio) return risposta({ errore: 'chiave_non_valida' }, 401);
  return risposta({ ok: true }, 200);
}

export async function POST(req: NextRequest) {
  const studio = await studioDaChiave(req.headers.get('authorization'));
  if (!studio) return risposta({ errore: 'chiave_non_valida' }, 401);
  if (Number(req.headers.get('content-length') ?? 0) > MASSIMO_CORPO) return risposta({ errore: 'Invio troppo grande.' }, 413);
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return risposta({ errore: 'json_non_valido' }, 400); }
  try {
    const { stato, ...resto } = await riceviInvio(studio, corpo);
    return risposta(resto, stato);
  } catch (e: any) {
    console.error(`[pressione] invio Aktiia: ${e?.code ?? e?.name ?? 'errore'}`);
    return risposta({ errore: 'Errore del server: riprova fra poco.' }, 500);
  }
}
