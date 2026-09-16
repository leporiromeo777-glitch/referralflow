import { NextResponse, type NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { abbina, buchi, frase, giornoItaliano as giornoTesto, hm as oraTesto, perQuestoBuco, perQuestoPaziente, type Appunt, type Candidato } from '@/lib/agenda-buchi';
import { medicoAbilitato, costruisciGrafo } from '@/lib/orchestrazione/grafo';

export const dynamic = 'force-dynamic';

// Richiami e buchi in agenda (16.9.2026).
//
// GET  → chi va richiamato, dove ci sono buchi nei prossimi giorni, e la
//        proposta di chi potrebbe entrarci. Tutto calcolato dal codice
//        ([[src/lib/agenda-buchi]]): il modello locale non decide niente.
// POST → le azioni di una persona: «fatto», «rimanda», «nuovo richiamo»,
//        «ho chiamato», e la frase per il telefono scritta dal modello locale.
//
// L'agenda della Cassa dei Medici resta in sola lettura: qui non si prenota
// nulla, si dice a chi prenota che cosa varrebbe la pena prenotare.

const MIN = (d: Date) => d.getHours() * 60 + d.getMinutes();
const ISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function grafo() {
  try {
    const dir = process.cwd();
    return costruisciGrafo({
      mdPrestazioni: readFileSync(path.join(dir, 'docs/wiki/Medici/Prestazioni e sale.md'), 'utf-8'),
      mdSale: readFileSync(path.join(dir, 'docs/wiki/Medici/Sale.md'), 'utf-8'),
    });
  } catch {
    return null;
  }
}

async function raccogli(studioId: string, giorni: number) {
  const g = grafo();
  const catalogo = await query<{ nome: string; durata_min: number }>(
    `select nome, durata_min from prestazioni_catalogo where studio_id = $1 and attivo`, [studioId]);
  const durataDi = (p: string | null) => {
    if (!p) return 30;
    const c = catalogo.find((x) => x.nome.toLowerCase() === p.toLowerCase());
    if (c) return c.durata_min;
    const w = g?.prestazioni.find((x) => x.nome.toLowerCase() === p.toLowerCase());
    return w?.durata ?? 30;
  };

  // ── i buchi: dall'agenda vera, da oggi in avanti ──────────────────────────
  const app = await query<{ id: string; medico: string | null; starts_at: string; ends_at: string | null }>(
    `select a.id, p.nome as medico, a.starts_at::text, a.ends_at::text
       from appointments a left join providers p on p.id = a.provider_id
      where a.studio_id = $1
        and a.starts_at >= date_trunc('day', now())
        and a.starts_at < date_trunc('day', now()) + ($2::int || ' days')::interval
      order by a.starts_at`, [studioId, giorni]);
  const appunti: Appunt[] = app.map((a) => {
    const i = new Date(a.starts_at); const f = a.ends_at ? new Date(a.ends_at) : new Date(i.getTime() + 30 * 60000);
    return { id: a.id, medico: a.medico ?? '', giorno: ISO(i), inizio: MIN(i), fine: MIN(f) };
  });
  const b = buchi(appunti);

  // ── i candidati: chi aspetta una data ─────────────────────────────────────
  const rich = await query<{
    id: string; tipo: string; patient_id: string; paziente: string; scadenza: string; giorni_ritardo: number;
    quesito: string | null; medico: string | null; prestazione: string | null;
  }>(
    `select r.id, 'richiamo' as tipo, r.patient_id, (pa.cognome || ' ' || pa.nome) as paziente,
            r.follow_up_due::text as scadenza, (current_date - r.follow_up_due) as giorni_ritardo,
            r.quesito, null::text as medico, null::text as prestazione
       from referrals r join patients pa on pa.id = r.patient_id
      where r.studio_id = $1 and r.follow_up_due is not null and r.follow_up_done_at is null
        and r.follow_up_due <= current_date + 60
     union all
     select a.id, 'richiamo', pa.id, (pa.cognome || ' ' || pa.nome),
            a.follow_up_due::text, (current_date - a.follow_up_due), a.motivo, pr.nome, a.motivo
       from appointments a
       join patients pa on lower(pa.cognome || ' ' || pa.nome) = lower(a.paziente_nome)
       left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.follow_up_due is not null and a.follow_up_done_at is null
        and a.follow_up_due <= current_date + 60
     union all
     select r.id, 'da_prenotare', r.patient_id, (pa.cognome || ' ' || pa.nome),
            null, 0, r.quesito, null, null
       from referrals r join patients pa on pa.id = r.patient_id
      where r.studio_id = $1 and r.status = 'da_prenotare'::referral_status
      order by giorni_ritardo desc nulls last
      limit 60`, [studioId]);

  // Il medico e la prestazione «di solito»: dall'ultimo appuntamento vero del
  // paziente. Una proposta senza il medico giusto vale la metà.
  const ids = [...new Set(rich.map((r) => r.patient_id).filter(Boolean))];
  const ultimi = ids.length ? await query<{ patient_id: string; medico: string | null; prestazione: string | null }>(
    `select distinct on (pa.id) pa.id as patient_id, pr.nome as medico, a.motivo as prestazione
       from patients pa
       join appointments a on lower(a.paziente_nome) = lower(pa.cognome || ' ' || pa.nome) and a.studio_id = pa.studio_id
       left join providers pr on pr.id = a.provider_id
      where pa.id = any($1::uuid[]) and a.starts_at < now()
      order by pa.id, a.starts_at desc`, [ids]) : [];
  const ultimoDi = new Map(ultimi.map((u) => [u.patient_id, u]));

  const candidati: Candidato[] = rich.map((r) => {
    const u = ultimoDi.get(r.patient_id);
    const prestazione = r.prestazione || u?.prestazione || null;
    return {
      id: `${r.tipo}:${r.id}`, tipo: r.tipo === 'da_prenotare' ? 'da_prenotare' : 'richiamo',
      paziente: r.paziente, patientId: r.patient_id, prestazione,
      durata: durataDi(prestazione), medico: r.medico || u?.medico || null,
      scadenza: r.scadenza ?? null, giorniDiRitardo: Math.max(0, Number(r.giorni_ritardo) || 0),
      quesito: r.quesito,
    };
  });

  const puoFare = g ? (medico: string, prestazione: string | null) => !prestazione || medicoAbilitato(g, medico, prestazione) : undefined;
  const proposte = abbina(b, candidati, { puoFare });
  const chiamate = await query<{ origine_id: string; esito: string; at: string }>(
    `select origine_id::text, esito, created_at::text as at from richiami_telefonate
      where studio_id = $1 and created_at > now() - interval '30 days'`, [studioId]);
  return { b, candidati, proposte, puoFare, chiamate };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const giorni = Math.min(21, Math.max(1, Number(new URL(req.url).searchParams.get('giorni') ?? 7)));
  const { b, candidati, proposte, chiamate } = await raccogli(session.studioId, giorni);
  return NextResponse.json({
    giorni,
    buchi: b,
    candidati,
    proposte: proposte.map((p) => ({ ...p, frase: frase(p) })),
    chiamate,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const sid = session.studioId;

  // «È fatto»: il richiamo esce dalla lista. Vale sia per le referral sia per
  // gli appuntamenti, che portano gli stessi campi.
  if (azione === 'fatto' || azione === 'rimanda') {
    const rif = String(c?.id ?? '');
    const [tipo, id] = rif.includes(':') ? rif.split(':') : ['richiamo', rif];
    if (!id) return NextResponse.json({ errore: 'id mancante' }, { status: 400 });
    const mesi = Math.min(24, Math.max(1, Number(c?.mesi ?? 1)));
    for (const tab of ['referrals', 'appointments']) {
      if (azione === 'fatto') await query(`update ${tab} set follow_up_done_at = now() where id = $1 and studio_id = $2`, [id, sid]);
      else await query(`update ${tab} set follow_up_due = coalesce(follow_up_due, current_date) + ($3::int || ' months')::interval where id = $1 and studio_id = $2`, [id, sid, mesi]);
    }
    return NextResponse.json({ ok: true, tipo });
  }

  // Un richiamo nuovo, scritto da una persona: «questo paziente lo rivedo fra
  // sei mesi». Nasce come referral da prenotare, che è dove lo studio tiene
  // le cose da fissare.
  if (azione === 'nuovo') {
    const patientId = String(c?.patient_id ?? '');
    const mesi = Math.min(120, Math.max(1, Number(c?.mesi ?? 6)));
    if (!patientId) return NextResponse.json({ errore: 'paziente mancante' }, { status: 400 });
    const [paz] = await query<{ id: string }>(`select id from patients where id = $1 and studio_id = $2`, [patientId, sid]);
    if (!paz) return NextResponse.json({ errore: 'paziente non trovato' }, { status: 404 });
    const quesito = String(c?.motivo ?? '').trim().slice(0, 200) || `Visita di controllo (richiamo a ${mesi} mesi)`;
    const [nuova] = await query<{ id: string; due: string }>(
      `insert into referrals (studio_id, patient_id, quesito, urgenza, status, canale, follow_up_months, follow_up_due)
       values ($1,$2,$3,'normale'::urgenza,'da_prenotare'::referral_status,'richiamo',$4, current_date + ($4::int || ' months')::interval)
       returning id, follow_up_due::text as due`, [sid, patientId, quesito, mesi]);
    await query(`insert into referral_status_history (referral_id, to_status, changed_by, nota) values ($1,'da_prenotare'::referral_status,$2,'Richiamo creato a mano')`, [nuova.id, session.id]);
    return NextResponse.json({ ok: true, id: nuova.id, scadenza: nuova.due });
  }

  // «Ho chiamato»: resta scritto chi, quando, per quale buco e com'è andata.
  if (azione === 'chiamato') {
    const rif = String(c?.id ?? '');
    const [origine, id] = rif.includes(':') ? rif.split(':') : ['richiamo', rif];
    const esito = ['chiamato', 'fissato', 'non risponde', 'rifiutato'].includes(String(c?.esito)) ? String(c.esito) : 'chiamato';
    await query(
      `insert into richiami_telefonate (studio_id, patient_id, origine, origine_id, buco_giorno, buco_dalle, buco_medico, esito, nota, user_id)
       values ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10)`,
      [sid, c?.patient_id || null, origine, id || null, c?.giorno || null, c?.dalle ?? null, c?.medico || null, esito, String(c?.nota ?? '').slice(0, 500) || null, session.id]);
    // Se l'appuntamento è stato fissato, il richiamo è chiuso.
    if (esito === 'fissato' && id) {
      for (const tab of ['referrals', 'appointments']) await query(`update ${tab} set follow_up_done_at = now() where id = $1 and studio_id = $2`, [id, sid]);
    }
    return NextResponse.json({ ok: true });
  }

  // Le alternative: chi altro entrerebbe in questo buco, o dove altro
  // entrerebbe questo paziente. Stessa regola, guardata dai due lati.
  if (azione === 'alternative') {
    const { b, candidati, puoFare } = await raccogli(sid, Math.min(21, Math.max(1, Number(c?.giorni ?? 7))));
    if (c?.buco) {
      const q = b.find((x) => x.giorno === c.buco.giorno && x.dalle === c.buco.dalle && x.medico === c.buco.medico);
      if (!q) return NextResponse.json({ errore: 'buco non trovato' }, { status: 404 });
      const alt = perQuestoBuco(q, candidati, puoFare);
      return NextResponse.json({ ok: true, alternative: alt.map((p) => ({ ...p, frase: frase(p) })) });
    }
    const cand = candidati.find((x) => x.id === String(c?.id ?? ''));
    if (!cand) return NextResponse.json({ errore: 'candidato non trovato' }, { status: 404 });
    const alt = perQuestoPaziente(cand, b, puoFare);
    return NextResponse.json({ ok: true, alternative: alt.map((p) => ({ ...p, frase: frase(p) })) });
  }

  // La frase da dire al telefono: la scrive il modello LOCALE, e solo quella.
  // I fatti (chi, quando, con chi, perché) li ha già decisi il codice: al
  // modello si chiede di metterli in una frase che una persona possa leggere
  // mentre compone il numero. Se il modello non c'è, resta la frase del codice.
  if (azione === 'telefonata') {
    const p = c?.proposta;
    if (!p?.candidato || !p?.buco) return NextResponse.json({ errore: 'proposta mancante' }, { status: 400 });
    const fatti = [
      `paziente: ${String(p.candidato.paziente ?? '').slice(0, 80)}`,
      `motivo: ${p.candidato.tipo === 'richiamo' ? 'visita di controllo programmata' : 'appuntamento da fissare'}`,
      p.candidato.prestazione ? `prestazione: ${String(p.candidato.prestazione).slice(0, 60)}` : '',
      `quando: ${giornoTesto(p.buco.giorno)} dalle ${oraTesto(p.buco.dalle)} alle ${oraTesto(p.buco.alle)}`,
      `medico: ${String(p.buco.medico ?? '').slice(0, 60)}`,
    ].filter(Boolean).join('\n');
    const prompt = `Sei la segretaria di uno studio cardiologico in Ticino. Scrivi in italiano, dando del lei, quello che dirai al telefono a questo paziente per proporgli l'appuntamento. Al massimo tre frasi, niente saluti finali, niente formule di cortesia lunghe, nessun dato clinico oltre a quello scritto qui. Non inventare nulla che non sia nei fatti.\n\nFATTI:\n${fatti}`;
    const { generaOllamaEsito } = await import('@/lib/ollama');
    const esito = await generaOllamaEsito(prompt, { modello: process.env.PROTOTIPO_LLM || 'gemma3:12b', timeoutMs: 60_000 });
    if (!esito.ok) return NextResponse.json({ ok: true, testo: null, causa: esito.causa });
    return NextResponse.json({ ok: true, testo: esito.testo.trim().slice(0, 600), ms: esito.ms });
  }

  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}
