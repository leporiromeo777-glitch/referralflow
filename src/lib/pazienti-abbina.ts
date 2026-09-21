import 'server-only';
import { query } from './db';
import { abbina, daTitoloAgenda, indicePazienti, type PazienteMinimo } from './pazienti-abbina-regole';

// Scrive `patient_id` dove manca (22.9.2026): appuntamenti e bozze dello
// studio che le regole sanno abbinare a una cartella. Si chiama quando nasce
// o cambia un paziente, quando arriva l'agenda, quando si conferma un
// referto. Non tocca ciò che è già abbinato, e non stacca mai niente.
// Nei log solo conteggi: mai nomi.
export async function riabbinaPazienti(studioId: string, solo?: { bozzaId?: string }): Promise<{ appuntamenti: number; referti: number }> {
  const pazienti = await query<PazienteMinimo>(`select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);
  if (!pazienti.length) return { appuntamenti: 0, referti: 0 };
  const idx = indicePazienti(pazienti);
  let appuntamenti = 0, referti = 0;

  if (!solo?.bozzaId) {
    // Per TITOLO distinto, non per appuntamento: la stessa persona torna decine di volte.
    const titoli = await query<{ t: string }>(
      `select distinct coalesce(paziente_nome, titolo) as t from appointments where studio_id = $1 and patient_id is null and coalesce(paziente_nome, titolo) is not null`, [studioId]);
    const perPaziente = new Map<string, string[]>();
    for (const { t } of titoli) {
      const { nome, nascita, persona } = daTitoloAgenda(t);
      if (!persona) continue;                       // «— Formazione», «in vacanza»: non sono pazienti
      const e = abbina(nome, nascita, idx);
      if (e.id) perPaziente.set(e.id, [...(perPaziente.get(e.id) ?? []), t]);
    }
    for (const [pid, tt] of perPaziente) {
      const r = await query<{ id: string }>(
        `update appointments set patient_id = $2 where studio_id = $1 and patient_id is null and coalesce(paziente_nome, titolo) = any($3::text[]) returning id`, [studioId, pid, tt]);
      appuntamenti += r.length;
    }
  }

  const bozze = await query<{ id: string; nome: string | null; nascita: string | null }>(
    `select id, coalesce(nullif(campi_confermati->>'nome_paziente', ''), nullif(payload->'campi_estratti'->>'nome_paziente', '')) as nome,
            coalesce(nullif(campi_confermati->>'data_nascita', ''), nullif(payload->'campi_estratti'->>'data_nascita', '')) as nascita
       from referti_bozze where studio_id = $1 and patient_id is null and stato <> 'scartata' and ($2::uuid is null or id = $2)`, [studioId, solo?.bozzaId ?? null]);
  for (const b of bozze) {
    if (!b.nome || /^non indicato$/i.test(b.nome.trim())) continue;
    const e = abbina(b.nome, b.nascita, idx);
    if (!e.id) continue;
    await query(`update referti_bozze set patient_id = $2 where id = $1 and patient_id is null`, [b.id, e.id]);
    referti++;
  }
  if (appuntamenti || referti) console.log(`[pazienti] riabbinati: appuntamenti=${appuntamenti} referti=${referti}`);
  return { appuntamenti, referti };
}
