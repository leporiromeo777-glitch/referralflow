import 'server-only';
import { registraTestoMacchina } from './audit/lineage';
import { query } from './db';
import { registraEvento } from './referti-eventi';
import { letteraDalFoglio, nomeDestinatario, pazienteDalTesto, pulisciFoglio, type Foglio, copieDalFoglio } from './dittafono-foglio-regole';
import { appellativo, conTitolo } from './referti-lettera';
import { profiloMedico } from './referti-medici';
import { dateColPunto } from './date-punti';

// Il foglio del dittafono, lato server (12.10.2026, [[Piattaforma/Dittafono]]): (1) le parti del foglio già scritte,
// prese dagli STESSI ingredienti del Word — profilo del medico che detta (intestazione, titolo, chiusura, firma, copia),
// dati dello studio, paziente e medico inviante dalla cartella; (2) quando la catena consegna la bozza di un audio
// dettato sul foglio, la lettera del foglio diventa il testo da rivedere. Nei log niente testo.

const oggi = () => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

export type FoglioPronto = Foglio & { medico: string; intestazione: string[]; formato: 'lettera' | 'rapporto' };
export async function foglioPer(studioId: string, medicoId: string | null, patientId: string | null): Promise<FoglioPronto> {
  const [s] = await query<{ nome: string; titolare: string | null; telefono: string | null; notify_email: string | null }>('select nome, titolare, telefono, notify_email from studios where id = $1', [studioId]);
  const profilo = await profiloMedico(studioId, medicoId);
  const formato = profilo?.formato ?? 'rapporto';
  const medico = profilo?.nome ? conTitolo(profilo.nome) : s?.titolare ? conTitolo(s.titolare) : s?.nome ?? '';
  const intestazione = (profilo?.intestazione ?? [])
    .map((r) => r.replace('{telefono}', (s?.telefono ?? '').trim()).replace('{email}', (s?.notify_email ?? '').trim()))
    .filter((r) => !/\{[a-z_]+\}/.test(r) && !/:\s*$/.test(r));
  const data = oggi();
  // Il paziente e il suo ultimo medico inviante, dalla cartella.
  const [p] = patientId ? await query<{ cognome: string; nome: string; nascita: string | null; sesso: string | null }>(
    `select cognome, nome, to_char(data_nascita, 'DD.MM.YYYY') as nascita, sesso from patients where id = $1 and studio_id = $2`, [patientId, studioId]) : [];
  const [inv] = p ? await query<{ nome: string; specialita: string | null; email: string | null; hin_address: string | null }>(
    `select d.nome, d.specialita, d.email, d.hin_address from referrals r join referring_doctors d on d.id = r.referring_doctor_id
      where r.patient_id = $1 and r.studio_id = $2 order by r.created_at desc limit 1`, [patientId, studioId]) : [];
  const donna = inv ? /\b(dr\.?ssa|dott\.?ssa|dottoressa)\b/i.test(inv.nome) : false;
  const destinatario = destinatarioDi(inv ?? null, formato, donna);
  const nomePaziente = p ? `${p.cognome} ${p.nome}`.trim() : '';
  return {
    medico, intestazione, formato, destinatario, data,
    titolo: (profilo?.titolo_rapporto || 'VISITA AMBULATORIALE, RAPPORTO').replace('{data_visita}', data),
    paziente: (formato === 'lettera' ? 'Paziente\n' : '') + [nomePaziente, p?.nascita].filter(Boolean).join(' – '),
    saluto: formato === 'lettera' ? (donna ? 'Cara collega,' : 'Caro collega,') : '',
    chiusura: [profilo?.chiusura ?? '', ...(profilo?.firma?.length ? ['', ...profilo.firma] : [])].join('\n').trim(),
    copia: profilo ? profilo.copia : 'Copia: alla paziente',
  };
}

