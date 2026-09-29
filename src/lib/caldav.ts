import 'server-only';
import { randomUUID } from 'crypto';
import { query } from './db';
import { extractPatientName } from './agenda-sync';
import { riabbinaPazienti } from './pazienti-abbina';
import {
  cancellaEvento, confCaldav, creaEvento, elencaCalendari, eventiIntervallo, type ConfCaldav,
} from './caldav-client';
import {
  abbinaCalendario, componiEvento, confrontaGiorni, nuovoUid, sovrapposti, uidNostro, validaScrittura,
  type Differenza,
} from './caldav-regole';

// CalDAV di MediOnline nella piattaforma (23.9.2026, completato il 29.9.2026).
// Lettura sempre; SCRITTURA spenta finché nel file delle credenziali non c'è
// CALDAV_SCRITTURA=attiva, da mettere solo con un utente MediOnline dedicato
// e un'agenda di prova (Decisioni/Registro). Il robot resta la fonte
// dell'agenda; qui si aggiunge:
//   - aggiornaCalendari: quali calendari ci sono e di quale medico;
//   - scrivi / annulla: fissare un appuntamento in MediOnline su gesto di una
//     persona, dopo una conferma, e toglierlo. Mai in automatico, mai in serie;
//     si cancellano solo gli eventi nati qui («referralflow-…» nell'UID);
//   - controllo: per giorno, quanti appuntamenti vede il CalDAV e quanti il
//     robot, per accorgersi se il robot ne salta;
//   - recuperaPassato: gli appuntamenti prima dell'inizio del robot, in un
//     feed a parte (spento: il cron non lo tocca).
// Nei log solo conteggi e id abbreviati: mai titoli, mai nomi.

const URL_PASSATO = 'caldav:passato';

export class ErroreCaldav extends Error {
  constructor(msg: string, public stato = 400) { super(msg); }
}

async function conf(): Promise<ConfCaldav> {
  const c = await confCaldav();
  if (!c) throw new ErroreCaldav('Il collegamento con MediOnline non è configurato su questo server (manca il file delle credenziali CalDAV).', 503);
  return c;
}

export type StatoCaldav = {
  configurato: boolean;
  scrittura: 'attiva' | 'spenta';
  calendari: { id: string; nome: string; provider_id: string | null; medico: string | null; scrivibile: boolean; visto_at: string }[];
  medici: { id: string; nome: string }[];
  scritture: { id: string; inizio: string; fine: string; titolo: string; note: string | null; calendario: string; da: string | null; annullato_at: string | null }[];
};

export async function stato(studioId: string): Promise<StatoCaldav> {
  const [calendari, medici, scritture] = await Promise.all([
    query<StatoCaldav['calendari'][number]>(
      `select c.id, c.nome, c.provider_id, p.nome as medico, c.scrivibile, c.visto_at::text
         from caldav_calendari c left join providers p on p.id = c.provider_id
        where c.studio_id = $1 order by c.nome`, [studioId]),
    query<{ id: string; nome: string }>('select id, nome from providers where studio_id = $1 and attivo order by nome', [studioId]),
    query<StatoCaldav['scritture'][number]>(
      `select s.id, s.starts_at::text as inizio, s.ends_at::text as fine, s.titolo, s.note, c.nome as calendario,
              u.email as da, s.annullato_at::text
         from caldav_scritture s join caldav_calendari c on c.id = s.calendario_id
         left join users u on u.id = s.creato_da
        where s.studio_id = $1 and s.starts_at > now() - interval '14 days'
        order by s.starts_at limit 60`, [studioId]),
  ]);
  const c = await confCaldav();
  // Con la scrittura limitata ad alcuni calendari, gli altri si mostrano come sola lettura.
  const ammesso = (nome: string) => !c?.soloCalendari.length || c.soloCalendari.includes(nome);
  return {
    configurato: !!c, scrittura: c?.scrittura ?? 'spenta',
    calendari: calendari.map((x) => ({ ...x, scrivibile: x.scrivibile && c?.scrittura === 'attiva' && ammesso(x.nome) })),
    medici, scritture,
  };
}

