import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { costruisciRevisione } from '@/lib/prototipo-revisione';

export const dynamic = 'force-dynamic';

// La coda dei referti per il prototipo (13.9.2026): le bozze vere dello
// studio nel modello della «Guided Review». Sessione del browser; il
// prototipo è servito dalla piattaforma (stessa origine).
export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const righe = await query<{
    id: string; stato: string; tipo: string; created_at: string; testo_finale: string | null; payload: any; campi_confermati: any;
  }>(
    `select id, stato, tipo, created_at::text, testo_finale, payload, campi_confermati
       from referti_bozze
      where studio_id = $1 and stato in ('bozza', 'confermata') and coalesce((payload->>'ombra')::boolean, false) = false
      order by (stato = 'bozza') desc, created_at desc
      limit 30`,
    [session.studioId]
  );
  const referti = righe.map((r) => {
    const p = r.payload ?? {};
    const campo = (k: string) => {
      const v = r.campi_confermati?.[k] ?? p.campi_estratti?.[k];
      const s = typeof v === 'string' ? v.trim() : '';
      return s && s.toLowerCase() !== 'non indicato' ? s : '';
    };
    const rev = costruisciRevisione({
      testo: (r.testo_finale ?? p.testo_corretto ?? '') as string,
      parole: Array.isArray(p.parole) ? p.parole : [],
      payload: p,
    });
    const d = new Date(p.dettato_il ?? r.created_at);
    return {
      id: r.id,
      stato: r.stato,
      tipo: r.tipo,
      paziente: campo('nome_paziente') || null,
      nascita: campo('data_nascita') || null,
      medico: typeof p.medico?.nome === 'string' ? p.medico.nome : null,
      medico_id: typeof p.medico?.id === 'string' ? p.medico.id : null,
      formato: p.medico?.formato ?? 'rapporto',
      at: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      audio: rev.audio.label,
      fiducia: p.fiducia?.punteggio ?? null,
      ...rev.riepilogo,
    };
  });
  return NextResponse.json({ referti });
}
