import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query, transazione } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { notifyConsultoRisposta } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// Consulti e affidamenti (16.9.2026), portati dalle pagine vecchie
// nell'interfaccia nuova ([[Piattaforma/Invii e consulti]]).
//
// Sono due facce della stessa cosa: un paziente che esce dallo studio o una
// domanda che entra. Il consulto è una domanda scritta di un medico
// inviante — una risposta spesso evita una visita, e quando la visita serve
// il consulto diventa una referral. L'affidamento è il contrario: un nostro
// paziente che va da qualcun altro, dentro la piattaforma o fuori.

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const sid = session.studioId;

  const consulti = await query<{
    id: string; stato: string; domanda: string; risposta: string | null; medico: string; medico_studio: string | null;
    created_at: string; answered_at: string | null; n_allegati: number; referral_id: string | null;
  }>(
    `select c.id, c.stato, c.domanda, c.risposta, d.nome as medico, d.studio as medico_studio,
            c.created_at::text, c.answered_at::text, c.converted_referral_id::text as referral_id,
            (select count(*) from consulto_attachments a where a.consulto_id = c.id)::int as n_allegati
       from consulti c join referring_doctors d on d.id = c.referring_doctor_id
      where c.studio_id = $1 and (c.stato = 'aperto' or c.created_at > now() - interval '90 days')
      order by (c.stato = 'aperto') desc, c.created_at desc limit 100`, [sid]);

  // Gli altri studi della piattaforma: in cima quelli con cui si lavora di più.
  const studi = await query<{ id: string; nome: string; specialita: string | null; amico: boolean; n_inviate: number; ultimo: string | null }>(
    `select s.id, s.nome, s.specialita, (sp.partner_studio_id is not null) as amico,
            count(r.id)::int as n_inviate, max(r.created_at)::text as ultimo
       from studios s
       left join studio_partners sp on sp.studio_id = $1 and sp.partner_studio_id = s.id
       left join referrals r on r.studio_id = s.id and r.origin_studio_id = $1
      where s.id <> $1 and s.attivo
      group by s.id, sp.partner_studio_id
      order by (sp.partner_studio_id is not null) desc, count(r.id) desc, s.nome limit 60`, [sid]);

  // La rubrica degli studi che sulla piattaforma non ci sono: si scrive a mano.
  const esterni = await query<{ id: string; nome: string; specialita: string | null; email: string | null; telefono: string | null; attivo: boolean }>(
    `select id, nome, specialita, email, telefono, attivo from external_studios where studio_id = $1 order by attivo desc, nome`, [sid]);

  return NextResponse.json({ consulti, studi, esterni, io: session.id }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const sid = session.studioId;
  const c = await req.json().catch(() => null);
  const azione = String(c?.azione ?? '');
  const testo = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

  // Uno «studio amico» sta in cima all'elenco: è solo un segnalibro.
  if (azione === 'amico') {
    const id = String(c?.id ?? '');
    if (!isUuid(id) || id === sid) return NextResponse.json({ errore: 'studio' }, { status: 400 });
    if (c?.on) await query(`insert into studio_partners (studio_id, partner_studio_id) values ($1,$2) on conflict do nothing`, [sid, id]);
    else await query(`delete from studio_partners where studio_id = $1 and partner_studio_id = $2`, [sid, id]);
    return NextResponse.json({ ok: true });
  }

  if (azione === 'esterno_crea') {
    const nome = testo(c?.nome, 120);
    if (!nome) return NextResponse.json({ errore: 'Il nome dello studio è obbligatorio.' }, { status: 400 });
    await query(
      `insert into external_studios (studio_id, nome, specialita, email, telefono) values ($1,$2,$3,$4,$5)`,
      [sid, nome, testo(c?.specialita, 80) || null, testo(c?.email, 160) || null, testo(c?.telefono, 40) || null]);
    return NextResponse.json({ ok: true });
  }

  if (azione === 'esterno_attivo') {
    const id = String(c?.id ?? '');
    if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    await query(`update external_studios set attivo = not attivo where id = $1 and studio_id = $2`, [id, sid]);
    return NextResponse.json({ ok: true });
  }

  // La risposta al consulto. L'avviso all'inviante parte solo la prima volta:
  // una correzione non è una notizia nuova.
  if (azione === 'consulto_rispondi') {
    const id = String(c?.id ?? '');
    const risposta = testo(c?.risposta, 8000);
    if (!isUuid(id) || !risposta) return NextResponse.json({ errore: 'Scrivi la risposta.' }, { status: 400 });
    const [row] = await query<{ id: string; primo: boolean }>(
      `update consulti set risposta = $3, stato = 'risposto', answered_by = $4, answered_at = coalesce(answered_at, now())
        where id = $1 and studio_id = $2 and stato in ('aperto', 'risposto')
        returning id, (answered_at = now()) as primo`, [id, sid, risposta, session.id]);
    if (!row) return NextResponse.json({ errore: 'Consulto non trovato.' }, { status: 404 });
    if (row.primo) { try { await notifyConsultoRisposta(id); } catch { /* l'avviso non blocca la risposta */ } }
    return NextResponse.json({ ok: true, primo: row.primo });
  }

  // «Serve una visita»: il consulto diventa una referral vera. La domanda
  // diventa il quesito e gli allegati seguono senza copiare i file.
  if (azione === 'consulto_converti') {
    const id = String(c?.id ?? '');
    const cognome = testo(c?.cognome, 80); const nome = testo(c?.nome, 80);
    if (!isUuid(id)) return NextResponse.json({ errore: 'id' }, { status: 400 });
    if (!cognome || !nome) return NextResponse.json({ errore: 'Servono cognome e nome del paziente.' }, { status: 400 });
    const [consulto] = await query<{ id: string; domanda: string; referring_doctor_id: string }>(
      `select id, domanda, referring_doctor_id from consulti where id = $1 and studio_id = $2 and stato in ('aperto','risposto')`, [id, sid]);
    if (!consulto) return NextResponse.json({ errore: 'Consulto non trovato.' }, { status: 404 });
    const urgenza = ['urgente', 'normale', 'programmabile'].includes(String(c?.urgenza)) ? String(c.urgenza) : 'normale';
    // Cinque scritture, un gesto solo: a metà strada resterebbero un paziente
    // orfano e un consulto ancora aperto, e il secondo clic farebbe il doppione.
    const fatto = await transazione(async (q) => {
      const [patient] = await q<{ id: string }>(
        `insert into patients (studio_id, cognome, nome, data_nascita, telefono) values ($1,$2,$3,$4,$5) returning id`,
        [sid, cognome, nome, testo(c?.data_nascita, 10) || null, testo(c?.telefono, 40) || null]);
      const [ref] = await q<{ id: string }>(
        `insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale)
         values ($1,$2,$3,$4,$5::urgenza,'ricevuta'::referral_status,'consulto') returning id`,
        [sid, patient.id, consulto.referring_doctor_id, consulto.domanda, urgenza]);
      await q(`insert into referral_status_history (referral_id, to_status, changed_by, nota) values ($1,'ricevuta'::referral_status,$2,'Creata da un consulto rapido')`, [ref.id, session.id]);
      await q(`insert into attachments (referral_id, filename, storage_key) select $1, filename, storage_key from consulto_attachments where consulto_id = $2`, [ref.id, id]);
      await q(`update consulti set stato = 'convertito', converted_referral_id = $3 where id = $1 and studio_id = $2`, [id, sid, ref.id]);
      return { referral_id: ref.id, patient_id: patient.id };
    });
    return NextResponse.json({ ok: true, ...fatto });
  }

  return NextResponse.json({ errore: 'azione_sconosciuta' }, { status: 400 });
}
