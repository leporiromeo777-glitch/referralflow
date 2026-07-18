import 'server-only';
import { query } from './db';
import { parseICal, type ICalEvent } from './ical';

// Sincronizzazione di un feed iCal (agenda Cassa dei Medici) verso la tabella appointments.
// Server-side: scarica l'URL, mappa il medico dagli alias, abbina le referral,
// fa upsert idempotente e allinea le cancellazioni.

type Provider = { id: string; nome: string; aliases: string[] };
type Feed = { id: string; studio_id: string; url: string; match_field: string };

export type SyncResult = {
  ok: boolean;
  total: number;
  mapped: number;
  unassigned: number;
  matchedReferral: number;
  error?: string;
};

// webcal:// -> https:// ; accetta solo http(s).
function normalizeUrl(raw: string): string | null {
  let u = raw.trim();
  if (u.startsWith('webcal://')) u = 'https://' + u.slice('webcal://'.length);
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function fieldValue(ev: ICalEvent, field: string): string {
  switch (field) {
    case 'description': return ev.description;
    case 'location': return ev.location;
    case 'organizer': return ev.organizer;
    case 'summary':
    default: return ev.summary;
  }
}

// Trova il medico il cui alias compare (case-insensitive) nel campo scelto.
function matchProvider(ev: ICalEvent, field: string, providers: Provider[]): string | null {
  const hay = fieldValue(ev, field).toLowerCase();
  if (!hay) return null;
  for (const p of providers) {
    for (const alias of p.aliases) {
      const a = alias.trim().toLowerCase();
      if (a && hay.includes(a)) return p.id;
    }
  }
  return null;
}

// Nome paziente best-effort: parte del titolo prima di un separatore, senza il testo tra parentesi.
function extractPatientName(summary: string): string {
  if (!summary) return '';
  let s = summary.split(/\s+[—–|;]\s+|\s+-\s+/)[0];
  s = s.replace(/\s*\(.*?\)\s*/g, ' ');
  return s.trim();
}

// Abbina a una referral aperta dello stesso paziente. Preferisce quella con
// appuntamento nel giorno; se c'è un'unica referral aperta la usa; altrimenti nessuna.
async function matchReferral(studioId: string, pazienteNome: string, day: string): Promise<string | null> {
  if (!pazienteNome) return null;
  const rows = await query<{ id: string; appday: string | null }>(
    `select r.id, r.appuntamento_at::date::text as appday
       from referrals r
       join patients p on p.id = r.patient_id
      where r.studio_id = $2
        and r.status <> 'chiusa'
        and position(lower(p.cognome) in lower($1)) > 0
        and position(lower(p.nome)    in lower($1)) > 0`,
    [pazienteNome, studioId]
  );
  if (rows.length === 0) return null;
  const sameDay = rows.find((r) => r.appday === day);
  if (sameDay) return sameDay.id;
  if (rows.length === 1) return rows[0].id;
  return null;
}

// Giorno locale (YYYY-MM-DD) di una data.
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function syncFeed(feedId: string): Promise<SyncResult> {
  const [feed] = await query<Feed>(
    'select id, studio_id, url, match_field from agenda_feeds where id = $1',
    [feedId]
  );
  if (!feed) return { ok: false, total: 0, mapped: 0, unassigned: 0, matchedReferral: 0, error: 'Feed non trovato' };

  const url = normalizeUrl(feed.url);
  if (!url) {
    await query('update agenda_feeds set last_status = $2 where id = $1', [feedId, 'URL non valido']);
    return { ok: false, total: 0, mapped: 0, unassigned: 0, matchedReferral: 0, error: 'URL non valido' };
  }

  let text: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Timeout' : (e?.message || 'Errore di rete');
    await query('update agenda_feeds set last_status = $2 where id = $1', [feedId, `Errore: ${msg}`]);
    return { ok: false, total: 0, mapped: 0, unassigned: 0, matchedReferral: 0, error: msg };
  }

  const events = parseICal(text).filter((e) => e.status !== 'CANCELLED');
  const providers = await query<Provider>(
    'select id, nome, aliases from providers where attivo = true and studio_id = $1',
    [feed.studio_id]
  );

  let mapped = 0;
  let matchedReferral = 0;
  const seen: string[] = [];

  for (const ev of events) {
    if (!ev.uid) continue;
    seen.push(ev.uid);
    const providerId = matchProvider(ev, feed.match_field, providers);
    if (providerId) mapped++;
    const paziente = extractPatientName(ev.summary);
    const referralId = await matchReferral(feed.studio_id, paziente, localDay(ev.start));
    if (referralId) matchedReferral++;

    await query(
      `insert into appointments
         (studio_id, feed_id, provider_id, starts_at, ends_at, titolo, paziente_nome, motivo, luogo, external_uid, referral_id)
       values ($11,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (feed_id, external_uid) do update set
         provider_id   = coalesce(excluded.provider_id, appointments.provider_id),
         starts_at     = excluded.starts_at,
         ends_at       = excluded.ends_at,
         titolo        = excluded.titolo,
         paziente_nome = excluded.paziente_nome,
         motivo        = excluded.motivo,
         luogo         = excluded.luogo,
         referral_id   = coalesce(excluded.referral_id, appointments.referral_id),
         imported_at   = now()`,
      [
        feed.id,
        providerId,
        ev.start.toISOString(),
        ev.end ? ev.end.toISOString() : null,
        ev.summary || null,
        paziente || null,
        ev.description || null,
        ev.location || null,
        ev.uid,
        referralId,
        feed.studio_id,
      ]
    );
  }

  // Allinea le cancellazioni: rimuove gli appuntamenti futuri di questo feed non più presenti.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (seen.length > 0) {
    await query(
      `delete from appointments
        where feed_id = $1 and starts_at >= $2 and not (external_uid = any($3))`,
      [feed.id, startOfToday.toISOString(), seen]
    );
  } else {
    await query(
      'delete from appointments where feed_id = $1 and starts_at >= $2',
      [feed.id, startOfToday.toISOString()]
    );
  }

  const total = seen.length;
  const unassigned = total - mapped;
  await query(
    'update agenda_feeds set last_synced_at = now(), last_status = $2 where id = $1',
    [feedId, `OK · ${total} appuntamenti`]
  );

  return { ok: true, total, mapped, unassigned, matchedReferral };
}
