import { query } from './db';

// Medici che dettano (2026-09-07). La fonte di verità è medici.json sul Mac
// dello studio: il servizio della catena pubblica l'elenco su
// /api/referti/medici e qui vive in studios.referti_medici. Solo nomi e
// etichette, mai contenuti clinici.

export type MedicoDettante = {
  id: string;
  nome: string;
  breve: string;
  modalita: 'lettera' | 'aggiornamento';
  // Formato standard del referto per questo medico (bottone «Riorganizza»):
  // «rapporto» = rapporto-tipo a sezioni (Moschovitis), «lettera» = lettera
  // semplice: «Caro …,» / corpo / saluto (Moccetti, 2026-09-07).
  formato: FormatoReferto;
};

export type FormatoReferto = 'rapporto' | 'lettera';

export function formatoValido(v: unknown): FormatoReferto {
  return v === 'lettera' ? 'lettera' : 'rapporto';
}

export const RX_MEDICO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_MEDICI = 30;

export function puliscoMedici(v: unknown): MedicoDettante[] {
  if (!Array.isArray(v)) return [];
  const visti = new Set<string>();
  const out: MedicoDettante[] = [];
  for (const m of v.slice(0, MAX_MEDICI)) {
    if (!m || typeof m !== 'object') continue;
    const id = String((m as any).id ?? '').trim().toLowerCase();
    if (!id || id.length > 32 || !RX_MEDICO_ID.test(id) || visti.has(id)) continue;
    const nome = String((m as any).nome ?? id).trim().slice(0, 80) || id;
    const breve = String((m as any).breve ?? nome).trim().slice(0, 40) || nome;
    const modalita = (m as any).modalita === 'aggiornamento' ? 'aggiornamento' : 'lettera';
    visti.add(id);
    out.push({ id, nome, breve, modalita, formato: formatoValido((m as any).formato) });
  }
  return out;
}

// Il formato del referto per una bozza: dal profilo pubblicato dal Mac
// (fonte di verità), altrimenti da ciò che la bozza porta nel payload,
// altrimenti il rapporto-tipo dello studio.
export async function formatoPerBozza(studioId: string, medico: { id?: string; formato?: string } | null | undefined): Promise<FormatoReferto> {
  if (!medico?.id) return 'rapporto';
  const profilo = (await mediciDelloStudio(studioId)).find((m) => m.id === medico.id);
  if (profilo) return profilo.formato;
  return formatoValido(medico.formato);
}

export async function mediciDelloStudio(studioId: string): Promise<MedicoDettante[]> {
  const [s] = await query<{ medici: unknown }>(
    'select referti_medici as medici from studios where id = $1',
    [studioId]
  );
  return puliscoMedici(s?.medici);
}