// Il dettato di questa bozza è stato scritto sul foglio? Allora la lettera del foglio diventa il testo da rivedere
// (decisione dello studio, 12.10.2026); ciò che la catena ha ricavato dall'audio resta nel payload, come controllo.
// Rende true se l'ha fatto. Il testo della catena è la «versione prima» nel registro delle versioni.
// La copia per conoscenza scritta sul foglio va nel campo della bozza (20.10.2026): da lì la vedono la revisione, il Word e la mail.
function copiaDelFoglio(copia: string): Record<string, string> {
  const nomi = copieDalFoglio(copia);
  return nomi.length ? { copia_conoscenza: nomi.join('; ') } : {};
}
export async function applicaFoglio(studioId: string, bozzaId: string, audioId: string | null): Promise<boolean> {
  if (!audioId) return false;
  const [a] = await query<{ dettato_testo: string | null; dettato_foglio: unknown; dettato_fonte: string | null; patient_id: string | null }>(
    'select dettato_testo, dettato_foglio, dettato_fonte, patient_id from referti_audio where id = $1 and studio_id = $2', [audioId, studioId]);
  const foglio = pulisciFoglio(a?.dettato_foglio), corpo = (a?.dettato_testo ?? '').trim();
  if (!foglio || !corpo) return false;
  const lettera = dateColPunto(letteraDalFoglio(foglio, corpo)), destinatario = nomeDestinatario(foglio.destinatario);      // date coi punti (20.10.2026)
  const chi = await pazienteDelFoglio(studioId, a?.patient_id ?? null, foglio.paziente);
  const [b] = await query<{ prima: string | null }>(
    `update referti_bozze set testo_finale = $3,
            payload = jsonb_set(payload, '{foglio}', $4::jsonb),
            campi_confermati = coalesce(campi_confermati, '{}'::jsonb) || $5::jsonb
      where id = $1 and studio_id = $2 and stato = 'bozza' returning payload->>'testo_corretto' as prima`,
    [bozzaId, studioId, lettera, JSON.stringify({ fonte: a?.dettato_fonte ?? 'dettatura', applicato_il: new Date().toISOString() }), JSON.stringify({ ...(destinatario ? { medico_destinatario: destinatario } : {}), ...chi, ...copiaDelFoglio(foglio.copia) })]);
  if (!b) return false;
  await registraTestoMacchina({ studioId, bozzaId, nome: 'lettera_dal_foglio', modello: a?.dettato_fonte ?? 'dettatura', regole: 'lettera dettata sul foglio del dittafono: saluto, corpo dettato, chiusura e firma', prima: b.prima, dopo: lettera });
  console.log(`[foglio] bozza ${bozzaId.slice(0, 8)}: la lettera dettata sul foglio è il testo da rivedere (${lettera.length} caratteri)`);
  return true;
}

// Il paziente del foglio, per i campi del Word (riga sotto il titolo e piè di pagina): nome e data di nascita dalla cartella
// del paziente scelto nel dittafono, o — scritto a mano — da ciò che c'è sul foglio («Cognome Nome – 31.12.1950»). Prima
// il Word li prendeva dai campi che la catena ricava dal dettato, e la data di nascita, che il medico non detta, mancava
// (15.10.2026, dallo studio). → { nome_paziente?, data_nascita? }
export async function pazienteDelFoglio(studioId: string, patientId: string | null, testo: string): Promise<Record<string, string>> {
  if (patientId) {
    const [p] = await query<{ cognome: string; nome: string; nascita: string | null }>(
      `select cognome, nome, to_char(data_nascita, 'DD.MM.YYYY') as nascita from patients where id = $1 and studio_id = $2`, [patientId, studioId]);
    if (p) return { nome_paziente: `${p.cognome} ${p.nome}`.trim(), ...(p.nascita ? { data_nascita: p.nascita } : {}) };
  }
  return pazienteDalTesto(testo);
}

