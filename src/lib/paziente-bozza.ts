import 'server-only';
import { query } from './db';
import { abbina, indicePazienti, type PazienteMinimo } from './pazienti-abbina-regole';
import { abbinaSimile, confrontaNomi, nomeComeInCartella } from './nome-simile';
import { registraTestoMacchina } from './audit/lineage';

// La bozza e la sua cartella (2.10.2026, decisione dello studio): prima il
// nome identico (regole severe di sempre), poi il nome che SUONA uguale
// (nome-simile.ts), collegato da solo solo con una visita in agenda nei
// giorni del dettato o la stessa data di nascita; altrimenti proposte da
// confermare nella revisione. Collegata la cartella, il nome nel testo e nei
// campi si scrive come in cartella. «Scollega» a mano non viene rifatto.
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
                                '{campi_estratti,nome_paziente}', to_jsonb($7::text)) - 'paziente_proposte',
            campi_confermati = case when campi_confermati ? 'nome_paziente' then jsonb_set(campi_confermati, '{nome_paziente}', to_jsonb($7::text)) else campi_confermati end
      where id = $1 and studio_id = $2`,
    [b.id, b.studio_id, p.id, usaFinale, t.testo, JSON.stringify(abbinamento), `${p.cognome} ${p.nome}`.trim()]);
  if (t.cambiate) {
    await registraTestoMacchina({ studioId: b.studio_id, bozzaId: b.id, nome: 'nome_dalla_cartella', modello: 'regole', regole: 'nome del paziente scritto come in cartella (src/lib/nome-simile.ts)', prima, dopo: t.testo, metadata: { modo, parole: t.cambiate } });
  }
  console.log(`[paziente] ${b.id.slice(0, 8)}: collegata (${modo}, ${t.cambiate} parole del nome corrette)`);
}

// All'arrivo della bozza (e quando la si rifà): stessa regola severa di
// sempre, poi quella tollerante. Best-effort.
export async function abbinaPazienteBozza(studioId: string, bozzaId: string): Promise<'gia' | 'stesso_nome' | 'simile_agenda' | 'simile_nascita' | 'proposte' | 'niente'> {
  const b = await leggi(studioId, bozzaId);
  if (!b || b.stato === 'scartata') return 'niente';
  if (b.patient_id) return 'gia';
  if (b.payload?.paziente_abbinamento?.modo === 'scollegato') return 'niente';
  const nome = campo(b, 'nome_paziente');
  if (!nome) return 'niente';
  const nascita = campo(b, 'data_nascita') || null;
  const tutti = await pazienti(studioId);
  if (!tutti.length) return 'niente';
  const esatto = abbina(nome, nascita, indicePazienti(tutti));
  if (esatto.id) {
    const p = tutti.find((x) => x.id === esatto.id)!;
    await collega(b, p, 'stesso_nome', [], null);
    return 'stesso_nome';
  }
  const agenda = await inAgenda(studioId, quando(b));
  const s = abbinaSimile(nome, nascita, tutti, new Set(agenda.keys()));
  if ('modo' in s) {
    await collega(b, tutti.find((x) => x.id === s.id)!, s.modo, s.coppie, null);
    return s.modo;
  }
  if (!s.proposte.length) return 'niente';
  await query(`update referti_bozze set payload = jsonb_set(payload, '{paziente_proposte}', $3::jsonb) where id = $1 and studio_id = $2 and patient_id is null`,
    [bozzaId, studioId, JSON.stringify(s.proposte)]);
  return 'proposte';
}

export type StatoPaziente = {
  paziente: { id: string; nome: string; nascita: string | null } | null;
  modo: string | null;
  nome_dettato: string;
  proposte: { id: string; nome: string; nascita: string | null; visita: string | null }[];
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
