import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { mediciDelloStudio } from '@/lib/referti-medici';
import { costruisciRevisione } from '@/lib/prototipo-revisione';

export const dynamic = 'force-dynamic';

// I dati VERI dello studio nel modello del prototipo «referralflow-stack»
// (13.9.2026): utente e ruolo, medici, pazienti con cartella, agenda di oggi
// (dal robot MediOnline e dai feed), attività da fare (la stessa lista della
// Home), referti della catena, documenti, audio in coda, numeri per il bot.
// Sessione del browser; nessun dato finto.

function dCh(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function ora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function eta(dob: string | null): number | '' {
  if (!dob) return '';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '';
  const oggi = new Date();
  let e = oggi.getFullYear() - d.getFullYear();
  if (oggi < new Date(oggi.getFullYear(), d.getMonth(), d.getDate())) e--;
  return e;
}
function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const RUOLO: Record<string, string> = { segretaria: 'secretary', medico: 'doctor', admin: 'org_admin', inviante: 'secretary' };
const DOC_TYPE: Record<string, string> = { referto: 'report', ecg: 'ecg', imaging: 'imaging', lettera: 'letter', consenso: 'consent', altro: 'admin' };

export async function GET() {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  const sid = session.studioId;
  const oggiIso = new Date();
  const today = `${oggiIso.getFullYear()}-${String(oggiIso.getMonth() + 1).padStart(2, '0')}-${String(oggiIso.getDate()).padStart(2, '0')}`;

  // Medici: profili della catena + providers dell'agenda, senza doppioni per nome.
  const medici = await mediciDelloStudio(sid);
  const providers = await query<{ id: string; nome: string }>(`select id, nome from providers where studio_id = $1 and attivo order by nome`, [sid]);
  const doctors: Record<string, string> = {};
  const idPerNome = new Map<string, string>();
  for (const m of medici) { doctors[m.id] = m.nome; idPerNome.set(slug(m.nome), m.id); }
  const providerToDoc = new Map<string, string>();
  for (const p of providers) {
    const trovato = [...idPerNome.entries()].find(([s]) => slug(p.nome).includes(s) || s.includes(slug(p.nome)));
    const id = trovato ? trovato[1] : `pr-${p.id.slice(0, 8)}`;
    if (!doctors[id]) doctors[id] = p.nome;
    providerToDoc.set(p.id, id);
  }
  if (!Object.keys(doctors).length) doctors.studio = session.studioNome;

  // Pazienti con cartella: referral (quesiti, medico inviante), documenti, appuntamenti.
  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null; telefono: string | null }>(
    `select id, cognome, nome, data_nascita::text, telefono from patients where studio_id = $1 order by cognome, nome limit 500`, [sid]);
  const refs = await query<{ id: string; patient_id: string; quesito: string | null; urgenza: string; status: string; created_at: string; medico: string | null; appuntamento_at: string | null; follow_up_due: string | null }>(
    `select r.id, r.patient_id, r.quesito, r.urgenza, r.status, r.created_at::text, d.nome as medico, r.appuntamento_at::text, r.follow_up_due::text
       from referrals r left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 order by r.created_at desc limit 2000`, [sid]);
  const docs = await query<{ id: string; patient_id: string; filename: string; categoria: string; nota: string | null; uploaded_at: string }>(
    `select id, patient_id, filename, categoria, nota, uploaded_at::text from patient_documents where studio_id = $1 order by uploaded_at desc limit 2000`, [sid]);
  const appts = await query<{ id: string; provider_id: string | null; medico: string | null; starts_at: string; ends_at: string | null; titolo: string | null; paziente_nome: string | null; motivo: string | null; luogo: string | null; completed_at: string | null; referral_id: string | null }>(
    `select a.id, a.provider_id, pr.nome as medico, a.starts_at::text, a.ends_at::text, a.titolo, a.paziente_nome, a.motivo, a.luogo, a.completed_at::text, a.referral_id
       from appointments a left join providers pr on pr.id = a.provider_id
      where a.studio_id = $1 and a.starts_at >= current_date - interval '30 days' and a.starts_at < current_date + interval '30 days'
      order by a.starts_at`, [sid]);

  const perPaziente = new Map<string, typeof refs>();
  for (const r of refs) { const l = perPaziente.get(r.patient_id) ?? []; l.push(r); perPaziente.set(r.patient_id, l); }
  const docsPer = new Map<string, typeof docs>();
  for (const d of docs) { const l = docsPer.get(d.patient_id) ?? []; l.push(d); docsPer.set(d.patient_id, l); }
  const pazPerNome = new Map<string, string>();
  for (const p of pazienti) { pazPerNome.set(slug(`${p.cognome} ${p.nome}`), p.id); pazPerNome.set(slug(`${p.nome} ${p.cognome}`), p.id); }
  const apptsPer = new Map<string, typeof appts>();
  for (const a of appts) {
    const pid = a.paziente_nome ? pazPerNome.get(slug(a.paziente_nome)) : undefined;
    if (pid) { const l = apptsPer.get(pid) ?? []; l.push(a); apptsPer.set(pid, l); }
  }
  const adesso = Date.now();
  const patients = pazienti.map((p) => {
    const rr = perPaziente.get(p.id) ?? [];
    const dd = docsPer.get(p.id) ?? [];
    const aa = apptsPer.get(p.id) ?? [];
    const passati = aa.filter((a) => new Date(a.starts_at).getTime() < adesso);
    const futuri = aa.filter((a) => new Date(a.starts_at).getTime() >= adesso);
    return {
      id: p.id, num: '', first: p.nome, last: p.cognome, dob: dCh(p.data_nascita), age: eta(p.data_nascita), sex: '',
      phone: p.telefono ?? '', email: '', doctor: null, gp: rr[0]?.medico ?? '',
      flags: rr.some((r) => r.urgenza === 'urgente' && r.status !== 'chiusa') ? ['Referral urgente aperta'] : [],
      problems: rr.filter((r) => r.quesito).slice(0, 6).map((r) => ({ l: r.quesito as string, s: r.status === 'chiusa' ? 'resolved' : 'eval', since: dCh(r.created_at) })),
      meds: [], exams: [],
      docs: dd.map((d) => ({ id: d.id, t: d.nota || d.filename, d: dCh(d.uploaded_at), k: DOC_TYPE[d.categoria] ?? 'admin', new: (adesso - new Date(d.uploaded_at).getTime()) < 7 * 86400000 })),
      lastVisit: passati.length ? dCh(passati[passati.length - 1].starts_at) : '',
      next: futuri.length ? `${dCh(futuri[0].starts_at)} ${ora(futuri[0].starts_at)}` : '',
      referrals: rr.slice(0, 10).map((r) => ({ id: r.id, quesito: r.quesito, urgenza: r.urgenza, status: r.status, at: dCh(r.created_at), medico: r.medico })),
    };
  });
  const P = new Map(patients.map((p) => [p.id, p]));

  // Agenda di oggi: dal robot MediOnline e dai feed (tabella appointments).
  const stato = (a: (typeof appts)[number]) => {
    if (a.completed_at) return 'COMPLETED';
    const t = new Date(a.starts_at).getTime();
    if (t < adesso - 20 * 60000) return 'SCHEDULED';
    return 'SCHEDULED';
  };
  const apptsOggi = appts.filter((a) => a.starts_at.slice(0, 10) === today).map((a) => {
    const pid = a.paziente_nome ? pazPerNome.get(slug(a.paziente_nome)) : undefined;
    let p = pid ?? '';
    if (!p) {
      // Paziente noto solo all'agenda: entra come scheda leggera, senza cartella.
      const nome = (a.paziente_nome ?? a.titolo ?? 'Paziente').trim();
      const pezzi = nome.split(/\s+/);
      p = `ag-${a.id.slice(0, 8)}`;
      if (!P.has(p)) {
        const sched = { id: p, num: '', first: pezzi.slice(1).join(' ') || '—', last: pezzi[0] || nome, dob: '', age: '' as const, sex: '', phone: '', email: '', doctor: null, gp: '', flags: [], problems: [], meds: [], exams: [], docs: [], lastVisit: '', next: '', referrals: [] };
        patients.push(sched); P.set(p, sched);
      }
    }
    const fine = a.ends_at ? new Date(a.ends_at).getTime() : new Date(a.starts_at).getTime() + 30 * 60000;
    return {
      id: a.id, p, doc: a.provider_id ? providerToDoc.get(a.provider_id) ?? 'studio' : 'studio', room: a.luogo ?? '',
      start: ora(a.starts_at), dur: Math.max(5, Math.round((fine - new Date(a.starts_at).getTime()) / 60000)),
      reason: a.motivo || a.titolo || 'Appuntamento', type: a.motivo || 'Visita', status: stato(a),
      late: !a.completed_at && new Date(a.starts_at).getTime() < adesso - 20 * 60000, referral: a.referral_id,
    };
  });

  // Attività: la stessa lista della Home («Oggi»).
  const tasks: { id: string; title: string; p: string | null; assignee: string; prio: string; status: string; due: string; cat: string; src: string; href: string }[] = [];
  for (const r of refs.filter((x) => ['ricevuta', 'triage', 'da_prenotare'].includes(x.status)).slice(0, 40)) {
    const paz = P.get(r.patient_id);
    tasks.push({
      id: `ref-${r.id}`, title: `${r.status === 'ricevuta' ? 'Nuova richiesta' : r.status === 'triage' ? 'Triage' : 'Da prenotare'}: ${paz ? `${paz.last} ${paz.first}` : 'paziente'}${r.quesito ? ` · ${r.quesito}` : ''}`,
      p: paz ? paz.id : null, assignee: 'secretary', prio: r.urgenza === 'urgente' ? 'urgent' : 'normal', status: 'TODO',
      due: `da ${Math.max(0, Math.round((adesso - new Date(r.created_at).getTime()) / 86400000))} g`, cat: r.status === 'da_prenotare' ? 'call' : 'triage', src: 'automation', href: `/referral/${r.id}`,
    });
  }
  const disd = await query<{ id: string; appuntamento_at: string; patient_id: string }>(
    `select id, appuntamento_at::text, patient_id from referrals where studio_id = $1 and status = 'prenotata' and appt_response = 'disdetta_da_confermare' order by appuntamento_at`, [sid]);
  for (const d of disd) {
    const paz = P.get(d.patient_id);
    tasks.push({ id: `disd-${d.id}`, title: `Disdetta da confermare: ${paz ? `${paz.last} ${paz.first}` : 'paziente'} (${dCh(d.appuntamento_at)} ${ora(d.appuntamento_at)})`, p: paz?.id ?? null, assignee: 'secretary', prio: 'high', status: 'TODO', due: 'oggi', cat: 'call', src: 'automation', href: `/referral/${d.id}` });
  }
  const cons = await query<{ id: string; medico: string; created_at: string }>(
    `select c.id, d.nome as medico, c.created_at::text from consulti c join referring_doctors d on d.id = c.referring_doctor_id where c.studio_id = $1 and c.stato = 'aperto' order by c.created_at`, [sid]);
  for (const c of cons) tasks.push({ id: `cons-${c.id}`, title: `Consulto rapido da rispondere: ${c.medico}`, p: null, assignee: 'doctor', prio: 'normal', status: 'TODO', due: `da ${Math.round((adesso - new Date(c.created_at).getTime()) / 86400000)} g`, cat: 'clinical_check', src: 'automation', href: '/consulti' });
  const fups = await query<{ k: string; id: string; patient_id: string | null; nome: string | null; due: string }>(
    `select 'ref' as k, r.id, r.patient_id, null as nome, r.follow_up_due::text as due from referrals r where r.studio_id = $1 and r.follow_up_due <= current_date and r.follow_up_done_at is null
     union all select 'app' as k, a.id, null as patient_id, a.paziente_nome as nome, a.follow_up_due::text as due from appointments a where a.studio_id = $1 and a.referral_id is null and a.follow_up_due <= current_date and a.follow_up_done_at is null
     order by due limit 20`, [sid]);
  for (const f of fups) {
    const paz = f.patient_id ? P.get(f.patient_id) : undefined;
    tasks.push({ id: `fup-${f.k}-${f.id}`, title: `Richiamo scaduto: ${paz ? `${paz.last} ${paz.first}` : f.nome ?? 'paziente'} (${dCh(f.due)})`, p: paz?.id ?? null, assignee: 'secretary', prio: 'normal', status: 'TODO', due: dCh(f.due), cat: 'followup', src: 'automation', href: '/richiami' });
  }

  // Referti della catena.
  const bozze = await query<{ id: string; stato: string; tipo: string; created_at: string; testo_finale: string | null; payload: any; campi_confermati: any }>(
    `select id, stato, tipo, created_at::text, testo_finale, payload, campi_confermati from referti_bozze
      where studio_id = $1 and stato in ('bozza', 'confermata') and coalesce((payload->>'ombra')::boolean, false) = false
      order by (stato = 'bozza') desc, created_at desc limit 40`, [sid]);
  const reports = bozze.map((b) => {
    const p = b.payload ?? {};
    const campo = (k: string) => { const v = b.campi_confermati?.[k] ?? p.campi_estratti?.[k]; const s = typeof v === 'string' ? v.trim() : ''; return s && s.toLowerCase() !== 'non indicato' ? s : ''; };
    const nomePaz = campo('nome_paziente');
    let pid = nomePaz ? pazPerNome.get(slug(nomePaz)) ?? '' : '';
    if (!pid) {
      pid = `rf-${b.id.slice(0, 8)}`;
      if (!P.has(pid)) {
        const pezzi = (nomePaz || 'Paziente non indicato').split(/\s+/);
        const sched = { id: pid, num: '', first: pezzi.slice(1).join(' ') || '—', last: pezzi[0], dob: campo('data_nascita'), age: '' as const, sex: '', phone: '', email: '', doctor: null, gp: '', flags: [], problems: [], meds: [], exams: [], docs: [], lastVisit: '', next: '', referrals: [] };
        patients.push(sched); P.set(pid, sched);
      }
    }
    const rev = costruisciRevisione({ testo: (b.testo_finale ?? p.testo_corretto ?? '') as string, parole: Array.isArray(p.parole) ? p.parole : [], payload: p });
    const docId = typeof p.medico?.id === 'string' ? p.medico.id : 'studio';
    if (!doctors[docId] && typeof p.medico?.nome === 'string') doctors[docId] = p.medico.nome;
    const d = new Date(p.dettato_il ?? b.created_at);
    for (const t of tasks) if (t.id === `boz-${b.id}`) break;
    if (b.stato === 'bozza') tasks.push({ id: `boz-${b.id}`, title: `Bozza di referto da rivedere: ${nomePaz || 'paziente non indicato'}${rev.riepilogo.crit ? ` · ${rev.riepilogo.crit} critiche` : ''}`, p: pid, assignee: 'secretary', prio: rev.riepilogo.crit ? 'high' : 'normal', status: 'TODO', due: dCh(b.created_at), cat: 'send', src: 'automation', href: `/referti/${b.id}` });
    return {
      id: b.id, p: pid, doc: docId, date: dCh(b.created_at), type: b.tipo === 'visita' ? 'Visita registrata' : p.medico?.formato === 'lettera' ? 'Lettera al collega' : 'Rapporto',
      status: b.stato === 'confermata' ? 'APPROVED' : 'READY_FOR_FORMAL_REVIEW', version: b.stato === 'confermata' ? 'FINAL' : 'v1 AI',
      alerts: rev.riepilogo.crit, queue: rev.riepilogo.est,
      at: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${ora(d.toISOString())}`,
      audio: rev.audio.label, fiducia: p.fiducia?.punteggio ?? null, ...rev.riepilogo,
    };
  });

  const documents = docs.slice(0, 200).map((d) => ({
    id: d.id, t: d.nota || d.filename, p: d.patient_id, type: DOC_TYPE[d.categoria] ?? 'admin', date: dCh(d.uploaded_at),
    status: 'confirmed', conf: 'In cartella', src: 'Cartella', filename: d.filename,
  }));

  const audio = await query<{ id: string; filename: string; stato: string; fase: string | null; created_at: string; medico: string | null }>(
    `select id, filename, stato, fase, created_at::text, medico from referti_audio where studio_id = $1 and stato in ('in_coda', 'elaborazione') order by created_at desc limit 20`, [sid]);
  const audioInbox = audio.map((a) => ({ id: a.id, name: a.filename, state: 'processing', fase: a.fase ?? a.stato, at: ora(a.created_at), medico: a.medico }));

  const inbox = tasks.slice(0, 40).map((t) => ({
    id: t.id, kind: t.cat === 'send' ? 'report' : t.cat === 'call' ? 'call' : t.cat === 'followup' ? 'task' : t.cat === 'clinical_check' ? 'task' : 'alert',
    t: t.title, s: `${t.due} · ${t.src === 'automation' ? 'dalla piattaforma' : ''}`, p: t.p, tags: [t.prio === 'urgent' || t.prio === 'high' ? 'urgent' : 'today', 'mine'], acts: ['Apri'], href: t.href,
  }));

  const nome = session.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const iniz = nome.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'RF';
  const stats = {
    appuntamenti_oggi: apptsOggi.length, visti_oggi: apptsOggi.filter((a) => a.status === 'COMPLETED').length,
    bozze_da_rivedere: reports.filter((r) => r.status !== 'APPROVED').length, referti_confermati_30g: reports.filter((r) => r.status === 'APPROVED').length,
    referral_aperte: refs.filter((r) => r.status !== 'chiusa').length, urgenti: refs.filter((r) => r.urgenza === 'urgente' && !['chiusa', 'vista'].includes(r.status)).length,
    da_prenotare: refs.filter((r) => r.status === 'da_prenotare').length, disdette: disd.length, consulti_aperti: cons.length, richiami_scaduti: fups.length,
    pazienti: pazienti.length, documenti: docs.length, audio_in_coda: audio.length,
  };
  return NextResponse.json({
    utente: { role: RUOLO[session.role] ?? 'secretary', name: nome, initials: iniz, studio: session.studioNome, email: session.email },
    today, doctors, patients, appts: apptsOggi, tasks, reports, documents, inbox, audioInbox, stats,
  });
}
