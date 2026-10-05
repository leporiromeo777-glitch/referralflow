import 'server-only';
import { query } from './db';
import { abbina, chiaveNome, daTitoloAgenda, indicePazienti, proponiAnagrafica, type PazienteMinimo } from './pazienti-abbina-regole';
import { abbinaSimile, cercaNellAgenda, confrontaNomi, nomeComeInCartella, parolaSimile } from './nome-simile';
import { riabbinaPazienti } from './pazienti-abbina';
import { registraTestoMacchina } from './audit/lineage';

// La bozza e la sua cartella (2.10.2026, decisione dello studio): prima il
// nome identico (regole severe di sempre), poi il nome che SUONA uguale
// (nome-simile.ts), collegato da solo solo con una visita in agenda nei
// giorni del dettato o la stessa data di nascita; altrimenti proposte da
// confermare nella revisione. Collegata la cartella, il nome nel testo e nei
// campi si scrive come in cartella. «Scollega» a mano non viene rifatto.
// Dal 5.10.2026 anche al contrario: fra i nomi dell'AGENDA dei 7 giorni prima
// del dettato si cerca quale compare nel dettato (serve quando la catena non
// ha riconosciuto il nome: 21 bozze aperte su 92). Uno solo = è lui; se non
// ha ancora la cartella, nasce dai dati dell'agenda (nome e data di nascita
// scritti dalla segreteria). Più d'uno = proposta.
// Nei log solo id abbreviati e conteggi, mai nomi.

type Bozza = { id: string; studio_id: string; stato: string; patient_id: string | null; payload: any; campi_confermati: any; testo_finale: string | null; created_at: Date };

async function leggi(studioId: string, bozzaId: string): Promise<Bozza | null> {
  const [b] = await query<Bozza>(
    'select id, studio_id, stato, patient_id, payload, campi_confermati, testo_finale, created_at from referti_bozze where id = $1 and studio_id = $2', [bozzaId, studioId]);
  return b ?? null;
}
const campo = (b: Bozza, k: string) => {
  const v = b.campi_confermati?.[k] ?? b.payload?.campi_estratti?.[k];
  const s = typeof v === 'string' ? v.trim() : '';
  return s && !/^non indicato$/i.test(s) ? s : '';
};
const quando = (b: Bozza) => {
  const d = b.payload?.dettato_il && !Number.isNaN(Date.parse(b.payload.dettato_il)) ? new Date(b.payload.dettato_il) : new Date(b.created_at);
  return d;
};

async function pazienti(studioId: string): Promise<PazienteMinimo[]> {
  return query<PazienteMinimo>('select id, cognome, nome, data_nascita::text from patients where studio_id = $1', [studioId]);
}

// Le cartelle con una visita in agenda dai 3 giorni prima al giorno dopo il dettato.
async function inAgenda(studioId: string, d: Date): Promise<Map<string, string>> {
  const r = await query<{ patient_id: string; giorno: string }>(
    `select patient_id, to_char(max(starts_at) at time zone 'Europe/Zurich', 'DD.MM.YYYY') as giorno from appointments
      where studio_id = $1 and patient_id is not null and starts_at >= $2::timestamptz - interval '3 days' and starts_at < $2::timestamptz + interval '1 day'
      group by patient_id`, [studioId, d.toISOString()]);
  return new Map(r.map((x) => [x.patient_id, x.giorno]));
}

