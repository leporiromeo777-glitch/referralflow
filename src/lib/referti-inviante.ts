import 'server-only';
import { query } from './db';
import {
  destinatarioAffidabile, destinatarioDalSaluto, paroleCognome, paroleNome, scegliInRubrica, type RigaRubrica,
} from './referti-lettera';
import { copieDalCampo, copieDalDettato, type VoceCopia } from './referti-copia';
import { citaECG, citatoNelTesto, etichettaDocumento, scegliECG } from './referti-allegato-blocco';
import { agganciaRiferimenti, trovaPaziente } from './referti-allegati';

// Il referto e le persone attorno (26.9.2026): medico inviante collegato alla
// rubrica, copia per conoscenza, allegati (ECG compreso). Una sola funzione
// calcola tutto per la pagina di revisione E per il Word, così quel che si
// vede è quel che si stampa. Nei log solo id abbreviati e conteggi.

export type RigaInviante = RigaRubrica & { id: string; via: string | null; npa: string | null; localita: string | null; telefono: string | null };
export type StatoInviante = 'collegato' | 'nuovo' | 'ambiguo' | null;

export async function rubricaInvianti(studioId: string): Promise<RigaInviante[]> {
  return query<RigaInviante>(
    `select rd.id, rd.nome, rd.email, rd.studio, coalesce(nullif(ip.specialita, ''), rd.specialita) as specialita,
            rd.via, rd.npa, rd.localita, rd.telefono
       from referring_doctors rd
       left join users u on lower(u.email) = lower(rd.email) and u.role = 'inviante'
       left join inviante_profiles ip on ip.user_id = u.id
      where rd.studio_id = $1 order by rd.nome`, [studioId]);
}

export function indirizzoDi(r: { via: string | null; npa: string | null; localita: string | null }): string {
  return [r.via, [r.npa, r.localita].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// Chi è l'inviante secondo il referto (26.9.2026, dallo studio): il medico lo
// dice SEMPRE nella prima frase del dettato («lettera al dottor Rossi…»), la
// frase di regia che la segretaria poi toglie; quindi si guarda prima lì, nel
// testo della catena prima della revisione. Poi il campo «inviante», il
// destinatario se il testo lo sostiene, il saluto. Un nome che è del medico
// che detta non vale mai: il «Marco» in fondo è la firma di Marco Moccetti.
const RX_TITOLO_NOME = /\b(?:collega|dottor|dottore|dottoressa|dott\.?(?:ssa)?|dr\.?(?:ssa)?|prof\.?(?:essor(?:e|essa))?)\s+(?:med\.?\s+)?((?:[A-ZÀ-Ý][\p{L}'’-]*|d[aei]|de|del|della|von|van)(?:\s+(?:[A-ZÀ-Ý][\p{L}'’-]*|d[aei]|de|del|della|von|van)){0,3})/gu;

export function primaFrase(testo: string): string {
  const t = String(testo || '').replace(/\b(dr|dott|prof|med|sig|dr\.?ssa|dott\.?ssa)\./gi, '$1 ').trim();
  const fine = t.search(/[.!?\n]/);
  return (fine >= 0 ? t.slice(0, fine) : t).slice(0, 300);
}

export function diChiDetta(nome: string, dettante: string): boolean {
  const a = paroleNome(nome), d = new Set(paroleNome(dettante));
  return a.length > 0 && d.size > 0 && a.every((w) => d.has(w));
}

export function nomiDallaPrimaFrase(testo: string): string[] {
  const out: string[] = [];
  for (const m of primaFrase(testo).matchAll(RX_TITOLO_NOME)) {
    const parole = m[1].split(/\s+/);
    while (parole.length && !/^[A-ZÀ-Ý]/.test(parole[parole.length - 1])) parole.pop();
    if (parole.some((w) => /^[A-ZÀ-Ý]/.test(w))) out.push(parole.join(' '));
  }
  return out;
}

export function nomeInviante(testo: string, campo: (k: string) => string, grezzo = '', dettante = ''): string {
  const valido = (n: string) => !!n && paroleNome(n).length > 0 && !diChiDetta(n, dettante);
  for (const n of nomiDallaPrimaFrase(grezzo)) if (valido(n)) return n;
  const inv = campo('medico_inviante');
  if (valido(inv)) return inv;
  const dest = campo('medico_destinatario');
  if (valido(dest) && destinatarioAffidabile(testo, dest)) return dest;
  const saluto = destinatarioDalSaluto(testo)?.nome ?? '';
  return valido(saluto) ? saluto : '';
}

// collegato = uno solo in rubrica; ambiguo = qualcuno può essere lui ma non
// si può dire chi (omonimi, nome di battesimo diverso, solo il nome di
// battesimo nel saluto); nuovo = nessuno.
// `interni` sono i medici dello studio stesso: il referto a volte nomina chi
// lo detta («Dr. Moccetti»), e quel nome non deve diventare l'inviante. Se il
// nome è di un medico dello studio: nessun inviante; se è anche in rubrica
// (Deborah Moccetti Bernasconi), decide una persona.
// Distanza di battitura (Levenshtein).
export function distanza(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prec = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prec + (a[i - 1] === b[j - 1] ? 0 : 1)); prec = t; }
  }
  return d[b.length];
}

