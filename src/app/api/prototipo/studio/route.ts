import { NextRequest, NextResponse } from 'next/server';
import { getSession, hashPassword } from '@/lib/auth';
import { query } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { syncFeed } from '@/lib/agenda-sync';

export const dynamic = 'force-dynamic';

// Pagina «Studio» dell'interfaccia nuova (14.9.2026): dati dello studio,
// personale (utenti con ruolo e accesso), medici dell'agenda (providers),
// sale e apparecchi (studio_risorse). Tutti leggono; solo l'amministratore
// dello studio modifica. Stesse regole della piattaforma: e-mail unica,
// password di almeno 8 caratteri scelta da chi crea l'accesso, mai
// eliminare (si disattiva), nessuno si disattiva da solo. Mai password nei log.
const RUOLI_VALIDI = new Set(['segretaria', 'medico', 'admin']);
const TIPI = new Set(['sala', 'apparecchio']);
// Posti di una sala: intero 1-99, 1 se manca o non è un numero.
const posti = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1; };

async function leggi(studioId: string) {
  const [studio] = await query<{ nome: string; telefono: string | null; notify_email: string | null; specialita: string | null; indirizzo: string | null; moduli_nascosti: string[] }>(
    `select nome, telefono, notify_email, specialita, indirizzo, moduli_nascosti from studios where id = $1`, [studioId]);
  const personale = await query<{ id: string; email: string; role: string; attivo: boolean; totp: boolean; created_at: string }>(
    `select id, email, role::text, attivo, totp_enabled_at is not null as totp, created_at::text from users where studio_id = $1 order by attivo desc, role, email`, [studioId]);
  const medici = await query<{ id: string; nome: string; aliases: string[]; attivo: boolean; user_id: string | null }>(
    `select id, nome, aliases, attivo, user_id from providers where studio_id = $1 order by attivo desc, nome`, [studioId]);
  const risorse = await query<{ id: string; tipo: string; nome: string; descrizione: string | null; attivo: boolean; posti: number }>(
    `select id, tipo, nome, descrizione, attivo, posti from studio_risorse where studio_id = $1 order by tipo, attivo desc, nome`, [studioId]);
  // Codici del campo «luogo» dell'agenda che non corrispondono a nessun
  // medico (ultimi 60 giorni e futuro): l'amministratore li abbina a un
  // medico (alias) o a una sala/apparecchio.
  const codici = await query<{ codice: string; n: number; ultimo: string }>(
    `select coalesce(nullif(trim(luogo), ''), '(vuoto)') as codice, count(*)::int as n, max(starts_at)::date::text as ultimo
       from appointments where studio_id = $1 and provider_id is null and starts_at >= current_date - 60
      group by 1 order by 2 desc limit 30`, [studioId]);
  const nomiRisorse = new Set(risorse.map((r) => r.nome.toLowerCase()));
  return { studio, personale, medici, sale: risorse.filter((r) => r.tipo === 'sala'), apparecchi: risorse.filter((r) => r.tipo === 'apparecchio'), codici_agenda: codici.map((c) => ({ ...c, risorsa: nomiRisorse.has(c.codice.toLowerCase()) })) };
}

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  return NextResponse.json({ ...(await leggi(session.studioId)), io: session.id, admin: session.role === 'admin' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ errore: 'Solo l’amministratore dello studio può modificare.' }, { status: 403 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const sid = session.studioId;
  const s = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
  try {
    if (azione === 'studio_aggiorna') {
      const nome = s(c.nome, 120); if (!nome) return NextResponse.json({ errore: 'Il nome dello studio è obbligatorio.' }, { status: 400 });
      await query(`update studios set nome = $2, telefono = nullif($3, ''), notify_email = nullif($4, ''), specialita = nullif($5, ''), indirizzo = nullif($6, '') where id = $1`, [sid, nome, s(c.telefono, 40), s(c.notify_email, 160).toLowerCase(), s(c.specialita, 500), s(c.indirizzo, 200)]);
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
      await query(`insert into providers (studio_id, nome, aliases) values ($1, $2, $3)`, [sid, nome, aliases]);
    } else if (azione === 'medico_aggiorna') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      const nome = s(c.nome, 120); if (!nome) return NextResponse.json({ errore: 'Il nome è obbligatorio.' }, { status: 400 });
      const aliases = String(c.aliases ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
      const userId = isUuid(s(c.user_id)) ? s(c.user_id) : null;
      await query(`update providers set nome = $3, aliases = $4, user_id = $5 where id = $1 and studio_id = $2`, [id, sid, nome, aliases, userId]);
    } else if (azione === 'medico_attivo') {
      const id = s(c.id); if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
      await query('update providers set attivo = not attivo where id = $1 and studio_id = $2', [id, sid]);
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