// Collega e scrive il nome come in cartella (testo e campi). `modo` dice come.
async function collega(b: Bozza, p: PazienteMinimo, modo: string, coppie: [string, string][], utente: string | null): Promise<void> {
  const prima = String(b.testo_finale ?? b.payload?.testo_corretto ?? '');
  const t = coppie.length ? nomeComeInCartella(prima, coppie, p) : { testo: prima, cambiate: 0 };
  const nomeDettato = campo(b, 'nome_paziente');
  const abbinamento = { modo, nome_dettato: nomeDettato, il: new Date().toISOString(), da: utente, parole_cambiate: t.cambiate };
  const usaFinale = b.testo_finale != null;
  await query(
    `update referti_bozze set patient_id = $3,
            testo_finale = case when $4 then $5 else testo_finale end,
            payload = jsonb_set(jsonb_set(case when $4 then payload else jsonb_set(payload, '{testo_corretto}', to_jsonb($5::text)) end,
                                          '{paziente_abbinamento}', $6::jsonb),
                                '{campi_estratti}', coalesce(payload->'campi_estratti', '{}'::jsonb) || jsonb_build_object('nome_paziente', $7::text)
                                  || case when $8::text is not null and coalesce(nullif(payload->'campi_estratti'->>'data_nascita', ''), 'non indicato') = 'non indicato'
                                          then jsonb_build_object('data_nascita', $8::text) else '{}'::jsonb end)
                      - 'paziente_proposte' - 'paziente_proposte_agenda',
            campi_confermati = case when campi_confermati ? 'nome_paziente' then jsonb_set(campi_confermati, '{nome_paziente}', to_jsonb($7::text)) else campi_confermati end
      where id = $1 and studio_id = $2`,
    [b.id, b.studio_id, p.id, usaFinale, t.testo, JSON.stringify(abbinamento), `${p.cognome} ${p.nome}`.trim(), fmtNascita(p.data_nascita)]);
  if (t.cambiate) {
    await registraTestoMacchina({ studioId: b.studio_id, bozzaId: b.id, nome: 'nome_dalla_cartella', modello: 'regole', regole: 'nome del paziente scritto come in cartella (src/lib/nome-simile.ts)', prima, dopo: t.testo, metadata: { modo, parole: t.cambiate } });
  }
  console.log(`[paziente] ${b.id.slice(0, 8)}: collegata (${modo}, ${t.cambiate} parole del nome corrette)`);
}

// All'arrivo della bozza (e quando la si rifà): stessa regola severa di
// sempre, poi quella tollerante. Best-effort.
type VoceAgenda = { titolo: string; nome: string; nascita: string };

// I pazienti in agenda dai 7 giorni prima al giorno dopo il dettato (le voci
// che non sono persone — formazione, ferie — restano fuori).
async function vociAgenda(studioId: string, d: Date): Promise<VoceAgenda[]> {
  const r = await query<{ titolo: string | null; nome: string | null }>(
    `select distinct titolo, paziente_nome as nome from appointments
      where studio_id = $1 and starts_at >= $2::timestamptz - interval '7 days' and starts_at < $2::timestamptz + interval '1 day'
        and coalesce(titolo, paziente_nome) is not null`, [studioId, d.toISOString()]);
  const out: VoceAgenda[] = [];
  for (const a of r) {
    // Il titolo di MediOnline porta anche la data di nascita («COGNOME Nome
    // (gg.mm.aaaa / N° …)»); il nome estratto no. Si preferisce il titolo.
    const dalTitolo = a.titolo ? daTitoloAgenda(a.titolo) : null;
    if (dalTitolo?.persona && dalTitolo.nome) { out.push({ titolo: a.titolo!, nome: dalTitolo.nome, nascita: dalTitolo.nascita }); continue; }
    const dalNome = a.nome ? daTitoloAgenda(a.nome) : null;
    if (dalNome?.persona && dalNome.nome) out.push({ titolo: a.nome!, nome: dalNome.nome, nascita: dalNome.nascita });
  }
  return out;
}

// Dove si cerca il nome: le note per la segreteria (la regia), l'inizio del
// dettato grezzo e del testo corretto, più il nome estratto se c'è.
function testoPerRicerca(b: Bozza, nome: string): string {
  const p = b.payload ?? {};
  const note = Array.isArray(p.note_segreteria) ? p.note_segreteria.filter((n: unknown) => typeof n === 'string').join(' ') : '';
  return [nome, note, String(p.testo_grezzo ?? '').slice(0, 1500), String(b.testo_finale ?? p.testo_corretto ?? '').slice(0, 800)].join(' ');
}