export async function aggiornaCalendari(studioId: string): Promise<{ calendari: number; abbinati: number; scrivibili: number }> {
  const c = await conf();
  const trovati = await elencaCalendari(c);
  const medici = await query<{ id: string; nome: string }>('select id, nome from providers where studio_id = $1 and attivo', [studioId]);
  let abbinati = 0;
  for (const cal of trovati) {
    const medico = abbinaCalendario(cal.nome, medici);
    const [r] = await query<{ provider_id: string | null }>(
      `insert into caldav_calendari (studio_id, href, nome, provider_id, scrivibile, visto_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (studio_id, href) do update set
         nome = excluded.nome, scrivibile = excluded.scrivibile, visto_at = now(),
         -- un abbinamento fatto a mano non si tocca
         provider_id = coalesce(caldav_calendari.provider_id, excluded.provider_id)
       returning provider_id`, [studioId, cal.href, cal.nome || cal.href, medico, cal.scrivibile]);
    if (r?.provider_id) abbinati++;
  }
  console.log(`[medionline] calendari ${trovati.length}, abbinati ${abbinati}`);
  return { calendari: trovati.length, abbinati, scrivibili: trovati.filter((x) => x.scrivibile).length };
}

export async function abbina(studioId: string, calendarioId: string, providerId: string | null): Promise<void> {
  if (providerId) {
    const [p] = await query('select 1 from providers where id = $1 and studio_id = $2', [providerId, studioId]);
    if (!p) throw new ErroreCaldav('Medico non trovato.', 404);
  }
  const r = await query('update caldav_calendari set provider_id = $3 where id = $1 and studio_id = $2 returning id', [calendarioId, studioId, providerId]);
  if (!r.length) throw new ErroreCaldav('Calendario non trovato.', 404);
}

type Calendario = { id: string; href: string; nome: string; scrivibile: boolean; provider_id: string | null };

// Scrivere o cancellare in MediOnline: solo con la scrittura accesa, solo sui
// calendari ammessi, mai in serie (al massimo MAX_SCRITTURE_ORA gesti l'ora
// per studio, fissare o togliere).
const MAX_SCRITTURE_ORA = 10;
async function puoScrivere(studioId: string, c: ConfCaldav, cal: Calendario): Promise<void> {
  if (c.scrittura !== 'attiva') {
    throw new ErroreCaldav("La scrittura in MediOnline è spenta: si accende quando lo studio ha un utente MediOnline dedicato e un'agenda di prova.", 403);
  }
  if (c.soloCalendari.length && !c.soloCalendari.includes(cal.nome)) {
    throw new ErroreCaldav('Per ora si scrive solo sul calendario di prova.', 403);
  }
  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from caldav_scritture
      where studio_id = $1 and (creato_at > now() - interval '1 hour' or annullato_at > now() - interval '1 hour')`, [studioId]);
  if (n >= MAX_SCRITTURE_ORA) throw new ErroreCaldav(`Già ${n} appuntamenti fissati o tolti in MediOnline nell'ultima ora: da qui non si lavora in serie. Riprova più tardi o fallo in MediOnline.`, 429);
}

async function calendario(studioId: string, id: string): Promise<Calendario> {
  const [c] = await query<Calendario>('select id, href, nome, scrivibile, provider_id from caldav_calendari where id = $1 and studio_id = $2', [id, studioId]);
  if (!c) throw new ErroreCaldav('Calendario non trovato.', 404);
  return c;
}

export type RichiestaScrittura = { calendario_id: string; data: string; ora: string; durata: number; titolo: string; note?: string; patient_id?: string | null };

export async function scrivi(studioId: string, userId: string, r: RichiestaScrittura, adesso = new Date()): Promise<{ id: string; inizio: string; fine: string }> {
  const c = await conf();
  const cal = await calendario(studioId, r.calendario_id);
  await puoScrivere(studioId, c, cal);
  if (!cal.scrivibile) throw new ErroreCaldav('Su questo calendario MediOnline non concede la scrittura.', 403);
  const v = validaScrittura(r, adesso);
  if (!v.ok) throw new ErroreCaldav(v.errore);
  const s = v.s;
  let pazienteId: string | null = null;
  if (r.patient_id) {
    const [p] = await query<{ id: string }>('select id from patients where id = $1 and studio_id = $2', [r.patient_id, studioId]);
    if (!p) throw new ErroreCaldav('Paziente non trovato.', 404);
    pazienteId = p.id;
  }
  // Lo spazio deve essere libero in MediOnline, adesso: non si prenota sopra
  // un altro paziente. Si guarda l'agenda vera, non la copia del robot.
  const intorno = await eventiIntervallo(c, cal.href, new Date(s.inizio.getTime() - 60_000), new Date(s.fine.getTime() + 60_000));
  const occupati = sovrapposti(intorno.filter((e) => e.status !== 'CANCELLED'), s.inizio, s.fine);
  if (occupati > 0) throw new ErroreCaldav(`In MediOnline quell'orario è già occupato (${occupati} ${occupati === 1 ? 'appuntamento' : 'appuntamenti'}). Scegli un altro orario.`, 409);

  const uid = nuovoUid(randomUUID());
  const esito = await creaEvento(c, cal.href, uid, componiEvento({ uid, inizio: s.inizio, fine: s.fine, titolo: s.titolo, note: s.note, adesso }));
  if (esito !== 201 && esito !== 204) {
    console.error(`[medionline] scrittura rifiutata: HTTP ${esito}`);
    throw new ErroreCaldav(`MediOnline non ha accettato l'appuntamento (risposta ${esito}). Niente è stato scritto.`, 502);
  }
  const [riga] = await query<{ id: string }>(
    `insert into caldav_scritture (studio_id, calendario_id, uid, starts_at, ends_at, titolo, note, patient_id, creato_da)
     values ($1, $2, $3, $4, $5, $6, nullif($7, ''), $8, $9) returning id`,
    [studioId, cal.id, uid, s.inizio.toISOString(), s.fine.toISOString(), s.titolo, s.note, pazienteId, userId]);
  console.log(`[medionline] scritto ${riga.id.slice(0, 8)}`);
  return { id: riga.id, inizio: s.inizio.toISOString(), fine: s.fine.toISOString() };
}