// Un cognome scritto male dal motore («Bonomi» per Bonomo): al più una
// lettera diversa fino a 6 lettere, due oltre. Sui 29 «nuovi» del 26.9.2026,
// 13 erano così. Mai collegati da soli: diventano una proposta.
export function cognomeSimile(a: string, b: string): boolean {
  if (!a || !b || a === b || a[0] !== b[0]) return false;
  const lim = Math.max(a.length, b.length) >= 7 ? 2 : 1;
  return Math.abs(a.length - b.length) <= lim && distanza(a, b) <= lim;
}

export function statoInviante<T extends RigaRubrica>(nome: string, righe: T[], interni: RigaRubrica[] = []): { stato: StatoInviante; riga: T | null; candidati: T[]; simili?: boolean } {
  const parole = paroleNome(nome);
  if (!parole.length) return { stato: null, riga: null, candidati: [] };
  const interno = interni.length > 0 && scegliInRubrica(nome, interni) !== null;
  const riga = scegliInRubrica(nome, righe);
  // Nome di un medico dello studio: in rubrica conta solo se ci corrisponde
  // anche lì (allora decide una persona), altrimenti nessun inviante.
  if (interno) return riga ? { stato: 'ambiguo', riga: null, candidati: [riga] } : { stato: null, riga: null, candidati: [] };
  if (riga) return { stato: 'collegato', riga, candidati: [riga] };
  const cognome = parole[parole.length - 1];
  let candidati = righe.filter((r) => paroleCognome(r.nome).includes(cognome));
  // Solo il nome di battesimo («Caro Marco»): i Marco della rubrica.
  if (!candidati.length && parole.length === 1) candidati = righe.filter((r) => paroleNome(r.nome)[0] === parole[0]);
  if (!candidati.length) {
    const simili = righe.filter((r) => paroleCognome(r.nome).some((c) => cognomeSimile(cognome, c)));
    if (simili.length) return { stato: 'ambiguo', riga: null, candidati: simili, simili: true };
  }
  return { stato: candidati.length ? 'ambiguo' : 'nuovo', riga: null, candidati };
}

async function mediciDelloStudio(studioId: string): Promise<RigaRubrica[]> {
  return query<RigaRubrica>(`select nome, null as email, null as studio, null as specialita from providers where studio_id = $1`, [studioId]);
}

type Bozza = {
  id: string; stato: string; testo: string; campi: Record<string, unknown>; estratti: Record<string, unknown>;
  note: string[]; patient_id: string | null; dettato: Date; grezzo: string; dettante: string;
  referring_doctor_id: string | null; inviante_manuale: boolean; inviante_stato: StatoInviante; inviante_nome: string | null;
};

