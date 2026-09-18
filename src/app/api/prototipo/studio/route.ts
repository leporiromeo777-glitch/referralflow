import { NextRequest, NextResponse } from 'next/server';
import { getSession, hashPassword } from '@/lib/auth';
import { query } from '@/lib/db';
import { catalogoDaPercorsi } from '@/lib/prestazioni';
import { caricaPercorsi } from '@/lib/percorsi';
import { isUuid } from '@/lib/cartella';
import { syncFeed, riabbinaCodici } from '@/lib/agenda-sync';

export const dynamic = 'force-dynamic';

// Chi tiene un'agenda non è per forza un medico: l'ecografista e la dietista
// sono «collaboratori», e le loro prestazioni si fatturano sotto chi le
// supervisiona, non sotto il loro nome (migrazione 048). Il campo esisteva ma
// non era scrivibile: ogni persona creata dall'app restava «medico» per sempre.
const ruoloProvider = (v: unknown) => (String(v ?? '') === 'collaboratore' ? 'collaboratore' : 'medico');

// Pagina «Studio» dell'interfaccia nuova (14.9.2026): dati dello studio,
// personale (utenti con ruolo e accesso), medici dell'agenda (providers),
// sale e apparecchi (studio_risorse). Tutti leggono; solo l'amministratore
// dello studio modifica. Stesse regole della piattaforma: e-mail unica,
// password di almeno 8 caratteri scelta da chi crea l'accesso, mai
// eliminare (si disattiva), nessuno si disattiva da solo. Mai password nei log.
const RUOLI_VALIDI = new Set(['segretaria', 'medico', 'assistente', 'admin', 'tecnico']);
const TIPI = new Set(['sala', 'apparecchio']);
// Posti di una sala: intero 1-99, 1 se manca o non è un numero.
const posti = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1; };

async function leggi(studioId: string) {
  const [studio] = await query<{ nome: string; telefono: string | null; notify_email: string | null; specialita: string | null; indirizzo: string | null; moduli_nascosti: string[] }>(
    `select nome, telefono, notify_email, specialita, indirizzo, moduli_nascosti from studios where id = $1`, [studioId]);
  const personale = await query<{ id: string; email: string; role: string; attivo: boolean; totp: boolean; created_at: string }>(
    `select id, email, role::text, attivo, totp_enabled_at is not null as totp, created_at::text from users where studio_id = $1 order by attivo desc, role, email`, [studioId]);
  const medici = await query<{ id: string; nome: string; aliases: string[]; attivo: boolean; user_id: string | null; gln: string | null; rcc: string | null; colore: string | null; ruolo: string; professione: string | null }>(
    `select id, nome, aliases, attivo, user_id, gln, rcc, colore, ruolo, professione from providers where studio_id = $1 order by attivo desc, nome`, [studioId]);
  const personaleSenzaAccesso = await query<{ id: string; nome: string; ruolo: string; percentuale: number | null; colore: string | null; attivo: boolean }>(
    `select id, nome, ruolo, percentuale, colore, attivo from studio_personale where studio_id = $1 order by attivo desc, nome`, [studioId]);
  const risorse = await query<{ id: string; tipo: string; nome: string; descrizione: string | null; attivo: boolean; posti: number }>(
    `select id, tipo, nome, descrizione, attivo, posti from studio_risorse where studio_id = $1 order by tipo, attivo desc, nome`, [studioId]);
  // Codici del campo «luogo» dell'agenda che non corrispondono a nessun
  // medico (ultimi 60 giorni e futuro): l'amministratore li abbina a un
  // medico (alias) o a una sala/apparecchio.
  const codici = await query<{ codice: string; n: number; ultimo: string }>(
    `select coalesce(nullif(trim(luogo), ''), '(vuoto)') as codice, count(*)::int as n, max(starts_at)::date::text as ultimo
       from appointments where studio_id = $1 and provider_id is null and starts_at >= current_date - 60
      group by 1 order by 2 desc limit 30`, [studioId]);
  const catalogo = await query<{ id: string; nome: string; tipo: string; durata_min: number; sala: string | null; parole_chiave: string[]; attivo: boolean; codice_tariffa: string | null; colore: string | null }>(
    `select id, nome, tipo, durata_min, sala, parole_chiave, attivo, codice_tariffa, colore from prestazioni_catalogo where studio_id = $1 order by attivo desc, tipo, nome`, [studioId]);
  const nomiRisorse = new Set(risorse.map((r) => r.nome.toLowerCase()));
  return { studio, personale, personale_senza_accesso: personaleSenzaAccesso, medici, catalogo, sale: risorse.filter((r) => r.tipo === 'sala'), apparecchi: risorse.filter((r) => r.tipo === 'apparecchio'), codici_agenda: codici.map((c) => ({ ...c, risorsa: nomiRisorse.has(c.codice.toLowerCase()) })) };
}