// La cartella per una voce dell'agenda: quella che c'è (abbinamento severo),
// o una nuova coi dati dell'agenda. Con omonimi o date che non tornano: null.
async function cartellaDallAgenda(studioId: string, voce: VoceAgenda, tutti: PazienteMinimo[]): Promise<{ p: PazienteMinimo; nuova: boolean } | null> {
  const an = proponiAnagrafica(voce.titolo);
  if (!an.cognome || !an.nome) return null;
  const e = abbina(`${an.cognome} ${an.nome}`, an.data_nascita || null, indicePazienti(tutti));
  if (e.id) return { p: tutti.find((x) => x.id === e.id)!, nuova: false };
  if (e.motivo !== 'nessuno') return null;
  const [p] = await query<PazienteMinimo>(
    `insert into patients (studio_id, cognome, nome, data_nascita) values ($1, $2, $3, nullif($4, '')::date)
     returning id, cognome, nome, data_nascita::text`, [studioId, an.cognome, an.nome, an.data_nascita]);
  console.log(`[paziente] cartella ${p.id.slice(0, 8)} creata dall'agenda`);
  // La cartella nuova si prende i suoi appuntamenti e i referti con lo stesso nome.
  try { await riabbinaPazienti(studioId); } catch { /* best-effort */ }
  return { p, nuova: true };
}

export type EsitoAbbinamento = 'gia' | 'stesso_nome' | 'simile_agenda' | 'simile_nascita' | 'agenda' | 'agenda_nuova' | 'proposte' | 'niente';

