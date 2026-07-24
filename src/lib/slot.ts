import 'server-only';
import { query } from './db';

// Slot proposto all'invio: calcola i primi slot liberi di uno studio a partire
// dalle sue finestre di disponibilità (slot_finestre) meno gli impegni già in
// agenda (appointments) e gli slot già proposti su altre referral in coda.
//
// Tutto in SQL con fuso Europe/Zurich: le finestre sono orari «da parete»
// (09:00 = le nove in Ticino) e la conversione a timestamptz gestisce anche
// l'ora legale. È indicativo: non tocca l'agenda della Cassa dei Medici.

const TZ = 'Europe/Zurich';
const ORIZZONTE_GIORNI = 21; // quanto avanti guardare
const MAX_SLOT = 6; // quanti proporne

export type SlotProposto = { iso: string; label: string };

export async function slotProposti(studioId: string): Promise<SlotProposto[]> {
  const rows = await query<{ iso: string }>(
    `with giorni as (
       select d::date as d
         from generate_series(current_date + 1, current_date + $2, interval '1 day') d
     ),
     slot as (
       select ((g.d + f.ora_inizio) + make_interval(mins => s.n * f.durata_min))
                at time zone $3 as inizio,
              f.durata_min
         from giorni g
         join slot_finestre f
           on f.studio_id = $1 and extract(isodow from g.d) = f.giorno
         join lateral generate_series(
                0,
                floor(extract(epoch from (f.ora_fine - f.ora_inizio)) / 60 / f.durata_min)::int - 1
              ) as s(n) on true
     )
     select to_char(inizio, 'YYYY-MM-DD"T"HH24:MI') as iso
       from slot
      where inizio > now() + interval '12 hours'
        and not exists (
          select 1 from appointments a
           where a.studio_id = $1
             and a.starts_at < inizio + make_interval(mins => slot.durata_min)
             and coalesce(a.ends_at, a.starts_at + interval '30 minutes') > inizio
        )
        and not exists (
          select 1 from referrals r
           where r.studio_id = $1
             and r.slot_proposto = inizio
             and r.status in ('ricevuta','triage','da_prenotare')
        )
      order by inizio
      limit $4`,
    [studioId, ORIZZONTE_GIORNI, TZ, MAX_SLOT]
  );

  return rows.map((r) => ({ iso: r.iso, label: etichetta(r.iso) }));
}

// Etichetta leggibile in italiano dallo slot ISO (orario locale «da parete»).
function etichetta(iso: string): string {
  // iso è "YYYY-MM-DDTHH:MM" in ora locale svizzera: lo interpreto come tale.
  const [dataPart, oraPart] = iso.split('T');
  const [y, m, d] = dataPart.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const giorno = dt.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${giorno}, ore ${oraPart}`;
}

// L'inviante può scegliere solo uno degli slot realmente proposti: si
// riverifica lato server prima di salvarlo sulla referral.
export async function slotValido(studioId: string, iso: string): Promise<string | null> {
  if (!iso) return null;
  const disponibili = await slotProposti(studioId);
  const scelto = disponibili.find((s) => s.iso === iso);
  return scelto ? scelto.iso : null;
}
