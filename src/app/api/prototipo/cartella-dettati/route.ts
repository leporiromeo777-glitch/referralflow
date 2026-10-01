import { NextResponse, type NextRequest } from 'next/server';
import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import { getSession } from '@/lib/auth';
import { vietato } from '@/lib/permessi';
import { indirizzoSmb, leggiCondivisioni, scriptWindows } from '@/lib/cartella-dettati';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Collega la cartella dei dettati» (1.10.2026): dice se la cartella «Audio
// da trascrivere» del Mac server è condivisa in rete e con che nome, e dà il
// .bat per Windows (?file=win) o l'indirizzo smb:// per il Mac. Solo nella
// rete dello studio; nessuna credenziale: le chiede il computer.
const CARTELLA = process.env.REFERTI_CARTELLA_DA_TRASCRIVERE || path.join(os.homedir(), 'Desktop', 'Audio da trascrivere');

function host(): string {
  if (process.env.CARTELLA_DETTATI_HOST) return process.env.CARTELLA_DETTATI_HOST;
  const h = os.hostname();
  return h.endsWith('.local') ? h : `${h}.local`;
}

// L'indirizzo del Mac nella rete dello studio (privato, non Tailscale).
function ipLocale(): string | null {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const a of lista ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return null;
}

function condivisioni(): Promise<string> {
  return new Promise((ok) => execFile('/usr/sbin/sharing', ['-l'], { timeout: 10_000 }, (_e, out) => ok(String(out ?? ''))));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'reports');
  if (no) return no;
  const c = leggiCondivisioni(await condivisioni()).find((x) => path.resolve(x.percorso) === path.resolve(CARTELLA)) ?? null;
  const nome = c?.nome ?? path.basename(CARTELLA);
  const h = host(), ip = ipLocale();
  if (req.nextUrl.searchParams.get('file') === 'win') {
    if (!c) return NextResponse.json({ errore: 'La cartella non è ancora condivisa in rete sul Mac server.' }, { status: 409 });
    return new NextResponse(scriptWindows({ host: h, ip, nome }), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="Collega cartella dettati.bat"',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return NextResponse.json({
    condivisa: !!c, ospite: c?.ospite ?? false, nome, host: h, ip,
    smb: indirizzoSmb(h, nome), smbIp: ip ? indirizzoSmb(ip, nome) : null,
  });
}
