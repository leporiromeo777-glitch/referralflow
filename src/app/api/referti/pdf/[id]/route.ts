import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { generaPdfReferto } from '@/lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Il referto in PDF: testo confermato (o, per le bozze, il testo corrente)
// con intestazione dello studio. Solo utenti dello studio proprietario.

function dataCh(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });

  const [b] = await query<{
    stato: string; testo_finale: string | null; payload: any;
    created_at: string; reviewed_at: string | null; studio_nome: string;
  }>(
    `select b.stato, b.testo_finale, b.payload, b.created_at::text, b.reviewed_at::text,
            s.nome as studio_nome
       from referti_bozze b join studios s on s.id = b.studio_id
      where b.id = $1 and b.studio_id = $2`,
    [params.id, session.studioId]
  );
  if (!b) return new NextResponse('Non trovato', { status: 404 });

  const paziente =
    (b.payload?.campi_estratti?.nome_paziente as string | undefined)?.trim() || null;
  const testo = (b.testo_finale ?? b.payload?.testo_corretto ?? '') as string;
  if (!testo.trim()) return new NextResponse('Referto vuoto', { status: 404 });

  const confermata = b.stato === 'confermata';
  const titolo = paziente && paziente !== 'non indicato'
    ? `Referto — ${paziente}`
    : 'Referto';
  const meta = [
    `Dettato il ${dataCh(b.created_at)}${b.reviewed_at ? ` · rivisto il ${dataCh(b.reviewed_at)}` : ''}`,
    confermata ? 'Testo confermato da un medico.' : 'BOZZA — testo non ancora confermato.',
  ];

  const pdf = generaPdfReferto({
    studio: b.studio_nome,
    titolo,
    meta,
    corpo: testo,
    avvertenza: 'Generato da ReferralFlow. Trascrizione automatica rivista da una persona.',
  });

  const nomeFile = `referto-${dataCh(b.created_at).replaceAll('.', '-') || 'bozza'}.pdf`;
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nomeFile}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