export async function annulla(studioId: string, userId: string, id: string, adesso = new Date()): Promise<{ gia_tolto: boolean }> {
  const c = await conf();
  const [s] = await query<{ id: string; uid: string; starts_at: Date; ends_at: Date; annullato_at: Date | null; calendario_id: string }>(
    'select id, uid, starts_at, ends_at, annullato_at, calendario_id from caldav_scritture where id = $1 and studio_id = $2', [id, studioId]);
  if (!s) throw new ErroreCaldav('Appuntamento non trovato.', 404);
  if (s.annullato_at) return { gia_tolto: true };
  if (!uidNostro(s.uid)) throw new ErroreCaldav('Si annullano da qui solo gli appuntamenti fissati da ReferralFlow.', 403);
  if (new Date(s.starts_at).getTime() < adesso.getTime()) throw new ErroreCaldav("L'appuntamento è già passato: si toglie in MediOnline, non da qui.", 409);
  const cal = await calendario(studioId, s.calendario_id);
  await puoScrivere(studioId, c, cal);
  const esito = await cancellaEvento(c, cal.href, s.uid);
  let giaTolto = false;
  if (esito === 404) {
    // Non è all'indirizzo atteso: si cerca per UID nell'intervallo. Se non c'è
    // più, qualcuno l'ha già tolto in MediOnline; se c'è altrove si ferma
    // tutto invece di cancellare alla cieca.
    const ev = await eventiIntervallo(c, cal.href, new Date(new Date(s.starts_at).getTime() - 3_600_000), new Date(new Date(s.ends_at).getTime() + 3_600_000));
    if (ev.some((e) => e.uid === s.uid)) throw new ErroreCaldav("MediOnline tiene l'appuntamento a un indirizzo inatteso: toglilo a mano in MediOnline.", 409);
    giaTolto = true;
  } else if (esito !== 200 && esito !== 204) {
    throw new ErroreCaldav(`MediOnline non ha tolto l'appuntamento (risposta ${esito}).`, 502);
  }
  await query('update caldav_scritture set annullato_at = now(), annullato_da = $3 where id = $1 and studio_id = $2', [id, studioId, userId]);
  console.log(`[medionline] annullato ${id.slice(0, 8)}${giaTolto ? ' (già tolto in MediOnline)' : ''}`);
  return { gia_tolto: giaTolto };
}

// Il robot ha letto tutto? Per ogni calendario abbinato a un medico, i giorni
// dove il CalDAV e il robot non contano lo stesso numero di appuntamenti.
export async function controllo(studioId: string, indietro = 7, avanti = 10, adesso = new Date()):
  Promise<{ da: string; a: string; medici: { medico: string; caldav: number; robot: number; differenze: Differenza[] }[] }> {
  const c = await conf();
  const oggi = new Date(adesso); oggi.setHours(0, 0, 0, 0);
  const da = new Date(oggi.getTime() - indietro * 86_400_000);
  const a = new Date(oggi.getTime() + (avanti + 1) * 86_400_000);
  const cals = await query<{ href: string; provider_id: string; medico: string }>(
    `select c.href, c.provider_id, p.nome as medico from caldav_calendari c join providers p on p.id = c.provider_id
      where c.studio_id = $1 order by p.nome`, [studioId]);
  const medici = [];
  for (const cal of cals) {
    const ev = (await eventiIntervallo(c, cal.href, da, a)).filter((e) => e.status !== 'CANCELLED' && !e.allDay);
    const robot = await query<{ starts_at: Date }>(
      `select a.starts_at from appointments a join agenda_feeds f on f.id = a.feed_id
        where a.studio_id = $1 and a.provider_id = $2 and f.url <> $5 and a.starts_at >= $3 and a.starts_at < $4`,
      [studioId, cal.provider_id, da.toISOString(), a.toISOString(), URL_PASSATO]);
    const cd = ev.map((e) => e.start), rb = robot.map((r) => new Date(r.starts_at));
    medici.push({ medico: cal.medico, caldav: cd.length, robot: rb.length, differenze: confrontaGiorni(cd, rb) });
  }
  console.log(`[medionline] controllo ${medici.length} medici, ${medici.reduce((n, m) => n + m.differenze.length, 0)} giorni diversi`);
  return { da: da.toISOString(), a: a.toISOString(), medici };
}