// Le tre sezioni portate qui dalle pagine vecchie (16.9.2026): la sicurezza
// del proprio accesso, il cruscotto della qualità della catena e le
// statistiche dello studio. Le prime due righe costano poco e vengono
// sempre; le altre solo quando la scheda è aperta (?extra=qualita).
async function sicurezzaDi(userId: string) {
  const [u] = await query<{ email: string; attiva: string | null; in_corso: boolean; codici: number }>(
    `select u.email, u.totp_enabled_at::text as attiva, (u.totp_secret is not null and u.totp_enabled_at is null) as in_corso,
            (select count(*)::int from user_recovery_codes rc where rc.user_id = u.id and rc.used_at is null) as codici
       from users u where u.id = $1`, [userId]);
  return u ?? null;
}

async function qualitaDella(studioId: string) {
  // Le stesse domande del cruscotto vecchio: tutto sta nel `payload.revisione`
  // delle bozze confermate, scritto dal codice a ogni conferma.
  const [settimane, perUtente, classi, origini, dizionario, bozze] = await Promise.all([
    query<{ settimana: string; n: number; quota_med: string | null; tempo_med: string | null; flag: number | null; senza: number | null }>(
      `select to_char(date_trunc('week', reviewed_at), 'IYYY-"s"IW') as settimana, count(*)::int as n,
              percentile_cont(0.5) within group (order by (payload->'revisione'->>'quota_modificata')::numeric)::text as quota_med,
              percentile_cont(0.5) within group (order by (payload->'revisione'->>'tempo_revisione_s')::numeric)::text as tempo_med,
              sum((payload->'revisione'->>'flag_totali')::int)::int as flag,
              sum((payload->'revisione'->>'flag_accettati_senza_riascolto')::int)::int as senza
         from referti_bozze where studio_id = $1 and stato = 'confermata' and payload ? 'revisione'
        group by 1 order by 1 desc limit 8`, [studioId]),
    query<{ email: string; n: number; quota_med: string | null; tempo_med: string | null }>(
      `select coalesce(u.email, '—') as email, count(*)::int as n,
              percentile_cont(0.5) within group (order by (b.payload->'revisione'->>'quota_modificata')::numeric)::text as quota_med,
              percentile_cont(0.5) within group (order by (b.payload->'revisione'->>'tempo_revisione_s')::numeric)::text as tempo_med
         from referti_bozze b left join users u on u.id = b.reviewed_by
        where b.studio_id = $1 and b.stato = 'confermata' and b.payload ? 'revisione'
        group by 1 order by 2 desc limit 10`, [studioId]),
    query<{ classe: string; n: number }>(
      `select k as classe, sum(v::int)::int as n
         from referti_bozze b, jsonb_each_text(coalesce(b.payload->'revisione'->'classi', '{}'::jsonb)) as t(k, v)
        where b.studio_id = $1 and b.stato = 'confermata' group by k order by 2 desc limit 12`, [studioId]),
    query<{ origine: string; n: number }>(
      `select k as origine, sum(v::int)::int as n
         from referti_bozze b, jsonb_each_text(coalesce(b.payload->'revisione'->'origini', '{}'::jsonb)) as t(k, v)
        where b.studio_id = $1 and b.stato = 'confermata' group by k order by 2 desc limit 12`, [studioId]),
    query<{ stato: string; n: number }>(
      `select stato, count(*)::int as n from referti_dizionario where studio_id = $1 group by 1`, [studioId]),
    query<{ stato: string; n: number }>(
      `select stato, count(*)::int as n from referti_bozze where studio_id = $1 group by 1`, [studioId]),
  ]);
  // ── «Quanto corregge la segretaria» (portata qui il 16.9.2026) ──────────
  // Un punto per referto: quante correzioni ha fatto una persona sull'ultimo
  // testo dell'AI. Le trasformazioni AI→AI non entrano, e nemmeno le
  // modifiche del medico: quelle sono un'altra domanda.
  const { mediaMobile, statistiche } = await import('@/lib/audit/metriche');
  const punti = await query<{ bozza_id: string; created_at: string; edit_count: number; edits_per_100_words: number; words_total: number; severity_max: string | null; medico: string | null; review_seconds: number | null; categories: Record<string, number> | null; tipo: string | null; revisore: string | null }>(
    `select h.bozza_id::text, h.created_at::text, h.edit_count, h.edits_per_100_words::float, h.words_total,
            h.severity_max, h.medico, h.review_seconds, h.categories, b.tipo, u.email as revisore
       from audit.human_edits h join referti_bozze b on b.id = h.bozza_id
       left join users u on u.id = h.editor_user_id
      where h.studio_id = $1 and h.editor_role = 'SECRETARY'
      order by h.created_at desc limit 200`, [studioId]).catch(() => []);
  const inOrdine = [...punti].reverse();
  const valori = inOrdine.map((x) => x.edit_count);
  const finestra = valori.length >= 100 ? 50 : 20;
  const categorie: Record<string, number> = {};
  for (const x of inOrdine) for (const [k, v] of Object.entries(x.categories ?? {})) categorie[k] = (categorie[k] ?? 0) + Number(v || 0);
  const correzioni = {
    punti: inOrdine.map((x, i) => ({ ...x, media: mediaMobile(valori, finestra)[i] })),
    st: statistiche(valori),
    per100: statistiche(inOrdine.map((x) => x.edits_per_100_words)),
    tempo: statistiche(inOrdine.map((x) => Number(x.review_seconds ?? 0)).filter((v) => v > 0)),
    senzaCorrezioni: valori.filter((v) => v === 0).length,
    categorie: Object.entries(categorie).map(([k, n]) => ({ categoria: k, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    finestra,
  };
  return { settimane, perUtente, classi, origini, dizionario, bozze, correzioni };
}

async function statisticheDello(studioId: string) {
  const uno = async <T>(sql: string, def: T): Promise<T> => {
    try { const [r] = await query<any>(sql, [studioId]); return (r ? (Object.values(r)[0] as T) : def) ?? def; } catch { return def; }
  };
  const [referral, prenotate, giorni, invianti, appuntamenti, refertiConf, dettature, richiamiAperti] = await Promise.all([
    uno<number>('select count(*)::int as n from referrals where studio_id = $1', 0),
    uno<number>(`select count(distinct h.referral_id)::int as n from referral_status_history h join referrals r on r.id = h.referral_id where r.studio_id = $1 and h.to_status = 'prenotata'::referral_status`, 0),
    uno<string>(`select coalesce(round(avg(extract(epoch from (p.prima - r.created_at)) / 86400.0)::numeric, 1)::text, '—') as g
                   from referrals r join (select referral_id, min(changed_at) as prima from referral_status_history where to_status = 'prenotata'::referral_status group by referral_id) p on p.referral_id = r.id
                  where r.studio_id = $1`, '—'),
    uno<number>('select count(distinct referring_doctor_id)::int as n from referrals where studio_id = $1 and referring_doctor_id is not null', 0),
    uno<number>(`select count(*)::int as n from appointments where studio_id = $1 and starts_at between now() - interval '30 days' and now()`, 0),
    uno<number>(`select count(*)::int as n from referti_bozze where studio_id = $1 and stato = 'confermata'`, 0),
    uno<number>(`select count(*)::int as n from referti_bozze where studio_id = $1 and created_at > now() - interval '30 days'`, 0),
    uno<number>('select count(*)::int as n from referrals where studio_id = $1 and follow_up_due is not null and follow_up_done_at is null', 0),
  ]);
  const perSettimana = await query<{ label: string; n: number }>(
    `select to_char(w, 'DD.MM') as label,
            (select count(*)::int from referrals r where r.studio_id = $1 and r.created_at >= w and r.created_at < w + interval '7 days') as n
       from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w`, [studioId]).catch(() => []);
  return { referral, prenotate, giorni, invianti, appuntamenti, refertiConf, dettature, richiamiAperti, perSettimana };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const extra = new URL(req.url).searchParams.get('extra') ?? '';
  const [base, sicurezza] = await Promise.all([leggi(session.studioId), sicurezzaDi(session.id)]);
  const qualita = extra === 'qualita' ? await qualitaDella(session.studioId) : null;
  const statistiche = extra === 'statistiche' ? await statisticheDello(session.studioId) : null;
  return NextResponse.json({ ...base, io: session.id, admin: session.role === 'admin', ruolo: session.role, sicurezza, qualita, statistiche }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  // La verifica in due passi è una cosa PROPRIA: la accende e la spegne la
  // persona sul suo accesso, non l'amministratore. Quindi prima del controllo
  // dei permessi (16.9.2026, portata qui dalla pagina «Sicurezza»).
  if (azione.startsWith('2fa_')) return await sicurezza2fa(session, azione, c);
  if (session.role !== 'admin') return NextResponse.json({ errore: 'Solo l’amministratore dello studio può modificare.' }, { status: 403 });
  const sid = session.studioId;
  const s = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
  try {
    if (azione === 'studio_aggiorna') {
      const nome = s(c.nome, 120); if (!nome) return NextResponse.json({ errore: 'Il nome dello studio è obbligatorio.' }, { status: 400 });
      await query(`update studios set nome = $2, telefono = nullif($3, ''), notify_email = nullif($4, ''), specialita = nullif($5, ''), indirizzo = nullif($6, '') where id = $1`, [sid, nome, s(c.telefono, 40), s(c.notify_email, 160).toLowerCase(), s(c.specialita, 500), s(c.indirizzo, 200)]);
    } else if (azione === 'moduli_nascosti') {
      const voci = Array.isArray(c.voci) ? c.voci.map((v: unknown) => s(v, 30)).filter((v: string) => /^[a-z]+$/.test(v)).slice(0, 30) : [];
      await query(`update studios set moduli_nascosti = $2 where id = $1`, [sid, voci]);
    } else if (azione === 'utente_crea') {
      const email = s(c.email, 160).toLowerCase(); const password = String(c.password ?? ''); const ruolo = RUOLI_VALIDI.has(s(c.ruolo)) ? s(c.ruolo) : 'segretaria';
      if (!email.includes('@')) return NextResponse.json({ errore: 'E-mail non valida.' }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ errore: 'La password deve avere almeno 8 caratteri.' }, { status: 400 });
      const [esiste] = await query<{ id: string }>('select id from users where email = $1', [email]);
      if (esiste) return NextResponse.json({ errore: 'Esiste già un accesso con questa e-mail.' }, { status: 409 });
      await query(`insert into users (studio_id, email, password_hash, role) values ($1, $2, $3, $4::user_role)`, [sid, email, await hashPassword(password), ruolo]);
    } else if (azione === 'utente_password') {
      const id = s(c.id); const password = String(c.password ?? '');
      if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ errore: 'La password deve avere almeno 8 caratteri.' }, { status: 400 });
      await query('update users set password_hash = $1 where id = $2 and studio_id = $3', [await hashPassword(password), id, sid]);
    } else if (azione === 'utente_ruolo') {
      const id = s(c.id); const ruolo = s(c.ruolo);
      if (!isUuid(id) || !RUOLI_VALIDI.has(ruolo)) return NextResponse.json({ errore: 'ruolo' }, { status: 400 });
      if (id === session.id) return NextResponse.json({ errore: 'Non puoi cambiare il tuo ruolo.' }, { status: 400 });
      await query('update users set role = $1::user_role where id = $2 and studio_id = $3', [ruolo, id, sid]);
    } else if (azione === 'utente_attivo') {
      const id = s(c.id);
      if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      if (id === session.id) return NextResponse.json({ errore: 'Non puoi disattivare il tuo accesso.' }, { status: 400 });
      await query('update users set attivo = not attivo where id = $1 and studio_id = $2', [id, sid]);
    } else if (azione === 'medico_crea') {
      const nome = s(c.nome, 120); if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      const aliases = Array.isArray(c.aliases) ? c.aliases.map((x: unknown) => s(x, 80)).filter(Boolean).slice(0, 10) : String(c.aliases ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
      await query(`insert into providers (studio_id, nome, aliases, ruolo, professione) values ($1, $2, $3, $4, nullif($5, ''))`, [sid, nome, aliases, ruoloProvider(c.ruolo), s(c.professione, 80)]);
      // Un alias scritto a mano vale come un codice abbinato dall'elenco: gli
      // appuntamenti già importati con quel codice tornano nella sua colonna.
      const r = await riabbinaCodici(sid);
      if (r.abbinati) console.log(`[studio] medico_crea → riabbinati ${r.abbinati} appuntamenti (${r.codici.join(', ')})`);
    } else if (azione === 'medico_aggiorna') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      const nome = s(c.nome, 120); if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      const aliases = String(c.aliases ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
      const userId = isUuid(s(c.user_id)) ? s(c.user_id) : null;
      const colore = /^#[0-9a-f]{6}$/i.test(s(c.colore, 7)) ? s(c.colore, 7) : null;
      await query(`update providers set nome = $3, aliases = $4, user_id = $5, gln = nullif($6, ''), rcc = nullif($7, ''), colore = $8, ruolo = $9, professione = nullif($10, '') where id = $1 and studio_id = $2`, [id, sid, nome, aliases, userId, s(c.gln, 20).replace(/\D/g, ''), s(c.rcc, 20).toUpperCase(), colore, ruoloProvider(c.ruolo), s(c.professione, 80)]);
      const r = await riabbinaCodici(sid);
      if (r.abbinati) console.log(`[studio] medico_aggiorna → riabbinati ${r.abbinati} appuntamenti (${r.codici.join(', ')})`);
    } else if (azione === 'medico_attivo') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      await query('update providers set attivo = not attivo where id = $1 and studio_id = $2', [id, sid]);
    } else if (azione === 'prestazione_crea' || azione === 'prestazione_aggiorna') {
      const nome = s(c.nome, 120); const tipo = ['visita', 'esame', 'procedura'].includes(s(c.tipo)) ? s(c.tipo) : 'esame';
      const durata = Math.min(480, Math.max(5, Math.round(Number(c.durata_min)) || 30));
      const parole = String(c.parole_chiave ?? '').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 12);
      if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      const codice = s(c.codice_tariffa, 60);
      // Il colore dell'agenda è il modo in cui una visita prende la sua
      // prestazione (e quindi la sua durata): la colonna esisteva dalla 047,
      // ma non era scrivibile da nessuna parte e chi non lo sapeva vedeva
      // «Da fatturare» senza prestazione e l'orchestrazione senza durate.
      const colore = /^#[0-9a-f]{6}$/i.test(s(c.colore, 7)) ? s(c.colore, 7).toLowerCase() : null;
      try {
        if (azione === 'prestazione_crea') await query(`insert into prestazioni_catalogo (studio_id, nome, tipo, durata_min, sala, parole_chiave, codice_tariffa, colore) values ($1, $2, $3, $4, nullif($5, ''), $6, nullif($7, ''), $8)`, [sid, nome, tipo, durata, s(c.sala, 80), parole, codice, colore]);
        else { const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 }); await query(`update prestazioni_catalogo set nome = $3, tipo = $4, durata_min = $5, sala = nullif($6, ''), parole_chiave = $7, codice_tariffa = nullif($8, ''), colore = $9, updated_at = now() where id = $1 and studio_id = $2`, [id, sid, nome, tipo, durata, s(c.sala, 80), parole, codice, colore]); }
      } catch (e: any) {
        // Un colore per prestazione: l'indice unico lo impone, e un 500 non
        // direbbe quale delle due voci lo sta già usando.
        if (e?.code === '23505') return NextResponse.json({ errore: 'Quel colore dell’agenda è già di un’altra prestazione.' }, { status: 409 });
        throw e;
      }
    } else if (azione === 'prestazione_attivo') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      await query('update prestazioni_catalogo set attivo = not attivo, updated_at = now() where id = $1 and studio_id = $2', [id, sid]);
    } else if (azione === 'prestazioni_da_percorsi') {
      // Le prestazioni dei percorsi della wiki diventano voci del catalogo (solo quelle che mancano).
      const esistenti = new Set((await query<{ nome: string }>('select nome from prestazioni_catalogo where studio_id = $1', [sid])).map((r) => r.nome.toLowerCase()));
      let n = 0;
      for (const v of catalogoDaPercorsi(caricaPercorsi())) {
        if (esistenti.has(v.nome.toLowerCase())) continue;
        await query(`insert into prestazioni_catalogo (studio_id, nome, tipo, durata_min, sala, parole_chiave) values ($1, $2, $3, $4, $5, $6)`, [sid, v.nome, v.tipo, v.durata_min, v.sala, v.parole_chiave]); n++;
      }
      console.log(`[studio] catalogo dai percorsi: ${n} voci nuove`);
    } else if (azione === 'personale_crea' || azione === 'personale_aggiorna') {
      const nome = s(c.nome, 120); if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      const ruolo = s(c.ruolo, 60) || 'aiuto medico';
      const perc = Number.isFinite(Number(c.percentuale)) && c.percentuale !== '' ? Math.min(100, Math.max(0, Math.round(Number(c.percentuale)))) : null;
      const colore = /^#[0-9a-f]{6}$/i.test(s(c.colore, 7)) ? s(c.colore, 7) : null;
      if (azione === 'personale_crea') await query(`insert into studio_personale (studio_id, nome, ruolo, percentuale, colore) values ($1, $2, $3, $4, $5)`, [sid, nome, ruolo, perc, colore]);
      else { const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 }); await query(`update studio_personale set nome = $3, ruolo = $4, percentuale = $5, colore = $6, updated_at = now() where id = $1 and studio_id = $2`, [id, sid, nome, ruolo, perc, colore]); }
    } else if (azione === 'personale_attivo') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      await query('update studio_personale set attivo = not attivo, updated_at = now() where id = $1 and studio_id = $2', [id, sid]);
    } else if (azione === 'risorsa_crea') {
      const tipo = s(c.tipo); const nome = s(c.nome, 120);
      if (!TIPI.has(tipo)) return NextResponse.json({ errore: 'tipo' }, { status: 400 });
      if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      await query(`insert into studio_risorse (studio_id, tipo, nome, descrizione, posti) values ($1, $2, $3, nullif($4, ''), $5)`, [sid, tipo, nome, s(c.descrizione, 500), posti(c.posti)]);
    } else if (azione === 'risorsa_aggiorna') {
      const id = s(c.id); const nome = s(c.nome, 120);
      if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      await query(`update studio_risorse set nome = $3, descrizione = nullif($4, ''), posti = $5, updated_at = now() where id = $1 and studio_id = $2`, [id, sid, nome, s(c.descrizione, 500), posti(c.posti)]);
    } else if (azione === 'risorsa_attivo') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      await query('update studio_risorse set attivo = not attivo, updated_at = now() where id = $1 and studio_id = $2', [id, sid]);
    } else if (azione === 'codice_medico') {
      // Il codice dell'agenda diventa un alias del medico; poi la sincronizzazione
      // riabbina subito gli appuntamenti senza medico.
      const id = s(c.provider_id); const codice = s(c.codice, 80);
      if (!isUuid(id) || !codice || codice === '(vuoto)') return NextResponse.json({ errore: 'codice' }, { status: 400 });
      await query(`update providers set aliases = array_append(array_remove(aliases, $3), $3) where id = $1 and studio_id = $2`, [id, sid, codice]);
      const feeds = await query<{ id: string }>('select id from agenda_feeds where studio_id = $1 and attivo = true', [sid]);
      let abbinati = 0;
      for (const f of feeds) { try { const r = await syncFeed(f.id); abbinati += Number((r as any)?.mapped ?? 0); } catch (e) { console.error(`[studio] sync feed fallita: ${(e as Error)?.message ?? e}`); } }
      // Gli appuntamenti già importati senza medico con quel luogo: abbinati direttamente.
      const [agg] = await query<{ n: number }>(`with u as (update appointments set provider_id = $2 where studio_id = $1 and provider_id is null and lower(trim(luogo)) = lower($3) returning 1) select count(*)::int as n from u`, [sid, id, codice]);
      console.log(`[studio] codice agenda → medico: appuntamenti abbinati=${agg?.n ?? 0} sync=${abbinati}`);
    } else if (azione === 'codice_risorsa') {
      const tipo = s(c.tipo); const codice = s(c.codice, 80);
      if (!TIPI.has(tipo) || !codice || codice === '(vuoto)') return NextResponse.json({ errore: 'codice' }, { status: 400 });
      const [esiste] = await query<{ id: string }>(`select id from studio_risorse where studio_id = $1 and lower(nome) = lower($2)`, [sid, codice]);
      if (!esiste) await query(`insert into studio_risorse (studio_id, tipo, nome, descrizione) values ($1, $2, $3, $4)`, [sid, tipo, codice, 'codice usato nell’agenda (campo luogo)']);
    } else {
      return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
    }
  } catch (e) {
    console.error(`[studio] azione=${azione} fallita: ${(e as Error)?.message ?? e}`);
    return NextResponse.json({ errore: 'Modifica non riuscita.' }, { status: 500 });
  }
  console.log(`[studio] azione=${azione} da=${session.id.slice(0, 8)}`);
  return NextResponse.json({ ok: true, ...(await leggi(sid)) }, { headers: { 'Cache-Control': 'no-store' } });
}

