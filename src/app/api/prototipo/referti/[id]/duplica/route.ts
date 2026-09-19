import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query, transazione } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { registraEvento } from '@/lib/referti-eventi';

export const dynamic = 'force-dynamic';

// «Duplica referto» (19.9.2026). Capita che in un solo audio il medico detti
// due referti di due pazienti. Ricaricare l'audio non serve: l'impronta è la
// stessa e la piattaforma lo riaggancia alla prima bozza. Qui si fa una
// COPIA della bozza — stesso testo, stesso audio da riascoltare, stesso
// medico — e la copia si taglia a mano per il secondo paziente.
//
// La copia nasce senza campi confermati (il paziente è un altro) e con
// il proprio file_id («<originale>#2», «#3»…): unica per studio, e si vede
// da dove viene. L'originale non viene toccato.
const RUOLI_AMMESSI = new Set(['segretaria', 'medico', 'admin']);

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!RUOLI_AMMESSI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  const sid = session.studioId;

  const esito = await transazione(async (q) => {
    const [orig] = await q<{ id: string; file_id: string; stato: string }>(
      `select id, file_id, stato from referti_bozze where id = $1 and studio_id = $2`, [params.id, sid]);
    if (!orig) return null;
    // La radice dell'impronta: una copia di una copia resta «#3», non «#2#2».
    const radice = orig.file_id.replace(/#\d+$/, '');
    const [n] = await q<{ n: number }>(
      `select count(*)::int as n from referti_bozze where studio_id = $1 and (file_id = $2 or file_id like $3)`,
      [sid, radice, `${radice}#%`]);
    const nuovoFileId = `${radice}#${(n?.n ?? 1) + 1}`;
    const [copia] = await q<{ id: string }>(
      `insert into referti_bozze (studio_id, file_id, payload, stato, testo_finale, campi_confermati, tipo, medico)
       select studio_id, $3,
              payload || jsonb_build_object('duplicato_da', id, 'duplicato_il', now()::text, 'file_id', $3::text),
              'bozza', testo_finale, null, tipo, medico
         from referti_bozze where id = $1 and studio_id = $2
       returning id`, [orig.id, sid, nuovoFileId]);
    return { originale: orig.id, copia: copia.id, fileId: nuovoFileId };
  });
  if (!esito) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  await registraEvento(sid, esito.copia, 'bozza_duplicata', session.id, { da: esito.originale, file_id: esito.fileId });
  await registraEvento(sid, esito.originale, 'bozza_duplicata_in', session.id, { copia: esito.copia });
  console.log(`[referti] bozza duplicata ${esito.originale.slice(0, 8)} → ${esito.copia.slice(0, 8)}`);
  return NextResponse.json({ ok: true, id: esito.copia });
}