// Il passato che il robot non vede: per ogni medico, gli appuntamenti prima
// del primo che il robot ha importato. Feed a parte e spento, così né il cron
// né la sincronizzazione lo toccano, e gli stessi eventi non entrano due volte
// (chiave feed + UID del CalDAV). Rieseguibile.
export async function recuperaPassato(studioId: string, dal = '2020-01-01', adesso = new Date()):
  Promise<{ medici: { medico: string; letti: number; nuovi: number; fino_a: string }[]; totale: number }> {
  const c = await conf();
  let [feed] = await query<{ id: string }>('select id from agenda_feeds where studio_id = $1 and url = $2', [studioId, URL_PASSATO]);
  if (!feed) {
    [feed] = await query<{ id: string }>(
      `insert into agenda_feeds (studio_id, nome, url, attivo, last_status)
       values ($1, 'MediOnline CalDAV · passato', $2, false, 'Recupero del passato dal CalDAV (spento: non si sincronizza)') returning id`,
      [studioId, URL_PASSATO]);
  }
  const cals = await query<{ href: string; provider_id: string; medico: string }>(
    `select c.href, c.provider_id, p.nome as medico from caldav_calendari c join providers p on p.id = c.provider_id
      where c.studio_id = $1 order by p.nome`, [studioId]);
  const inizio = new Date(`${dal}T00:00:00Z`);
  const sette = new Date(adesso.getTime() - 7 * 86_400_000);
  const medici = [];
  let totale = 0;
  for (const cal of cals) {
    const [m] = await query<{ primo: Date | null }>(
      `select min(a.starts_at) as primo from appointments a join agenda_feeds f on f.id = a.feed_id
        where a.studio_id = $1 and a.provider_id = $2 and f.url <> $3`, [studioId, cal.provider_id, URL_PASSATO]);
    const fino = m?.primo ? new Date(Math.min(new Date(m.primo).getTime(), sette.getTime())) : sette;
    let letti = 0, nuovi = 0;
    // A pezzi di un anno: una richiesta sola sull'intero passato è lenta e
    // rischia il timeout del server.
    for (let t = inizio.getTime(); t < fino.getTime(); t += 366 * 86_400_000) {
      const fine = new Date(Math.min(t + 366 * 86_400_000, fino.getTime()));
      const ev = (await eventiIntervallo(c, cal.href, new Date(t), fine))
        .filter((e) => e.uid && e.status !== 'CANCELLED' && !e.allDay && e.start < fino && !uidNostro(e.uid));
      letti += ev.length;
      for (const e of ev) {
        const r = await query<{ nuovo: boolean }>(
          `insert into appointments (studio_id, feed_id, provider_id, starts_at, ends_at, titolo, paziente_nome, external_uid)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (feed_id, external_uid) do update set
             starts_at = excluded.starts_at, ends_at = excluded.ends_at, titolo = excluded.titolo,
             paziente_nome = excluded.paziente_nome, provider_id = coalesce(appointments.provider_id, excluded.provider_id)
           returning (xmax = 0) as nuovo`,
          [studioId, feed.id, cal.provider_id, e.start.toISOString(), e.end ? e.end.toISOString() : null,
            e.summary || null, extractPatientName(e.summary) || null, e.uid]);
        if (r[0]?.nuovo) nuovi++;
      }
    }
    totale += nuovi;
    medici.push({ medico: cal.medico, letti, nuovi, fino_a: fino.toISOString() });
  }
  await query('update agenda_feeds set last_synced_at = now(), last_status = $2 where id = $1', [feed.id, `Recupero del passato: ${totale} nuovi`]);
  try { await riabbinaPazienti(studioId); } catch (e) { console.error(`[medionline] riabbinamento pazienti: ${(e as Error)?.message ?? e}`); }
  console.log(`[medionline] passato: ${totale} appuntamenti nuovi su ${medici.length} medici`);
  return { medici, totale };
}
