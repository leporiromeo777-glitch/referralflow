import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { generaDocxReferto, ricomponiParagrafi } from '@/lib/referto-docx';
import { profiloMedico } from '@/lib/referti-medici';
import { appellativo, conTitolo, dataCh, dataVisitaDalTesto, destinatarioInRubrica, siglaDaEmail } from '@/lib/referti-lettera';
import { salvaDalModulo } from '@/lib/referti-salva';
import { isUuid } from '@/lib/cartella';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Il referto in Word con la carta intestata dello studio (stampo in
// modelli/referto-carta-intestata.docx): pronto da rifinire e spedire.
// La carta segue il MEDICO che ha dettato (profilo pubblicato dal Mac):
// nome e righe d'intestazione, titolo del rapporto, riga «Copia».
// Formato «lettera» (2026-09-07, dalla versione della segretaria):
// destinatario su più righe («Egregio Signor», nome, specialità, e-mail),
// data della DETTATURA con la sigla di chi scrive, titolo con la data della
// visita. Solo utenti dello studio proprietario. Il nome del file scaricato
// è NEUTRO: niente nome del paziente (stessa regola della pagina Anonimizza).

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// POST dal modulo della revisione guidata: prima salva testo e campi come
// sono nella pagina (bozza aperta), poi genera il Word da ciò che è salvato.
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });
  if (!isUuid(ctx.params.id)) return new NextResponse('Non trovato', { status: 404 });
  const form = await req.formData().catch(() => null);
  await salvaDalModulo(form, session.studioId, ctx.params.id, session.id, 'word');
  return GET(req, ctx);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return new NextResponse('Non autorizzato', { status: 401 });
  if (!isUuid(params.id)) return new NextResponse('Non trovato', { status: 404 });

  const [b] = await query<{
    stato: string; testo_finale: string | null; payload: any;
    campi_confermati: any; created_at: string;
    studio_nome: string; titolare: string | null; studio_telefono: string | null; studio_email: string | null;
    reviewed_email: string | null;
  }>(
    `select b.stato, b.testo_finale, b.payload, b.campi_confermati, b.created_at::text,
            s.nome as studio_nome, s.titolare, s.telefono as studio_telefono, s.notify_email as studio_email,
            u.email as reviewed_email
       from referti_bozze b join studios s on s.id = b.studio_id
       left join users u on u.id = b.reviewed_by
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
  const destinatarioNome = campo('medico_destinatario') || campo('medico_inviante');

  // Il medico che ha dettato: profilo pubblicato dal Mac (carta intestata
  // sua); altrimenti il titolare dello studio; altrimenti lo studio.
  const dettante = b.payload?.medico && typeof b.payload.medico === 'object' ? b.payload.medico : null;
  const profilo = await profiloMedico(session.studioId, dettante?.id);
  const nomeMedico = (profilo?.nome ?? (typeof dettante?.nome === 'string' ? dettante.nome : '') ?? '').trim();
  const titolare = (b.titolare ?? '').trim();
  const medico = nomeMedico ? conTitolo(nomeMedico) : titolare ? conTitolo(titolare) : b.studio_nome;
  const formato = profilo?.formato ?? 'rapporto';

  // Righe dell'intestazione: dal profilo, con {telefono}/{email} dallo
  // studio; una riga con un segnaposto non risolvibile viene tolta.
  const telefono = (b.studio_telefono ?? '').trim();
  const emailStudio = (b.studio_email ?? '').trim();
  const intestazione = (profilo?.intestazione ?? [])
    .map((r) => r.replace('{telefono}', telefono).replace('{email}', emailStudio))
    .filter((r) => !/\{[a-z_]+\}/.test(r) && !/:\s*$/.test(r))
    .join('\n');

  // Data della lettera: la dettatura (dal dittafono o dai metadati audio),
  // altrimenti l'arrivo della bozza; nel formato lettera con la sigla di
  // chi ha confermato (o di chi scarica).
  const dettatoIl = typeof b.payload?.dettato_il === 'string' ? b.payload.dettato_il : '';
  const dataBase = dataCh(dettatoIl) || dataCh(b.created_at);
  const sigla = siglaDaEmail(b.reviewed_email ?? session.email ?? '');
  const data = formato === 'lettera' && sigla ? `${dataBase}/${sigla}` : dataBase;

  // Destinatario: nel formato lettera su più righe, con e-mail e specialità
  // dalla rubrica dei medici invianti se il cognome corrisponde.
  let destinatario = destinatarioNome ? conTitolo(destinatarioNome.replace(/^dr\.?\s*(med\.?)?\s*/i, '')) : ' ';
  let via = 'Via email';
  if (formato === 'lettera') {
    const rubrica = destinatarioNome ? await destinatarioInRubrica(session.studioId, destinatarioNome) : null;
    const righe = destinatarioNome
      ? [appellativo(destinatarioNome), destinatario,
         rubrica?.specialita ? `FMH ${rubrica.specialita}` : '',
         rubrica?.email ? `Via e-mail: ${rubrica.email}` : 'Via e-mail']
      : ['Egregio Signor', 'Dr. med. ', 'Via e-mail'];
    destinatario = righe.filter(Boolean).join('\n');
    via = '';
  }

  // Titolo: dal profilo ({data_visita} = data citata nel testo, altrimenti
  // della dettatura); di serie il titolo storico dello stampo.
  const dataVisita = dataVisitaDalTesto(testo) || dataBase;
  const titolo = (profilo?.titolo_rapporto || 'VISITA AMBULATORIALE, RAPPORTO').replace('{data_visita}', dataVisita);
  // Riga «Copia»: dal profilo (Moschovitis la tiene, Moccetti no).
  const copia = profilo ? profilo.copia : 'Copia: alla paziente';

  const docx = await generaDocxReferto({
    medico,
    intestazione,
    telefono,
    destinatario,
    via,
    data,
    titolo,
    paziente: [pazienteNome, nascita].filter(Boolean).join(' – ') || ' ',
    piede: [pazienteNome, nascita].filter(Boolean).join(', ') + (dataBase ? `  ${dataBase}` : ''),
    testo: ricomponiParagrafi(testo),
    copia,
  });

  const nomeFile = `referto-${dataBase.replaceAll('.', '-') || 'bozza'}.docx`;
  return new NextResponse(new Uint8Array(docx), {
    headers: {
      'Content-Type': MIME_DOCX,
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