async function bozza(studioId: string, id: string): Promise<Bozza | null> {
  const [b] = await query<{ stato: string; testo_finale: string | null; payload: any; campi_confermati: any; patient_id: string | null; created_at: Date; referring_doctor_id: string | null; inviante_manuale: boolean; inviante_stato: StatoInviante; inviante_nome: string | null }>(
    `select stato, testo_finale, payload, campi_confermati, patient_id, created_at, referring_doctor_id, inviante_manuale, inviante_stato, inviante_nome
       from referti_bozze where id = $1 and studio_id = $2`, [id, studioId]);
  if (!b) return null;
  const p = b.payload ?? {};
  const dettato = typeof p.dettato_il === 'string' && !Number.isNaN(Date.parse(p.dettato_il)) ? new Date(p.dettato_il) : new Date(b.created_at);
  return {
    id, stato: b.stato, testo: String(b.testo_finale ?? p.testo_corretto ?? '').trim(),
    campi: b.campi_confermati ?? {}, estratti: p.campi_estratti ?? {},
    note: Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown): n is string => typeof n === 'string') : [],
    patient_id: b.patient_id, dettato,
    grezzo: String(p.testo_grezzo ?? p.testo_corretto ?? ''), dettante: typeof p.medico?.nome === 'string' ? p.medico.nome : '',
    referring_doctor_id: b.referring_doctor_id, inviante_manuale: !!b.inviante_manuale,
    inviante_stato: b.inviante_stato, inviante_nome: b.inviante_nome,
  };
}

function campoDi(b: Bozza) {
  return (nome: string): string => {
    const v = b.campi?.[nome] ?? b.estratti?.[nome];
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.toLowerCase() !== 'non indicato' ? s : '';
  };
}

// Collega il referto all'inviante della rubrica e ne scrive lo stato. Se chi
// rivede ha scelto a mano, non si tocca.
export async function collegaInviante(studioId: string, bozzaId: string, righe?: RigaInviante[]): Promise<StatoInviante> {
  const b = await bozza(studioId, bozzaId);
  if (!b || b.inviante_manuale) return b?.inviante_stato ?? null;
  const nome = nomeInviante(b.testo, campoDi(b), b.grezzo, b.dettante);
  const { stato, riga } = statoInviante(nome, righe ?? await rubricaInvianti(studioId), await mediciDelloStudio(studioId));
  await query(
    `update referti_bozze set referring_doctor_id = $3, inviante_stato = $4, inviante_nome = nullif($5, '')
      where id = $1 and studio_id = $2 and not inviante_manuale`,
    [bozzaId, studioId, riga?.id ?? null, stato, nome]);
  return stato;
}

// Dopo un inviante nuovo in rubrica: i referti che lo aspettavano si
// ricollegano da soli.
export async function ricollegaInvianti(studioId: string): Promise<number> {
  const righe = await rubricaInvianti(studioId);
  const bozze = await query<{ id: string }>(
    `select id from referti_bozze
      where studio_id = $1 and not inviante_manuale and stato <> 'scartata'
        and (inviante_stato is null or inviante_stato in ('nuovo', 'ambiguo'))
      order by created_at desc limit 500`, [studioId]);
  let collegati = 0;
  for (const x of bozze) if ((await collegaInviante(studioId, x.id, righe)) === 'collegato') collegati++;
  return collegati;
}

export async function scegliInviante(studioId: string, bozzaId: string, referringDoctorId: string | null): Promise<void> {
  if (referringDoctorId) {
    const [r] = await query('select 1 from referring_doctors where id = $1 and studio_id = $2', [referringDoctorId, studioId]);
    if (!r) throw new Error('inviante_non_trovato');
  }
  await query(
    `update referti_bozze set referring_doctor_id = $3, inviante_manuale = $3 is not null,
            inviante_stato = case when $3 is null then inviante_stato else 'collegato' end
      where id = $1 and studio_id = $2`, [bozzaId, studioId, referringDoctorId]);
  if (!referringDoctorId) await collegaInviante(studioId, bozzaId);
}

export type Attorno = {
  inviante: { stato: StatoInviante; nome: string; manuale: boolean; simili?: boolean; scelto: { id: string; nome: string; specialita: string; indirizzo: string; email: string } | null; candidati: { id: string; nome: string; localita: string }[] };
  copia: { fonte: 'dettato' | 'revisione'; voci: { nome: string; in_rubrica: boolean; indirizzo: string; id: string | null }[] };
  allegati: { etichetta: string; documento_id: string | null; motivo: 'nota' | 'citato' | 'ecg' }[];
  ecg: { citato: boolean; trovato: boolean };
  paziente_in_cartella: boolean;
};

