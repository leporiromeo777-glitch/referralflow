import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { leggiGeometria } from '@/lib/imaging';
import { vietato } from '@/lib/permessi';

export const dynamic = 'force-dynamic';

const RUOLI = new Set(['segretaria', 'medico', 'admin', 'assistente']);

// La calibrazione di un'immagine (mm per pixel), per il righello. Le immagini
// entrate dal 19.9.2026 ce l'hanno già in tabella; per quelle di prima si
// legge dal DICOM originale una volta sola e si scrive.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const nonPermesso = vietato(session.role, 'imaging');  // Accessi/permessi.ts (23.9.2026)
  if (nonPermesso) return nonPermesso;
  if (!RUOLI.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  if (!isUuid(params.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });

  const [img] = await query<{ storage_key: string; immagine: boolean; calibrazione: unknown; geometria: unknown }>(
    `select i.storage_key, i.immagine, i.calibrazione, i.geometria
       from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id
      where i.id = $1 and e.studio_id = $2`, [params.id, session.studioId]);
  if (!img) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (!img.immagine) return NextResponse.json({ errore: 'non_immagine' }, { status: 415 });

  // La geometria completa è la fonte; la calibrazione compatta ne deriva.
  let geo = img.geometria as Record<string, unknown> | null;
  let cal = img.calibrazione as Record<string, unknown> | null;
  if (!geo) {
    geo = (await leggiGeometria(img.storage_key)) as Record<string, unknown> | null;
    if (geo) {
      cal = (geo.calibrazione as Record<string, unknown>) ?? cal;
      delete geo.calibrazione;
      await query(`update imaging_immagini set geometria = $2, calibrazione = coalesce(calibrazione, $3), sha256 = coalesce(sha256, $4) where id = $1`,
        [params.id, JSON.stringify(geo), JSON.stringify(cal), (geo as { sha256_file?: string }).sha256_file ?? null]);
    }
  }
  return NextResponse.json({ calibrazione: cal ?? { tipo: 'nessuna', regioni: [], spacing: null }, geometria: geo }, { headers: { 'Cache-Control': 'no-store' } });
}