// ── la verifica in due passi, la stessa della pagina vecchia ────────────────
// In due tempi: il segreto nasce spento (`totp_enabled_at` nullo) e si accende
// solo quando arriva il primo codice giusto; allora nascono i codici di
// recupero, che si vedono una volta sola. Il segreto e il QR si generano qui
// sul server e non passano da nessun'altra parte.
async function sicurezza2fa(session: { id: string; email?: string | null }, azione: string, c: any) {
  const { generateTotpSecret, verifyTotp, totpUri, generateRecoveryCodes, hashRecoveryCode } = await import('@/lib/totp');
  const [u] = await query<{ email: string; totp_secret: string | null; totp_enabled_at: string | null }>(
    `select email, totp_secret, totp_enabled_at::text from users where id = $1`, [session.id]);
  if (!u) return NextResponse.json({ errore: 'utente' }, { status: 404 });

  if (azione === '2fa_avvia') {
    if (u.totp_enabled_at) return NextResponse.json({ errore: 'La verifica in due passi è già attiva.' }, { status: 400 });
    const segreto = u.totp_secret ?? generateTotpSecret();
    await query(`update users set totp_secret = $2 where id = $1 and totp_enabled_at is null`, [session.id, segreto]);
    const uri = totpUri(segreto, u.email);
    const QRCode = (await import('qrcode')).default;
    const qr = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
    return NextResponse.json({ ok: true, segreto, uri, qr });
  }

  if (azione === '2fa_annulla') {
    await query(`update users set totp_secret = null where id = $1 and totp_enabled_at is null`, [session.id]);
    return NextResponse.json({ ok: true });
  }

  if (azione === '2fa_conferma') {
    if (!u.totp_secret || u.totp_enabled_at) return NextResponse.json({ errore: 'Non c’è un\u2019attivazione in corso.' }, { status: 400 });
    const codice = String(c?.codice ?? '').replace(/\s/g, '');
    if (!verifyTotp(u.totp_secret, codice)) return NextResponse.json({ errore: 'Codice non valido: riprova con quello che vedi adesso.' }, { status: 400 });
    await query(`update users set totp_enabled_at = now() where id = $1`, [session.id]);
    const codici = generateRecoveryCodes();
    await query(`delete from user_recovery_codes where user_id = $1`, [session.id]);
    for (const k of codici) await query(`insert into user_recovery_codes (user_id, code_hash) values ($1,$2)`, [session.id, hashRecoveryCode(k)]);
    return NextResponse.json({ ok: true, codici });
  }

  if (azione === '2fa_spegni') {
    if (!u.totp_enabled_at || !u.totp_secret) return NextResponse.json({ errore: 'Non è attiva.' }, { status: 400 });
    const codice = String(c?.codice ?? '').replace(/\s/g, '');
    if (!verifyTotp(u.totp_secret, codice)) return NextResponse.json({ errore: 'Codice non valido: serve il codice dell’app per spegnerla.' }, { status: 400 });
    await query(`update users set totp_secret = null, totp_enabled_at = null where id = $1`, [session.id]);
    await query(`delete from user_recovery_codes where user_id = $1`, [session.id]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}
