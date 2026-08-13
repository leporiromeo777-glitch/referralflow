import 'server-only';
import { query } from './db';

// Storico del paziente: altre referral dello stesso paziente nello studio.
// Abbinamento query-time (non fonde le anagrafiche): stesso studio, stesso
// cognome+nome (case-insensitive) e, quando entrambe le date di nascita sono
// note, stessa data. Così il medico vede «già stato qui» senza rischio di
// unire per errore persone diverse.

export type VisitaPrecedente = {
  id: string;
  status: string;
  urgenza: string;
  quesito: string | null;
  created_at: string;
  appuntamento_at: string | null;
  follow_up_months: number | null;
};

export async function visitePrecedenti(args: {
  studioId: string;
  cognome: string;
  nome: string;
  dataNascita: string | null;
  escludiReferralId: string;
}): Promise<VisitaPrecedente[]> {
  return query<VisitaPrecedente>(
    `select r.id, r.status::text, r.urgenza::text, r.quesito,
            r.created_at::text, r.appuntamento_at::text, r.follow_up_months
       from referrals r
       join patients p on p.id = r.patient_id
      where r.studio_id = $1
        and lower(p.cognome) = lower($2)
        and lower(p.nome) = lower($3)
        and r.id <> $5
        and ($4::date is null or p.data_nascita is null or p.data_nascita = $4::date)
      order by r.created_at desc`,
    [args.studioId, args.cognome, args.nome, args.dataNascita, args.escludiReferralId]
  );
}

// Versione batch per il Programma del giorno: dato l'elenco delle referral
// collegate agli appuntamenti, ritorna per ciascuna quante visite precedenti
// e gli allegati, in poche query invece di N.
export type SchedaExtra = {
  allegati: { id: string; filename: string }[];
  visitePrecedenti: number;
  riassuntoAi: string | null;
};

export async function schedeProgramma(
  studioId: string,
  referralIds: string[]
): Promise<Map<string, SchedaExtra>> {
  const out = new Map<string, SchedaExtra>();
  if (referralIds.length === 0) return out;
  for (const id of referralIds) out.set(id, { allegati: [], visitePrecedenti: 0, riassuntoAi: null });

  // Riassunto pre-visita dell'AI locale, se già generato dal dettaglio.
  const riassunti = await query<{ id: string; riassunto_ai: string | null }>(
    'select id, riassunto_ai from referrals where studio_id = $1 and id = any($2)',
    [studioId, referralIds]
  );
  for (const r of riassunti) {
    const e = out.get(r.id);
    if (e) e.riassuntoAi = r.riassunto_ai;
  }

  const allegati = await query<{ referral_id: string; id: string; filename: string }>(
    `select a.referral_id, a.id, a.filename
       from attachments a
       join referrals r on r.id = a.referral_id
      where r.studio_id = $1 and a.referral_id = any($2)
      order by a.uploaded_at asc`,
    [studioId, referralIds]
  );
  for (const a of allegati) {
    out.get(a.referral_id)?.allegati.push({ id: a.id, filename: a.filename });
  }

  // Conta le referral precedenti (stesso paziente, esclusa quella corrente).
  const conteggi = await query<{ referral_id: string; n: number }>(
    `select cur.id as referral_id, count(prev.id)::int as n
       from referrals cur
       join patients pc on pc.id = cur.patient_id
       left join patients pp
         on lower(pp.cognome) = lower(pc.cognome)
        and lower(pp.nome) = lower(pc.nome)
        and (pc.data_nascita is null or pp.data_nascita is null or pp.data_nascita = pc.data_nascita)
        and pp.studio_id = cur.studio_id
       left join referrals prev
         on prev.patient_id = pp.id and prev.id <> cur.id and prev.studio_id = cur.studio_id
      where cur.studio_id = $1 and cur.id = any($2)
      group by cur.id`,
    [studioId, referralIds]
  );
  for (const c of conteggi) {
    const e = out.get(c.referral_id);
    if (e) e.visitePrecedenti = c.n;
  }
  return out;
}
