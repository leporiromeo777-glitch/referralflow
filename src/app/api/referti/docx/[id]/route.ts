import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { generaDocxReferto, ricomponiParagrafi } from '@/lib/referto-docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Il referto in Word con la carta intestata dello studio (stampo in
// modelli/referto-carta-intestata.docx): pronto da rifinire e spedire.
// Solo utenti dello studio proprietario. Il nome del file scaricato è
// NEUTRO: niente nome del paziente (stessa regola della pagina Anonimizza).

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function dataCh(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });

  const [b] = await query<{
    stato: string; testo_finale: string | null; payload: any;
    campi_confermati: any; created_at: string;
    studio_nome: string; titolare: string | null; studio_telefono: string | null;
  }>(
    `select b.stato, b.testo_finale, b.payload, b.campi_confermati, b.created_at::text,
            s.nome as studio_nome, s.titolare, s.telefono as studio_telefono
       from referti_bozze b join studios s on s.id = b.studio_id
      where b.id = $1 and b.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!b) return new NextResponse('Non trovato', { status: 404 });

  const testo = ((b.testo_finale ?? b.payload?.testo_corretto ?? '') as string).trim();
  if (!testo) return new NextResponse('Referto vuoto', { status: 404 });

  // I campi confermati dalla revisione vincono su quelli estratti.
  const campo = (nome: string): string => {
    const v = b.campi_confermati?.[nome] ?? b.payload?.campi_estratti?.[nome];
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.toLowerCase() !== 'non indicato' ? s : '';
  };

  const pazienteNome = campo('nome_paziente');
  const nascita = campo('data_nascita');
  const destinatario = campo('medico_destinatario') || campo('medico_inviante');
  const dataDoc = dataCh(b.created_at);

  // Il medico in intestazione: il titolare dello studio (con il titolo, se
  // non ce l'ha già). Vuoto se non configurato: si compila in Word.
  const titolare = (b.titolare ?? '').trim();
  const medico = titolare
    ? (titolare.toLowerCase().startsWith('dr') ? titolare : `Dr. med. ${titolare}`)
    : b.studio_nome;

  const docx = await generaDocxReferto({
    medico,
    telefono: (b.studio_telefono ?? '').trim(),
    destinatario: destinatario ? `Dr. med. ${destinatario.replace(/^dr\.?\s*(med\.?)?\s*/i, '')}` : ' ',
    data: dataDoc,
    paziente: [pazienteNome, nascita].filter(Boolean).join(' – ') || ' ',
    piede: [pazienteNome, nascita].filter(Boolean).join(', ') + (dataDoc ? `  ${dataDoc}` : ''),
    testo: ricomponiParagrafi(testo),
  });

  const nomeFile = `referto-${dataDoc.replaceAll('.', '-') || 'bozza'}.docx`;
  return new NextResponse(new Uint8Array(docx), {
    headers: {
      'Content-Type': MIME_DOCX,
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