// Il blocco del destinatario sul foglio, dal medico della rubrica degli invianti: «Egregio Signor / Dr. med. … / FMH … /
// Via e-mail: …» nel formato lettera, nome e «Via email» nel rapporto. Lo usano il foglio e «detto la lettera
// all'indirizzo del dottor …» (src/lib/dittafono-indirizzo.ts).
export type Inviante = { nome: string; specialita: string | null; email: string | null; hin_address: string | null };
export function destinatarioDi(inv: Inviante | null, formato: 'lettera' | 'rapporto', donna: boolean): string {
  const nomeInv = inv ? conTitolo(inv.nome.replace(/^dr\.?\s*(med\.?)?\s*/i, ''), donna) : '';
  const posta = inv?.hin_address || inv?.email || '';
  return formato === 'lettera'
    ? (inv ? [appellativo(inv.nome, donna), nomeInv, inv.specialita ? `FMH ${inv.specialita}` : '', posta ? `Via e-mail: ${posta}` : 'Via e-mail'] : ['Egregio Signor', 'Dr. med. ', 'Via e-mail']).filter(Boolean).join('\n')
    : [nomeInv || 'Dr. med. ', 'Via email'].join('\n');
}

// LA LETTERA SUBITO (19.10.2026, decisione dello studio: «con Dragon la lettera arrivava alla segretaria dopo 7-18
// minuti»). La lettera dettata sul foglio è pronta all'«Invia»: diventa subito la bozza da rivedere, senza aspettare la
// catena. La catena (leggera) arriva dopo e porta solo il CONTROLLO — le parole sentite dal Mac coi loro tempi, le note
// per la segreteria — che si aggiunge a questa bozza (api/referti/bozza). → id della bozza, o null se non è un foglio.
export async function letteraSubito(studioId: string, audioId: string, userId: string | null): Promise<string | null> {
  const [a] = await query<{ dettato_testo: string | null; dettato_foglio: unknown; dettato_fonte: string | null; patient_id: string | null; medico: string | null; tipo: string; creato: string }>(
    `select dettato_testo, dettato_foglio, dettato_fonte, patient_id, medico, tipo, created_at::text as creato from referti_audio where id = $1 and studio_id = $2 and bozza_id is null`, [audioId, studioId]);
  const foglio = pulisciFoglio(a?.dettato_foglio), corpo = (a?.dettato_testo ?? '').trim();
  if (!a || !foglio || !corpo) return null;
  const lettera = dateColPunto(letteraDalFoglio(foglio, corpo)), destinatario = nomeDestinatario(foglio.destinatario);      // date coi punti (20.10.2026)
  const chi = await pazienteDelFoglio(studioId, a.patient_id, foglio.paziente);
  const profilo = a.medico ? await profiloMedico(studioId, a.medico) : null;
  const fonte = a.dettato_fonte ?? 'dettatura';
  const payload = {
    foglio: { fonte, applicato_il: new Date().toISOString(), subito: true },
    controllo_audio: 'in_corso',
    dettato_il: new Date(a.creato).toISOString(),
    testo_corretto: lettera,
    note_segreteria: [],
    medico: profilo ? { id: profilo.id, nome: profilo.nome, modalita: profilo.modalita, formato: profilo.formato } : null,
  };
  const [b] = await query<{ id: string }>(
    `insert into referti_bozze (studio_id, file_id, payload, tipo, medico, testo_finale, campi_confermati, patient_id)
     values ($1, 'foglio-' || $2, $3, $4, $5, $6, $7, $8) on conflict (studio_id, file_id) do nothing returning id`,
    [studioId, audioId, JSON.stringify(payload), a.tipo === 'visita' ? 'visita' : 'referto', a.medico, lettera,
      JSON.stringify({ ...(destinatario ? { medico_destinatario: destinatario } : {}), ...chi, ...copiaDelFoglio(foglio.copia) }), a.patient_id]);
  if (!b) return null;
  await query(`update referti_audio set bozza_id = $3 where id = $1 and studio_id = $2 and bozza_id is null`, [audioId, studioId, b.id]);
  await registraTestoMacchina({ studioId, bozzaId: b.id, nome: 'lettera_dal_foglio', modello: fonte, regole: 'lettera dettata sul foglio del dittafono: saluto, corpo dettato, chiusura e firma (subito, prima della catena)', prima: null, dopo: lettera });
  await registraEvento(studioId, b.id, 'bozza_dal_foglio', userId, { caratteri: lettera.length }).catch(() => null);
  console.log(`[foglio] bozza ${b.id.slice(0, 8)}: la lettera dettata sul foglio è subito da rivedere (${lettera.length} caratteri); il controllo con l'audio arriva dalla catena`);
  return b.id;
}