export async function attorno(studioId: string, bozzaId: string): Promise<Attorno | null> {
  const b = await bozza(studioId, bozzaId);
  if (!b) return null;
  const campo = campoDi(b);
  const righe = await rubricaInvianti(studioId);

  // Inviante: quello scelto o collegato, altrimenti lo stato calcolato ora.
  const nome = b.inviante_nome || nomeInviante(b.testo, campo, b.grezzo, b.dettante);
  const calcolo = statoInviante(nome, righe, await mediciDelloStudio(studioId));
  const scelta = b.referring_doctor_id ? righe.find((r) => r.id === b.referring_doctor_id) ?? null : null;
  const riga = scelta ?? (b.inviante_manuale ? null : calcolo.riga);
  const inviante: Attorno['inviante'] = {
    stato: riga ? 'collegato' : calcolo.stato, nome, manuale: b.inviante_manuale, simili: !riga && !!calcolo.simili,
    scelto: riga ? { id: riga.id, nome: riga.nome, specialita: riga.specialita ?? '', indirizzo: indirizzoDi(riga), email: riga.email ?? '' } : null,
    candidati: calcolo.candidati.map((r) => ({ id: r.id, nome: r.nome, localita: r.localita ?? '' })),
  };

  // Copia per conoscenza: la revisione vince sul dettato.
  const toccata = Object.prototype.hasOwnProperty.call(b.campi ?? {}, 'copia_conoscenza');
  const nomiCopia = toccata ? copieDalCampo(String(b.campi.copia_conoscenza ?? '')) : copieDalDettato(b.testo, b.note);
  const copia: Attorno['copia'] = {
    fonte: toccata ? 'revisione' : 'dettato',
    voci: nomiCopia.map((n) => {
      const r = scegliInRubrica(n, righe);
      return r ? { nome: r.nome, in_rubrica: true, indirizzo: indirizzoDi(r), id: r.id } : { nome: n, in_rubrica: false, indirizzo: '', id: null };
    }),
  };

  // Allegati: la cartella del paziente (legame scritto, poi il nome).
  const pazienteNome = campo('nome_paziente');
  const patientId = b.patient_id ?? (pazienteNome ? await trovaPaziente(studioId, pazienteNome) : null);
  const docs = patientId
    ? await query<{ id: string; filename: string; nota: string | null; categoria: string | null; uploaded_at: Date }>(
        `select id, filename, nota, categoria, uploaded_at from patient_documents
          where patient_id = $1 and studio_id = $2 order by uploaded_at desc limit 100`, [patientId, studioId])
    : [];
  const allegati: Attorno['allegati'] = [];
  const aggiungi = (etichetta: string, documento_id: string | null, motivo: 'nota' | 'citato' | 'ecg') => {
    if (etichetta && !allegati.some((a) => a.etichetta.toLowerCase() === etichetta.toLowerCase())) allegati.push({ etichetta, documento_id, motivo });
  };
  if (pazienteNome && b.note.length) {
    for (const n of await agganciaRiferimenti(studioId, pazienteNome, b.note)) {
      if (n.riguardaDocumenti && n.candidati.length && /alleg/i.test(n.nota)) aggiungi(etichettaDocumento(n.candidati[0]), n.candidati[0].tipo === 'cartella' ? n.candidati[0].id : null, 'nota');
    }
  }
  for (const d of docs) {
    if (d.categoria === 'lettera') continue;
    const e = etichettaDocumento(d);
    if (e && citatoNelTesto(e, b.testo)) aggiungi(e, d.id, 'citato');
  }
  const citato = citaECG(b.testo) || b.note.some((n) => citaECG(n));
  const ecg = citato ? scegliECG(docs, b.dettato) : null;
  if (ecg) aggiungi(etichettaDocumento(ecg), ecg.id, 'ecg');

  return { inviante, copia, allegati, ecg: { citato, trovato: !!ecg }, paziente_in_cartella: !!patientId };
}

// Le righe della copia per conoscenza per il Word: il nome come sta in
// rubrica (o come è stato dettato) e l'indirizzo. Nessun titolo aggiunto: il
// genere non lo sappiamo, e «Dr. med.» davanti a una dottoressa sarebbe un
// errore scritto nella lettera.
export function vociCopia(a: Attorno): VoceCopia[] {
  return a.copia.voci.map((v) => ({ nome: v.nome, indirizzo: v.indirizzo }));
}
