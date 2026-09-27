import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { getFile } from '@/lib/storage';
import { isUuid } from '@/lib/cartella';
import { vietato } from '@/lib/permessi';
import { registraEvento } from '@/lib/referti-eventi';
import { costruisciWord } from '@/lib/referto-word';
import { componiEml, eHin, emailValida, type AllegatoEml } from '@/lib/eml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// «Prepara e-mail» (26.9.2026, richiesta dello studio): la mail per il
// medico inviante collegato, con il Word del referto e i suoi allegati, in
// copia i medici della «copia per conoscenza» che in rubrica hanno un
// indirizzo. La piattaforma NON la spedisce (regola nLPD: mai dati clinici
// in mail dalla piattaforma): consegna un file .eml che si apre nel programma
// di posta dello studio (HIN) e lo manda chi l'ha preparato.
//   GET ?anteprima=1 → chi riceve, che cosa è allegato, avvisi (JSON)
//   GET              → il file .eml
// Solo referti CONFERMATI: una bozza non esce dallo studio. Oggetto senza il
// nome del paziente; nomi degli allegati neutri. Nei log solo conteggi.
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TIPI: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.docx': MIME_DOCX, '.doc': 'application/msword', '.txt': 'text/plain' };

type Preparata = {
  a: { nome: string; email: string; hin: boolean }[];
  cc: { nome: string; email: string; hin: boolean }[];
  senza_email: string[];
  allegati: { etichetta: string; file: string }[];
  oggetto: string;
  testo: string;
  avvisi: string[];
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const no = vietato(session.role, 'reports');
  if (no) return no;
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const sid = session.studioId;

  const [b] = await query<{ stato: string }>('select stato from referti_bozze where id = $1 and studio_id = $2', [params.id, sid]);
  if (!b) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (b.stato !== 'confermata') return NextResponse.json({ errore: 'Prima conferma il referto: una bozza non si manda fuori dallo studio.' }, { status: 409 });

  const w = await costruisciWord({ studioId: sid, email: session.email }, params.id);
  if ('errore' in w) return NextResponse.json({ errore: w.errore }, { status: w.status });
  const intorno = w.intorno;
  const scelto = intorno?.inviante.scelto ?? null;
  if (!scelto) return NextResponse.json({ errore: 'Il referto non è collegato a un medico inviante: collegalo nella revisione («Inviante, copie e allegati»).' }, { status: 409 });
  if (!emailValida(scelto.email)) return NextResponse.json({ errore: `${scelto.nome} in rubrica non ha un indirizzo e-mail valido: aggiungilo nella pagina Medici invianti.` }, { status: 409 });

  const [studio] = await query<{ nome: string; telefono: string | null }>('select nome, telefono from studios where id = $1', [sid]);
  const idCopie = (intorno?.copia.voci ?? []).map((v) => v.id).filter((x): x is string => !!x);
  const emailCopie = idCopie.length ? await query<{ id: string; nome: string; email: string | null }>('select id, nome, email from referring_doctors where studio_id = $1 and id = any($2::uuid[])', [sid, idCopie]) : [];
  const cc = emailCopie.filter((r) => emailValida(r.email ?? '') && r.id !== scelto.id).map((r) => ({ nome: r.nome, email: r.email!.trim(), hin: eHin(r.email!) }));
  const senzaEmail = (intorno?.copia.voci ?? []).filter((v) => !v.id || !emailCopie.some((r) => r.id === v.id && emailValida(r.email ?? ''))).map((v) => v.nome);

  // Allegati: il Word, poi i documenti della cartella che la lettera elenca.
  const allegati: AllegatoEml[] = [{ nome: w.nomeFile.replace(/^referto-/, 'rapporto-'), tipo: MIME_DOCX, dati: w.docx }];
  const elenco: Preparata['allegati'] = [{ etichetta: 'Rapporto (Word)', file: allegati[0].nome }];
  const avvisi: string[] = [];
  let n = 0;
  for (const al of intorno?.allegati ?? []) {
    // Caricato dalla revisione solo per questo referto (27.9.2026).
    const [d] = al.motivo === 'caricato' && al.id
      ? await query<{ storage_key: string; filename: string; categoria: string | null }>(`select storage_key, filename, null as categoria from referti_allegati where id = $1 and studio_id = $2 and tipo = 'caricato'`, [al.id, sid])
      : al.documento_id
        ? await query<{ storage_key: string; filename: string; categoria: string | null }>('select storage_key, filename, categoria from patient_documents where id = $1 and studio_id = $2', [al.documento_id, sid])
        : [];
    if (!d) { avvisi.push(`«${al.etichetta}» è elencato nella lettera ma non è un documento della cartella: aggiungilo con il tasto «Allegati» nella revisione, o allegalo a mano.`); continue; }
    try {
      const f = await getFile(d.storage_key);
      const ext = path.extname(d.filename).toLowerCase().slice(0, 6);
      const nome = `allegato-${++n}-${(d.categoria || 'documento').replace(/[^a-z]/gi, '') || 'documento'}${ext}`;
      allegati.push({ nome, tipo: TIPI[ext] ?? f.contentType ?? 'application/octet-stream', dati: f.body });
      elenco.push({ etichetta: al.etichetta, file: nome });
    } catch { avvisi.push(`«${al.etichetta}» non si legge dallo storage: allegalo a mano.`); }
  }

  const a = [{ nome: scelto.nome, email: scelto.email.trim(), hin: eHin(scelto.email) }];
  for (const x of [...a, ...cc]) if (!x.hin) avvisi.push(`${x.email} non è un indirizzo HIN: prima di inviare controlla che la mail parta cifrata.`);
  if (senzaEmail.length) avvisi.push(`In copia per conoscenza senza e-mail in rubrica: ${senzaEmail.join(', ')}. Nella lettera ci sono, nella mail no.`);
  if (intorno?.ecg.citato && !intorno.ecg.trovato) avvisi.push('Il referto parla di un ECG che nella cartella non c\'è: non è allegato.');

  const oggetto = `Rapporto ambulatoriale del ${w.dataBase} – ${studio?.nome ?? ''}`.trim();
  const testo = [
    'Gentile collega,', '',
    `in allegato il rapporto ambulatoriale del ${w.dataBase}${elenco.length > 1 ? ` e ${elenco.length - 1 === 1 ? 'un documento' : `${elenco.length - 1} documenti`}` : ''}.`, '',
    'Cordiali saluti', studio?.nome ?? '', studio?.telefono ? `Tel. ${studio.telefono}` : '',
  ].join('\n').replace(/\n+$/, '');

  if (req.nextUrl.searchParams.get('anteprima') === '1') {
    const p: Preparata = { a, cc, senza_email: senzaEmail, allegati: elenco, oggetto, testo, avvisi };
    return NextResponse.json(p, { headers: { 'Cache-Control': 'no-store' } });
  }

  const eml = componiEml({ a: a.map((x) => x.email), cc: cc.map((x) => x.email), oggetto, testo, allegati });
  void registraEvento(sid, params.id, 'email_preparata', session.id, { destinatari: a.length + cc.length, allegati: allegati.length });
  console.log(`[referti] e-mail preparata: bozza ${params.id.slice(0, 8)}, ${a.length + cc.length} destinatari, ${allegati.length} allegati`);
  return new NextResponse(eml, {
    headers: {
      'Content-Type': 'message/rfc822',
      'Content-Disposition': `attachment; filename="${w.nomeFile.replace(/^referto-/, 'rapporto-').replace(/\.docx$/, '.eml')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