// All'arrivo della bozza (e quando la si rifà): stessa regola severa di
// sempre, poi quella tollerante, poi l'agenda. Best-effort.
export async function abbinaPazienteBozza(studioId: string, bozzaId: string): Promise<EsitoAbbinamento> {
  let b = await leggi(studioId, bozzaId);
  if (!b || b.stato === 'scartata') return 'niente';
  if (b.patient_id) return 'gia';
  if (b.payload?.paziente_abbinamento?.modo === 'scollegato') return 'niente';
  const nome = campo(b, 'nome_paziente');
  const nascita = campo(b, 'data_nascita') || null;
  const tutti = await pazienti(studioId);
  let simili: { id: string; agenda: boolean }[] = [];
  if (nome && tutti.length) {
    const esatto = abbina(nome, nascita, indicePazienti(tutti));
    if (esatto.id) {
      await collega(b, tutti.find((x) => x.id === esatto.id)!, 'stesso_nome', [], null);
      return 'stesso_nome';
    }
    const agenda = await inAgenda(studioId, quando(b));
    const s = abbinaSimile(nome, nascita, tutti, new Set(agenda.keys()));
    if ('modo' in s) {
      await collega(b, tutti.find((x) => x.id === s.id)!, s.modo, s.coppie, null);
      return s.modo;
    }
    simili = s.proposte;
  }
  // L'agenda dei giorni del dettato: chi di loro compare nel dettato?
  const nascitaIso = nascita && /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.test(nascita) ? nascita.replace(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/, (_m, g, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`) : '';
  const trovati = cercaNellAgenda(await vociAgenda(studioId, quando(b)), testoPerRicerca(b, nome))
    .filter((t) => !nascitaIso || !t.voce.nascita || t.voce.nascita === nascitaIso);   // una data di nascita dettata diversa esclude
  if (trovati.length === 1) {
    const { voce, coppie } = trovati[0];
    // Se la catena aveva estratto un nome, deve avere almeno una parola in comune con quello dell'agenda.
    const tokA = chiaveNome(voce.nome).split(' ').filter((w) => w.length >= 3);
    const coerente = !nome || chiaveNome(nome).split(' ').some((w) => tokA.some((t) => parolaSimile(w, t) != null));
    const c = coerente ? await cartellaDallAgenda(studioId, voce, tutti) : null;
    if (c) {
      await collega(b, c.p, c.nuova ? 'agenda_nuova' : 'agenda', coppie, null);
      return c.nuova ? 'agenda_nuova' : 'agenda';
    }
  }
  if (!simili.length && !trovati.length) return 'niente';
  await query(
    `update referti_bozze set payload = jsonb_set(jsonb_set(payload, '{paziente_proposte}', $3::jsonb), '{paziente_proposte_agenda}', $4::jsonb)
      where id = $1 and studio_id = $2 and patient_id is null`,
    [bozzaId, studioId, JSON.stringify(simili), JSON.stringify(trovati.slice(0, 3).map((t) => t.voce))]);
  return 'proposte';
}

// A mano, una proposta venuta dall'agenda: la cartella c'è o nasce da lì.
export async function collegaDaAgendaAMano(studioId: string, bozzaId: string, indice: number, utente: string): Promise<{ ok: true } | { errore: string }> {
  const b = await leggi(studioId, bozzaId);
  if (!b || b.stato !== 'bozza') return { errore: 'La bozza non è più aperta.' };
  const voce: VoceAgenda | undefined = (Array.isArray(b.payload?.paziente_proposte_agenda) ? b.payload.paziente_proposte_agenda : [])[indice];
  if (!voce?.titolo) return { errore: 'Proposta non trovata.' };
  const c = await cartellaDallAgenda(studioId, voce, await pazienti(studioId));
  if (!c) return { errore: 'In anagrafica ci sono omonimi o una data di nascita diversa: scegli il paziente a mano.' };
  const [t] = cercaNellAgenda([voce], testoPerRicerca(b, campo(b, 'nome_paziente')));
  await collega(b, c.p, c.nuova ? 'agenda_nuova' : 'agenda', t?.coppie ?? [], utente);
  return { ok: true };
}

export type StatoPaziente = {
  paziente: { id: string; nome: string; nascita: string | null } | null;
  modo: string | null;
  nome_dettato: string;
  proposte: { id: string | null; agenda?: number; nome: string; nascita: string | null; visita: string | null; nuova?: boolean }[];
};

const fmtNascita = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : null);

export async function statoPaziente(studioId: string, bozzaId: string): Promise<StatoPaziente | null> {
  const b = await leggi(studioId, bozzaId);
  if (!b) return null;
  const ab = b.payload?.paziente_abbinamento ?? null;
  const nomeDettato = String(ab?.nome_dettato || campo(b, 'nome_paziente'));
  const tutti = await pazienti(studioId);
  const dati = (id: string) => { const p = tutti.find((x) => x.id === id); return p ? { id: p.id, nome: `${p.cognome} ${p.nome}`.trim(), nascita: fmtNascita(p.data_nascita) } : null; };
  if (b.patient_id) return { paziente: dati(b.patient_id), modo: ab?.modo ?? 'stesso_nome', nome_dettato: nomeDettato, proposte: [] };
  const agenda = await inAgenda(studioId, quando(b));
  const proposte = (Array.isArray(b.payload?.paziente_proposte) ? b.payload.paziente_proposte : [])
    .map((x: { id: string }) => { const d = dati(x.id); return d ? { ...d, visita: agenda.get(x.id) ?? null } : null; })
    .filter(Boolean);
  // Proposte dall'agenda (cartella da collegare o da creare al clic).
  const giaProposte = new Set(proposte.map((x: { nome: string }) => chiaveNome(x.nome)));
  const idx = indicePazienti(tutti);
  (Array.isArray(b.payload?.paziente_proposte_agenda) ? b.payload.paziente_proposte_agenda as VoceAgenda[] : []).forEach((v, k) => {
    const an = proponiAnagrafica(v.titolo);
    const nomeV = `${an.cognome} ${an.nome}`.trim();
    if (!nomeV || giaProposte.has(chiaveNome(nomeV))) return;
    const e = abbina(nomeV, an.data_nascita || null, idx);
    proposte.push({ id: null, agenda: k, nome: nomeV, nascita: fmtNascita(an.data_nascita || null), visita: 'in agenda', nuova: !e.id });
  });
  return { paziente: null, modo: ab?.modo ?? null, nome_dettato: nomeDettato, proposte };
}

// A mano dalla revisione: collega a una cartella (anche diversa dalle
// proposte) o scollega.
export async function collegaPazienteAMano(studioId: string, bozzaId: string, patientId: string | null, utente: string): Promise<{ ok: true } | { errore: string }> {
  const b = await leggi(studioId, bozzaId);
  if (!b || b.stato !== 'bozza') return { errore: 'La bozza non è più aperta.' };
  if (!patientId) {
    await query(`update referti_bozze set patient_id = null, payload = jsonb_set(payload, '{paziente_abbinamento}', $3::jsonb) where id = $1 and studio_id = $2`,
      [bozzaId, studioId, JSON.stringify({ modo: 'scollegato', il: new Date().toISOString(), da: utente, nome_dettato: campo(b, 'nome_paziente') })]);
    return { ok: true };
  }
  const [p] = await query<PazienteMinimo>('select id, cognome, nome, data_nascita::text from patients where id = $1 and studio_id = $2', [patientId, studioId]);
  if (!p) return { errore: 'Paziente non trovato.' };
  const c = confrontaNomi(campo(b, 'nome_paziente'), p);
  await collega(b, p, 'a_mano', c?.coppie ?? [], utente);
  return { ok: true };
}

// Quando nasce o si importa una cartella: si riprova sulle bozze aperte
// ancora senza cartella (anche col nome simile). Solo conteggi nei log.
export async function abbinaBozzeAperte(studioId: string): Promise<number> {
  const bozze = await query<{ id: string }>(
    `select id from referti_bozze where studio_id = $1 and stato = 'bozza' and patient_id is null and coalesce(payload->>'ombra', 'false') <> 'true'`, [studioId]);
  let collegate = 0;
  for (const b of bozze) {
    const e = await abbinaPazienteBozza(studioId, b.id).catch(() => 'niente' as const);
    if (e === 'stesso_nome' || e === 'simile_agenda' || e === 'simile_nascita' || e === 'agenda' || e === 'agenda_nuova') collegate++;
  }
  if (collegate) console.log(`[paziente] bozze aperte collegate: ${collegate}`);
  return collegate;
}


// Il paziente scelto al caricamento dell'audio (referti_audio.patient_id):
// la bozza nasce collegata, e il nome nel testo — se la catena l'ha scritto a
// orecchio — prende la grafia della cartella.
export async function collegaDalCaricamento(studioId: string, bozzaId: string, audioId: string | null): Promise<boolean> {
  if (!audioId) return false;
  const [a] = await query<{ patient_id: string | null }>('select patient_id from referti_audio where id = $1 and studio_id = $2', [audioId, studioId]);
  if (!a?.patient_id) return false;
  const b = await leggi(studioId, bozzaId);
  if (!b || b.patient_id) return false;
  const [p] = await query<PazienteMinimo>('select id, cognome, nome, data_nascita::text from patients where id = $1 and studio_id = $2', [a.patient_id, studioId]);
  if (!p) return false;
  const nome = campo(b, 'nome_paziente');
  const coppie = (nome ? confrontaNomi(nome, p)?.coppie : null)
    ?? cercaNellAgenda([{ nome: `${p.cognome} ${p.nome}` }], testoPerRicerca(b, nome))[0]?.coppie ?? [];
  await collega(b, p, 'al_caricamento', coppie, null);
  return true;
}
