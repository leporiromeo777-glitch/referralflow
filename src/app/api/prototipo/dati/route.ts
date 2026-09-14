import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { mediciDelloStudio } from '@/lib/referti-medici';
import { costruisciRevisione } from '@/lib/prototipo-revisione';
import { tipoEsame } from '@/lib/briefing-regole';
import { estraiTerapia } from '@/lib/referti-terapia';
import { abbinaPrestazione, tipoDaTesto, type VoceCatalogo } from '@/lib/prestazioni';
import { lettereRitardoGrezzo } from '@/lib/procedure';

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
const ETICHETTA_ESAME: Record<string, string> = { ecg: 'ECG', eco: 'Ecocardiogramma', holter: 'Holter', ergometria: 'Ergometria', duplex: 'Duplex', laboratorio: 'Laboratorio', referto: 'Referto di esame', altro: 'Documento' };
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
  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null; telefono: string | null; assicurazione: string | null; sesso: string | null; via: string | null; npa: string | null; localita: string | null; email: string | null; avs: string | null; n_assicurato: string | null; indicazione: string | null; percorso_id: string | null }>(
    `select id, cognome, nome, data_nascita::text, telefono, assicurazione, sesso, via, npa, localita, email, avs, n_assicurato, indicazione, percorso_id from patients where studio_id = $1 order by cognome, nome limit 500`, [sid]);
  // Terapia in corso DERIVATA: le righe di terapia dell'ultimo referto
  // confermato del paziente (per nome), mai ridigitate (14.9.2026).
  const confermati = await query<{ nome: string | null; testo: string | null; quando: string | null }>(
    `select coalesce(nullif(campi_confermati->>'nome_paziente', ''), nullif(payload->'campi_estratti'->>'nome_paziente', '')) as nome, testo_finale as testo, reviewed_at::text as quando
       from referti_bozze where studio_id = $1 and stato = 'confermata' and tipo = 'referto' and coalesce((payload->>'ombra')::boolean, false) = false
      order by reviewed_at desc nulls last limit 400`, [sid]);
  const terapiaPer = new Map<string, { righe: string[]; quando: string }>();
  for (const c of confermati) {
    if (!c.nome || !c.testo) continue;
    const k = slug(c.nome);
    if (terapiaPer.has(k)) continue;
    const righe = estraiTerapia(c.testo);
    if (righe.length) terapiaPer.set(k, { righe, quando: dCh(c.quando) });
  }
  // Fatti del grafo (migrazione 035): gli ultimi per paziente, solo relazione, oggetto e data.
  const fatti = await query<{ patient_id: string; relazione: string; oggetto: string; data_fatto: string | null; fonte_tipo: string }>(
    `select patient_id, relazione, oggetto, data_fatto::text, fonte_tipo from pazienti_fatti where studio_id = $1 order by coalesce(data_fatto, created_at::date) desc limit 1500`, [sid]);
  const fattiPer = new Map<string, typeof fatti>();
  for (const f of fatti) { const l = fattiPer.get(f.patient_id) ?? []; if (l.length < 8) l.push(f); fattiPer.set(f.patient_id, l); }
  const refs = await query<{ id: string; patient_id: string; quesito: string | null; urgenza: string; status: string; created_at: string; medico: string | null; appuntamento_at: string | null; follow_up_due: string | null }>(
    `select r.id, r.patient_id, r.quesito, r.urgenza, r.status, r.created_at::text, d.nome as medico, r.appuntamento_at::text, r.follow_up_due::text
       from referrals r left join referring_doctors d on d.id = r.referring_doctor_id
      where r.studio_id = $1 order by r.created_at desc limit 2000`, [sid]);
  const docs = await query<{ id: string; patient_id: string; filename: string; categoria: string; nota: string | null; uploaded_at: string }>(
    `select id, patient_id, filename, categoria, nota, uploaded_at::text from patient_documents where studio_id = $1 order by uploaded_at desc limit 2000`, [sid]);
  const appts = await query<{ id: string; provider_id: string | null; medico: string | null; starts_at: string; ends_at: string | null; titolo: string | null; paziente_nome: string | null; motivo: string | null; luogo: string | null; completed_at: string | null; referral_id: string | null; colore: string | null }>(
    `select a.id, a.provider_id, pr.nome as medico, a.starts_at::text, a.ends_at::text, a.titolo, a.paziente_nome, a.motivo, a.luogo, a.completed_at::text, a.referral_id, a.colore
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
      id: p.id, num: '', first: p.nome, last: p.cognome, dob: dCh(p.data_nascita), dobIso: p.data_nascita ?? '', age: eta(p.data_nascita), sex: p.sesso ?? '',
      phone: p.telefono ?? '', email: p.email ?? '', doctor: null, gp: rr[0]?.medico ?? '',
      via: p.via ?? '', npa: p.npa ?? '', localita: p.localita ?? '', avs: p.avs ?? '', n_assicurato: p.n_assicurato ?? '', indicazione: p.indicazione ?? '', percorso: p.percorso_id ?? '',
      terapia: terapiaPer.get(slug(`${p.cognome} ${p.nome}`))?.righe ?? terapiaPer.get(slug(`${p.nome} ${p.cognome}`))?.righe ?? [],
      terapiaDa: terapiaPer.get(slug(`${p.cognome} ${p.nome}`))?.quando ?? terapiaPer.get(slug(`${p.nome} ${p.cognome}`))?.quando ?? '',
      fatti: (fattiPer.get(p.id) ?? []).map((f) => ({ relazione: f.relazione, oggetto: f.oggetto, data: dCh(f.data_fatto), fonte: f.fonte_tipo })),
      flags: rr.some((r) => r.urgenza === 'urgente' && r.status !== 'chiusa') ? ['Referral urgente aperta'] : [],
      problems: rr.filter((r) => r.quesito).slice(0, 6).map((r) => ({ l: r.quesito as string, s: r.status === 'chiusa' ? 'resolved' : 'eval', since: dCh(r.created_at) })),
      meds: [],
      // Sezione «Esami» della scheda: i documenti della cartella che sono esami
      // (tutto tranne lettere e consensi), con il tipo riconosciuto e l'id per aprirli.
      exams: dd.filter((d) => !['lettera', 'consenso'].includes(d.categoria)).map((d) => {
        const k = tipoEsame(d);
        return { id: d.id, t: d.nota || d.filename, d: dCh(d.uploaded_at), r: ETICHETTA_ESAME[k] ?? 'Documento', k, filename: d.filename };
      }),
      docs: dd.map((d) => ({ id: d.id, t: d.nota || d.filename, d: dCh(d.uploaded_at), k: DOC_TYPE[d.categoria] ?? 'admin', new: (adesso - new Date(d.uploaded_at).getTime()) < 7 * 86400000 })),
      assicurazione: p.assicurazione ?? '',
      // Tutte le visite in agenda del paziente (passate e future), per la scheda.
      visits: aa.map((a) => ({ id: a.id, d: dCh(a.starts_at), ora: ora(a.starts_at), medico: a.medico ?? '', motivo: a.motivo ?? a.titolo ?? '', fatta: !!a.completed_at || new Date(a.starts_at).getTime() < adesso, futura: new Date(a.starts_at).getTime() >= adesso })),
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
  // Tutta la finestra (±30 giorni) per la pagina Agenda con il cambio di giorno;
  // Catalogo delle prestazioni (migrazione 042): ogni appuntamento prova ad
  // abbinare il motivo a una voce; senza voce il tipo si stima dal testo.
  const catalogo = await query<VoceCatalogo>(`select id, nome, tipo, durata_min, sala, parole_chiave, attivo from prestazioni_catalogo where studio_id = $1 and attivo order by nome`, [sid]);
  // le schede leggere dei pazienti noti solo all'agenda si creano solo per oggi.
  const agenda = appts.map((a) => {
    const oggi = a.starts_at.slice(0, 10) === today;
    const pid = a.paziente_nome ? pazPerNome.get(slug(a.paziente_nome)) : undefined;
    let p = pid ?? '';
    const nomeGrezzo = (a.paziente_nome ?? a.titolo ?? '').trim();
    // Una scheda leggera per NOME (non per appuntamento: la stessa persona con
    // due visite era due righe) e solo se il titolo somiglia a un nome
    // («in vacanza» o note in minuscolo restano appuntamenti senza scheda).
    if (!p && oggi && nomeGrezzo && /^[A-ZÀ-Ý]/.test(nomeGrezzo)) {
      // Paziente noto solo all'agenda: entra come scheda leggera, senza cartella.
      const nome = nomeGrezzo;
      const pezzi = nome.split(/\s+/);
      p = `ag-${slug(nome).slice(0, 48)}`;
      if (!P.has(p)) {
        const sched = { id: p, num: '', first: pezzi.slice(1).join(' ') || '—', last: pezzi[0] || nome, dob: '', dobIso: '', age: '' as const, sex: '', phone: '', email: '', doctor: null, gp: '', via: '', npa: '', localita: '', avs: '', n_assicurato: '', indicazione: '', percorso: '', terapia: [] as string[], terapiaDa: '', fatti: [] as { relazione: string; oggetto: string; data: string; fonte: string }[], flags: [], problems: [], meds: [], exams: [], docs: [], lastVisit: '', next: '', referrals: [], assicurazione: '', visits: [] };
        patients.push(sched); P.set(p, sched);
      }
    }
    const fine = a.ends_at ? new Date(a.ends_at).getTime() : new Date(a.starts_at).getTime() + 30 * 60000;
    return {
      id: a.id, p, nome: (a.paziente_nome ?? a.titolo ?? 'Paziente').trim(), d: a.starts_at.slice(0, 10), doc: a.provider_id ? providerToDoc.get(a.provider_id) ?? 'studio' : 'studio', room: a.luogo ?? '', colore: a.colore ?? '',
      start: ora(a.starts_at), dur: Math.max(5, Math.round((fine - new Date(a.starts_at).getTime()) / 60000)),
      reason: a.motivo || a.titolo || 'Appuntamento', type: a.motivo || 'Visita', status: stato(a),
      prestazione: abbinaPrestazione(catalogo, `${a.motivo ?? ''} ${a.titolo ?? ''}`)?.nome ?? '', tipoPrest: abbinaPrestazione(catalogo, `${a.motivo ?? ''} ${a.titolo ?? ''}`)?.tipo ?? tipoDaTesto(`${a.motivo ?? ''} ${a.titolo ?? ''}`),
      late: oggi && !a.completed_at && new Date(a.starts_at).getTime() < adesso - 20 * 60000, referral: a.referral_id,
    };
  });
  const apptsOggi = agenda.filter((a) => a.d === today);

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
        const sched = { id: pid, num: '', first: pezzi.slice(1).join(' ') || '—', last: pezzi[0], dob: campo('data_nascita'), dobIso: '', age: '' as const, sex: '', phone: '', email: '', doctor: null, gp: '', via: '', npa: '', localita: '', avs: '', n_assicurato: '', indicazione: '', percorso: '', terapia: [] as string[], terapiaDa: '', fatti: [] as { relazione: string; oggetto: string; data: string; fonte: string }[], flags: [], problems: [], meds: [], exams: [], docs: [], lastVisit: '', next: '', referrals: [], assicurazione: '', visits: [] };
        patients.push(sched); P.set(pid, sched);
      }
    }
    const rev = costruisciRevisione({ testo: (b.testo_finale ?? p.testo_corretto ?? '') as string, parole: Array.isArray(p.parole) ? p.parole : [], payload: p });
    // Revisione fatta nel prototipo e salvata: contano solo le verifiche ancora aperte.
    const rp = p.revisione_prototipo && typeof p.revisione_prototipo === 'object' ? p.revisione_prototipo : null;
    let rivisto: { quando: string; chiuse: number; correzioni: number } | null = null;
    if (rp && Array.isArray(rp.issues)) {
      const statoPer = new Map<string, string>(rp.issues.filter((x: any) => x && typeof x.id === 'string').map((x: any) => [x.id, String(x.status ?? 'open')]));
      const aperte = rev.issues.filter((i) => (statoPer.get(i.id) ?? 'open') === 'open');
      const crit = aperte.filter((i) => i.sev === 'critical').length;
      rivisto = { quando: dCh(rp.salvato_il) + (rp.salvato_il ? ` ${ora(rp.salvato_il)}` : ''), chiuse: rev.issues.length - aperte.length, correzioni: Number(rp.metrics?.corrections ?? 0) };
      rev.riepilogo = { issues: aperte.length, crit, state: crit > 0 ? 'priority' : aperte.length > 0 ? 'some' : 'clean', note: `Rivisto ${rivisto.quando} · ${rivisto.chiuse} verifiche chiuse${aperte.length ? ` · ${aperte.length} aperte` : ''} · da confermare`, est: `${Math.max(1, Math.round(aperte.length * 0.6))} min` };
    }
    const docId = typeof p.medico?.id === 'string' ? p.medico.id : 'studio';
    if (!doctors[docId] && typeof p.medico?.nome === 'string') doctors[docId] = p.medico.nome;
    const d = new Date(p.dettato_il ?? b.created_at);
    for (const t of tasks) if (t.id === `boz-${b.id}`) break;
    if (b.stato === 'bozza') tasks.push({ id: `boz-${b.id}`, title: `Bozza di referto da rivedere: ${nomePaz || 'paziente non indicato'}${rev.riepilogo.crit ? ` · ${rev.riepilogo.crit} critiche` : ''}`, p: pid, assignee: 'secretary', prio: rev.riepilogo.crit ? 'high' : 'normal', status: 'TODO', due: dCh(b.created_at), cat: 'send', src: 'automation', href: `/referti/${b.id}` });
    return {
      id: b.id, p: pid, doc: docId, date: dCh(b.created_at), type: b.tipo === 'visita' ? 'Visita registrata' : p.medico?.formato === 'lettera' ? 'Lettera al collega' : 'Rapporto',
      status: b.stato === 'confermata' ? 'APPROVED' : 'READY_FOR_FORMAL_REVIEW', version: b.stato === 'confermata' ? 'FINAL' : rivisto ? 'v2 rivisto' : 'v1 AI', rivisto,
      alerts: rev.riepilogo.crit, queue: rev.riepilogo.est,
      at: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${ora(d.toISOString())}`,
      audio: rev.audio.label, fiducia: p.fiducia?.punteggio ?? null, ...rev.riepilogo,
    };
  });

  const documents = docs.slice(0, 200).map((d) => ({
    id: d.id, t: d.nota || d.filename, p: d.patient_id, type: DOC_TYPE[d.categoria] ?? 'admin', date: dCh(d.uploaded_at),
    status: 'confirmed', conf: 'In cartella', src: 'Cartella', filename: d.filename,
  }));

  // Audio della catena: in coda, in elaborazione e quelli finiti nelle ultime
  // 24 ore con l'esito: bozza nuova, oppure «già dettato» quando la piattaforma
  // ha riconosciuto un duplicato (la bozza collegata è più vecchia dell'audio).
  const audio = await query<{ id: string; filename: string; stato: string; fase: string | null; created_at: string; medico: string | null; bozza_id: string | null; bozza_stato: string | null; bozza_creata: string | null; bozza_paziente: string | null }>(
    `select a.id, a.filename, a.stato, a.fase, a.created_at::text, a.medico, a.bozza_id, b.stato as bozza_stato, b.created_at::text as bozza_creata,
            coalesce(nullif(b.campi_confermati->>'nome_paziente', ''), nullif(b.payload->'campi_estratti'->>'nome_paziente', '')) as bozza_paziente
       from referti_audio a left join referti_bozze b on b.id = a.bozza_id
      where a.studio_id = $1 and (a.stato in ('in_coda', 'elaborazione') or (a.stato = 'fatto' and a.created_at > now() - interval '24 hours'))
      order by a.created_at desc limit 20`, [sid]);
  const audioInbox = audio.map((a) => {
    const duplicato = !!(a.bozza_id && a.bozza_creata && new Date(a.bozza_creata).getTime() < new Date(a.created_at).getTime() - 60_000);
    const state = a.stato === 'fatto' ? (a.bozza_id ? (duplicato ? 'duplicate' : 'ready') : 'failed') : 'processing';
    return { id: a.id, name: a.filename, state, fase: a.fase ?? a.stato, at: ora(a.created_at), medico: a.medico, bozza: a.bozza_id, bozzaStato: a.bozza_stato, bozzaData: dCh(a.bozza_creata), paziente: a.bozza_paziente };
  });

  const inbox = tasks.slice(0, 40).map((t) => ({
    id: t.id, kind: t.cat === 'send' ? 'report' : t.cat === 'call' ? 'call' : t.cat === 'followup' ? 'task' : t.cat === 'clinical_check' ? 'task' : 'alert',
    t: t.title, s: `${t.due} · ${t.src === 'automation' ? 'dalla piattaforma' : ''}`, p: t.p, tags: [t.prio === 'urgent' || t.prio === 'high' ? 'urgent' : 'today', 'mine'], acts: ['Apri'], href: t.href,
  }));

  const nome = session.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const iniz = nome.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'RF';
  // Cruscotto (14.9.2026): sale di oggi con l'occupazione, chi ha agenda oggi,
  // accessi attivi, visti senza referto e lettere in ritardo (stessa regola
  // della procedura). Solo conteggi e nomi di sala: nessun testo clinico.
  const risorse = await query<{ id: string; tipo: string; nome: string; attivo: boolean; posti: number }>(
    `select id, tipo, nome, attivo, posti from studio_risorse where studio_id = $1 and attivo order by tipo, nome`, [sid]);
  const [acc] = await query<{ attivi: number }>(`select count(*)::int as attivi from users where studio_id = $1 and attivo`, [sid]);
  const nomeRisorsa = new Map(risorse.map((r) => [r.nome.toLowerCase(), r]));
  const perSala = new Map<string, { nome: string; tipo: string; posti: number | null; n: number; minuti: number; prima: string; occupataOra: boolean; prossima: string }>();
  const hm = ora(oggiIso.toISOString());
  for (const a of apptsOggi) {
    const codice = (a.room || '').trim();
    if (!codice) continue;
    const r = nomeRisorsa.get(codice.toLowerCase());
    const k = codice.toLowerCase();
    const e = perSala.get(k) ?? { nome: r?.nome ?? codice, tipo: r?.tipo ?? 'codice', posti: r ? r.posti : null, n: 0, minuti: 0, prima: '', occupataOra: false, prossima: '' };
    e.n++; e.minuti += a.dur;
    if (!e.prima || a.start < e.prima) e.prima = a.start;
    const fineA = (() => { const [h, m] = a.start.split(':').map(Number); const t = h * 60 + m + a.dur; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
    if (a.start <= hm && hm < fineA && a.status !== 'CANCELLED') e.occupataOra = true;
    if (a.start > hm && a.status !== 'CANCELLED' && (!e.prossima || a.start < e.prossima)) e.prossima = a.start;
    perSala.set(k, e);
  }
  for (const r of risorse) if (r.tipo === 'sala' && !perSala.has(r.nome.toLowerCase())) perSala.set(r.nome.toLowerCase(), { nome: r.nome, tipo: 'sala', posti: r.posti, n: 0, minuti: 0, prima: '', occupataOra: false, prossima: '' });
  const sale = [...perSala.values()].sort((a, b) => b.minuti - a.minuti || a.nome.localeCompare(b.nome));
  const refertiOggiPer = new Set(reports.filter((r) => r.date === dCh(oggiIso.toISOString())).map((r) => r.p));
  const vistiSenzaReferto = apptsOggi.filter((a) => a.status === 'COMPLETED' && a.p && !refertiOggiPer.has(a.p)).length;
  let lettereInRitardo = 0;
  try { lettereInRitardo = (await lettereRitardoGrezzo(sid)).fonti.length; } catch (e) { console.warn('[prototipo/dati] lettere in ritardo non calcolate:', (e as Error).message); }
  const stats = {
    appuntamenti_oggi: apptsOggi.length, visti_oggi: apptsOggi.filter((a) => a.status === 'COMPLETED').length,
    visti_senza_referto: vistiSenzaReferto, lettere_in_ritardo: lettereInRitardo, accessi_attivi: acc?.attivi ?? 0,
    medici_oggi: [...new Set(apptsOggi.map((a) => a.doc).filter((d) => d && d !== 'studio'))].length,
    bozze_da_rivedere: reports.filter((r) => r.status !== 'APPROVED').length, referti_confermati_30g: reports.filter((r) => r.status === 'APPROVED').length,
    referral_aperte: refs.filter((r) => r.status !== 'chiusa').length, urgenti: refs.filter((r) => r.urgenza === 'urgente' && !['chiusa', 'vista'].includes(r.status)).length,
    da_prenotare: refs.filter((r) => r.status === 'da_prenotare').length, disdette: disd.length, consulti_aperti: cons.length, richiami_scaduti: fups.length,
    pazienti: pazienti.length, documenti: docs.length, audio_in_coda: audio.length,
  };
  return NextResponse.json({
    utente: { role: RUOLO[session.role] ?? 'secretary', name: nome, initials: iniz, studio: session.studioNome, email: session.email },
    today, doctors, patients, appts: apptsOggi, agenda, tasks, reports, documents, inbox, audioInbox, stats, sale,
    risorse: risorse.map((r) => ({ id: r.id, tipo: r.tipo, nome: r.nome, posti: r.posti })),
    catalogo,
  });
}
