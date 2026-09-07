import 'server-only';
import { query } from './db';

// Strumenti di CODICE per la forma «lettera» del referto (2026-09-07, dal
// confronto tra il primo referto della catena e la versione della
// segretaria): date in formato svizzero, blocco della terapia ripreso dalla
// lettera precedente, data della visita, destinatario, sigla. Niente AI qui:
// tutto deterministico e verificabile. Mai contenuti nei log.

const MESI: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
  luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};

// «2 settembre 2026» → «02.09.2026» (solo con l'anno: senza anno non si
// inventa). «1° settembre 2026» e «primo settembre 2026» compresi.
export function normalizzaDate(testo: string): string {
  return testo.replace(
    /\b(\d{1,2}|primo)°?\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\b/giu,
    (_m, g: string, mese: string, anno: string) => {
      const giorno = g.toLowerCase() === 'primo' ? 1 : Number(g);
      if (giorno < 1 || giorno > 31) return _m;
      return `${String(giorno).padStart(2, '0')}.${MESI[mese.toLowerCase()]}.${anno}`;
    }
  );
}

export function dataCh(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// La data della visita citata nel testo («ho rivisto in data 02.09.2026»,
// «visita del 02.09.2026»), altrimenti vuota.
export function dataVisitaDalTesto(testo: string): string {
  const m = /(?:in data|il giorno|visita del|visto il|rivisto il|controllo del)\s+(\d{2}\.\d{2}\.\d{4})/i.exec(normalizzaDate(testo));
  return m ? m[1] : '';
}

// Sigla di chi scrive, dall'indirizzo email (paola.verdi@… → «pv»).
export function siglaDaEmail(email: string | null | undefined): string {
  const locale = String(email ?? '').split('@')[0].toLowerCase().replace(/[^a-z.\-_]/g, '');
  if (!locale) return '';
  const parti = locale.split(/[.\-_]+/).filter(Boolean);
  return parti.length >= 2 ? parti.map((p) => p[0]).join('').slice(0, 3) : locale.slice(0, 2);
}

// Il blocco «Terapia» di una lettera: le righe dopo «Terapia:» fino alla
// prima riga vuota o al saluto. Vuoto se non c'è.
export function estraiTerapia(lettera: string): string[] {
  const righe = lettera.replace(/\r\n/g, '\n').split('\n');
  const inizio = righe.findIndex((r) => /^\s*terapia(\s+domiciliare)?\s*:?\s*$/i.test(r));
  if (inizio === -1) return [];
  const out: string[] = [];
  for (const r of righe.slice(inizio + 1)) {
    const t = r.trim();
    if (!t) { if (out.length) break; else continue; }
    if (/^(cordiali|con i migliori|distinti|un caro saluto|copia\b)/i.test(t)) break;
    out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

// Il dettato contiene già una terapia (farmaci con dosaggio)? Se no, la
// lettera riprende quella della lettera precedente (prassi della segretaria:
// ogni lettera porta la terapia in corso, anche se il medico non la ridetta).
export function dettatoConTerapia(testo: string): boolean {
  return /^\s*terapia\s*:?\s*$/im.test(testo) || (testo.match(/\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ml|ui)\b/gi) ?? []).length >= 2;
}

// Il nome estratto come destinatario è davvero il destinatario? Se compare
// nel testo solo come chi ha ESEGUITO qualcosa («eseguita dal dottor X»,
// «a cura del dr. X») e il saluto è generico («Caro collega»), non lo è:
// l'estrazione ha preso l'unico medico nominato (visto dal vivo 2026-09-07).
export function destinatarioAffidabile(testo: string, nome: string): boolean {
  const cognome = nome.replace(/^(dr\.?|dott\.?|dr\.?ssa|dott\.?ssa|med\.?|prof\.?)\s*/gi, '').trim().split(/\s+/).pop() ?? '';
  if (cognome.length < 3) return true;
  const rx = new RegExp(`\\b${cognome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!rx.test(testo)) return true; // nome non nel corpo: viene dai campi confermati, ci si fida
  const salutoGenerico = /^\s*car[oa]\s+(collega|dottore|dottoressa)\s*,/im.test(testo);
  const soloEsecutore = new RegExp(`(?:eseguit[oaie]|effettuat[oaie]|refertat[oaie]|a cura)\\s+(?:da|dal|dalla|del|della)\\s+(?:dott\\.?|dr\\.?|dottor[e]?|dottoressa|prof\\.?)?\\s*(?:med\\.?\\s*)?[^.\\n]{0,40}\\b${cognome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(testo);
  const nelSaluto = new RegExp(`^\\s*car[oa]\\b[^\\n,]{0,60}\\b${cognome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'im').test(testo);
  return nelSaluto || !(salutoGenerico && soloEsecutore);
}

export function terapiaInvariata(testo: string): boolean {
  return /terapia[^.\n]{0,40}(rimane|resta|è|e')\s+invariata|terapia\s+invariata|senza modifiche (alla|della) terapia/i.test(testo);
}

// L'ultima lettera CONFERMATA dello stesso paziente (nome + data di nascita
// dai campi, confermati o estratti), esclusa la bozza stessa.
export async function letteraPrecedente(
  studioId: string,
  bozzaId: string,
  campi: Record<string, unknown>
): Promise<{ id: string; testo: string } | null> {
  const nome = typeof campi?.nome_paziente === 'string' ? campi.nome_paziente.trim() : '';
  const nascita = typeof campi?.data_nascita === 'string' ? campi.data_nascita.trim() : '';
  if (!nome || nome.toLowerCase() === 'non indicato') return null;
  const [prec] = await query<{ id: string; testo_finale: string }>(
    `select id, testo_finale
       from referti_bozze
      where studio_id = $1 and id <> $2 and stato = 'confermata' and tipo = 'referto'
        and testo_finale is not null
        and coalesce((payload->>'ombra')::boolean, false) = false
        and lower(coalesce(campi_confermati->>'nome_paziente', payload->'campi_estratti'->>'nome_paziente', '')) = lower($3)
        and ($4 = '' or coalesce(campi_confermati->>'data_nascita', payload->'campi_estratti'->>'data_nascita', '') in ('', $4))
      order by reviewed_at desc
      limit 1`,
    [studioId, bozzaId, nome, nascita]
  );
  return prec?.testo_finale ? { id: prec.id, testo: prec.testo_finale } : null;
}

// Il destinatario in rubrica (medici invianti dello studio), cercato per
// cognome: e-mail e, se registrato sulla piattaforma, la specialità.
export async function destinatarioInRubrica(
  studioId: string,
  nome: string
): Promise<{ email: string; specialita: string; studio: string } | null> {
  const pulito = nome.replace(/^(dr\.?|dott\.?|dr\.?ssa|dott\.?ssa|med\.?|prof\.?)\s*/gi, '').trim();
  const parole = pulito.split(/\s+/).filter((p) => p.length >= 3);
  if (!parole.length) return null;
  const cognome = parole[parole.length - 1];
  const [r] = await query<{ email: string | null; studio: string | null; specialita: string | null }>(
    `select rd.email, rd.studio, ip.specialita
       from referring_doctors rd
       left join users u on lower(u.email) = lower(rd.email) and u.role = 'inviante'
       left join inviante_profiles ip on ip.user_id = u.id
      where rd.studio_id = $1 and rd.nome ilike '%' || $2 || '%'
      order by rd.created_at desc
      limit 1`,
    [studioId, cognome]
  );
  if (!r) return null;
  return { email: (r.email ?? '').trim(), specialita: (r.specialita ?? '').trim(), studio: (r.studio ?? '').trim() };
}

// «Egregio Signor» / «Egregia Signora» dal titolo che il testo usa per il
// destinatario; senza indizi, il maschile come nella prassi dello studio.
export function appellativo(destinatario: string): string {
  return /\b(dr\.?ssa|dott\.?ssa|dottoressa|signora|cara)\b/i.test(destinatario) ? 'Egregia Signora' : 'Egregio Signor';
}

export function conTitolo(nome: string): string {
  const n = nome.trim();
  return /^(dr|dott|prof)/i.test(n) ? n : `Dr. med. ${n}`;
}
