import { NextRequest, NextResponse } from 'next/server';
import { studioDaChiave } from '@/lib/pressione/invio';
import { riceviInvio } from '@/lib/saturazione/archivio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Saturazione notturna (22.10.2026, docs/wiki/Piattaforma/Saturazione notturna.md): l'invio dal generatore dei referti
// dello studio, scheda «Sonno · O2Ring». Come la pressione: il generatore è un file HTML aperto dai computer dello studio
// (origine «null», file://), quindi la rotta risponde a qualunque origine ma SOLO con la chiave dello studio (la stessa
// del «Collegamento ReferralFlow» della pressione: Authorization: Bearer …). Nessun cookie, nessuna sessione.
//   GET  → la chiave vale? («Prova collegamento»)
//   POST → { paziente: { cognome, nome, data_nascita }, apparecchio?, notti: [<analisi di o2ring.js>], nota?, valutazione?,
//            referto?: { nome_file, pdf_base64 | docx_base64 } }
//          → 201 nella cartella · 202 da assegnare · 200 già arrivato · 400 il perché
// I dati viaggiano nel corpo, mai nell'indirizzo; nei log solo conteggi.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
};
const risposta = (corpo: unknown, status: number) => NextResponse.json(corpo, { status, headers: CORS });
const MASSIMO_CORPO = 16 * 1024 * 1024;   // referto (8 MB) in base64 + notti (~25 KB l'una)

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
    console.error(`[saturazione] invio: ${e?.code ?? e?.name ?? 'errore'}`);
    return risposta({ errore: 'Errore del server: riprova fra poco.' }, 500);
  }
}
