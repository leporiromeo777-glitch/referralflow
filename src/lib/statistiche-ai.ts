import 'server-only';
import { query } from './db';

// «Chiedi ai tuoi dati»: l'AI locale NON scrive query — risponde soltanto a
// partire da questi aggregati, calcolati qui in modo deterministico e sempre
// recintati sullo studio. Niente SQL generato dal modello, niente dati di
// singoli pazienti nel prompt: solo conteggi e medie.

export type AggregatiStudio = {
  generato_il: string;
  referral_per_mese: { mese: string; totale: number; urgenti: number }[];
  referral_per_stato: Record<string, number>;
  top_invianti_12_mesi: { medico: string; invii: number }[];
  tempo_medio_giorni_ricevuta_prenotata_90g: number | null;
  visite_per_medico_6_mesi: { medico: string; visite: number }[];
  consulti_12_mesi: { aperti: number; risposti: number; convertiti: number };
  follow_up_scaduti: number;
  disdette_90_giorni: number;
  referti_dettati_30_giorni: number;
};

export async function aggregatiStudio(studioId: string): Promise<AggregatiStudio> {
  const perMese = await query<{ mese: string; totale: number; urgenti: number }>(
    `select to_char(date_trunc('month', created_at), 'YYYY-MM') as mese,
            count(*)::int as totale,
            count(*) filter (where urgenza = 'urgente')::int as urgenti
       from referrals
      where studio_id = $1 and created_at > now() - interval '12 months'
      group by 1 order by 1`,
    [studioId]
  );

  const perStato = await query<{ status: string; n: number }>(
    `select status::text, count(*)::int as n from referrals
      where studio_id = $1 group by 1`,
    [studioId]
  );

  const invianti = await query<{ medico: string; invii: number }>(
    `select coalesce(d.nome, 'non indicato') as medico, count(*)::int as invii
       from referrals r left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 and r.created_at > now() - interval '12 months'
      group by 1 order by 2 desc limit 15`,
    [studioId]
  );

  const [tempi] = await query<{ media: number | null }>(
    `select round(avg(extract(epoch from (h2.changed_at - r.created_at)) / 86400)::numeric, 1)::float as media
       from referrals r
       join referral_status_history h2 on h2.referral_id = r.id and h2.to_status = 'prenotata'
      where r.studio_id = $1 and r.created_at > now() - interval '90 days'`,
    [studioId]
  );

  const visite = await query<{ medico: string; visite: number }>(
    `select coalesce(p.nome, 'non assegnato') as medico, count(*)::int as visite
       from appointments a left join providers p on p.id = a.provider_id
      where a.studio_id = $1 and a.starts_at > now() - interval '6 months'
      group by 1 order by 2 desc`,
    [studioId]
  );

  const [consulti] = await query<{ aperti: number; risposti: number; convertiti: number }>(
    `select count(*) filter (where stato = 'aperto')::int as aperti,
            count(*) filter (where stato = 'risposto')::int as risposti,
            count(*) filter (where stato = 'convertito')::int as convertiti
       from consulti where studio_id = $1 and created_at > now() - interval '12 months'`,
    [studioId]
  );

  const [fup] = await query<{ n: number }>(
    `select (
       (select count(*) from referrals where studio_id = $1
          and follow_up_due <= current_date and follow_up_done_at is null)
       + (select count(*) from appointments where studio_id = $1 and referral_id is null
            and follow_up_due <= current_date and follow_up_done_at is null)
     )::int as n`,
    [studioId]
  );

  const [disd] = await query<{ n: number }>(
    `select count(*)::int as n from referrals
      where studio_id = $1 and appt_response in ('disdetto', 'disdetta_da_confermare')
        and updated_at > now() - interval '90 days'`,
    [studioId]
  );

  const [referti] = await query<{ n: number }>(
    `select count(*)::int as n from referti_bozze
      where studio_id = $1 and created_at > now() - interval '30 days'`,
    [studioId]
  );

  return {
    generato_il: new Date().toISOString().slice(0, 10),
    referral_per_mese: perMese,
    referral_per_stato: Object.fromEntries(perStato.map((r) => [r.status, r.n])),
    top_invianti_12_mesi: invianti,
    tempo_medio_giorni_ricevuta_prenotata_90g: tempi?.media ?? null,
    visite_per_medico_6_mesi: visite,
    consulti_12_mesi: consulti ?? { aperti: 0, risposti: 0, convertiti: 0 },
    follow_up_scaduti: fup?.n ?? 0,
    disdette_90_giorni: disd?.n ?? 0,
    referti_dettati_30_giorni: referti?.n ?? 0,
  };
}
