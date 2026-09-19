import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { convertiInMp3, estensioneAudioAmmessa, estensioneDi } from '@/lib/dittafono';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// «Converti audio»: un file del dittafono (o qualunque audio) → MP3.
// Il file non si salva da nessuna parte: entra, si converte, esce. Le
// registrazioni sono dati sanitari, quindi la vede chi cura — e nei log
// finiscono solo estensione, byte e tempo.
const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);
const MAX_BYTE = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const f = form?.get('file');
  if (!(f instanceof File)) return NextResponse.json({ errore: 'Nessun file.' }, { status: 400 });
  const ext = estensioneDi(f.name);
  if (!estensioneAudioAmmessa(f.name)) return NextResponse.json({ errore: `Formato non riconosciuto (${ext || 'senza estensione'}).` }, { status: 415 });
  if (f.size > MAX_BYTE) return NextResponse.json({ errore: 'File troppo grande (massimo 200 MB).' }, { status: 413 });

  const inizio = Date.now();
  try {
    const mp3 = await convertiInMp3(Buffer.from(await f.arrayBuffer()), ext);
    console.log(`[converti-audio] ${ext} ${f.size} byte → mp3 ${mp3.length} byte in ${Math.round((Date.now() - inizio) / 100) / 10} s`);
    const nome = f.name.replace(/\.[^.]+$/, '') || 'audio';
    return new NextResponse(mp3 as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(nome)}.mp3"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error(`[converti-audio] fallita ${ext}: ${e?.code ?? e?.name ?? 'errore'}`);
    return NextResponse.json({ errore: ext === '.ds2' ? 'Il file .ds2 non si è lasciato decodificare (cifrato con password?).' : 'Conversione non riuscita: il file potrebbe essere danneggiato.' }, { status: 422 });
  }
}
