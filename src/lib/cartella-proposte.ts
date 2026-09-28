import 'server-only';
import { query } from './db';
import { getFile } from './storage';
import { pazienteDelReferto } from './referti-inviante';
import { etichettaDocumento } from './referti-allegato-blocco';
import { CATEGORIA_DI, cercaPagine, etichettaRichiesta, richiesteDalDettato } from './cerca-in-cartella';

// Proposte di pagine da estrarre dalla cartella scansionata (28.9.2026):
// il dettato dice che cosa serve (cerca-in-cartella.ts), qui si leggono le
// pagine dei PDF del paziente (testo OCR, sul Mac) e si cerca. Il testo resta
// nel server: al browser vanno numeri di pagina e motivi. Nei log solo numeri.

const CACHE = new Map<string, string[]>();
async function testoPerPagina(storageKey: string): Promise<string[]> {
  const c = CACHE.get(storageKey);
  if (c) return c;
  const f = await getFile(storageKey);
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: f.body });
  const r: any = await parser.getText();
  try { await parser.destroy(); } catch { /* ignora */ }
  const pagine: string[] = Array.isArray(r?.pages) ? r.pages.map((p: any) => String(p?.text ?? '')) : [];
  CACHE.set(storageKey, pagine);
  if (CACHE.size > 12) CACHE.delete(CACHE.keys().next().value as string);
  return pagine;
}

export type PropostaCartella = {
  richiesta: string; tipo: string; categoria: string;
  documento_id: string; documento: string; pagine_documento: number;
  da: number; a: number; motivi: string[]; gia_estratto: string | null;
};

export async function proposteDallaCartella(studioId: string, bozzaId: string): Promise<{ proposte: PropostaCartella[]; senza_proposta: string[]; attesa_ocr: number } | null> {
  const [b] = await query<{ testo: string | null; note: unknown; dettato_il: string | null; created_at: Date }>(
    `select coalesce(testo_finale, payload->>'testo_corretto') as testo, payload->'note_segreteria' as note, payload->>'dettato_il' as dettato_il, created_at
       from referti_bozze where id = $1 and studio_id = $2`, [bozzaId, studioId]);
  if (!b) return null;
  const note = Array.isArray(b.note) ? (b.note as unknown[]).filter((n): n is string => typeof n === 'string') : [];
  const dettatoIl = b.dettato_il && !Number.isNaN(Date.parse(b.dettato_il)) ? new Date(b.dettato_il) : new Date(b.created_at);
  const richieste = richiesteDalDettato(b.testo ?? '', note, dettatoIl);
  const vuoto = { proposte: [], senza_proposta: [], attesa_ocr: 0 };
  if (!richieste.length) return vuoto;
  const patientId = await pazienteDelReferto(studioId, bozzaId);
  if (!patientId) return vuoto;
  const docs = await query<{ id: string; filename: string; nota: string | null; storage_key: string; ocr_stato: string | null }>(
    `select id, filename, nota, storage_key, ocr_stato from patient_documents
      where patient_id = $1 and studio_id = $2 and filename ilike '%.pdf' order by uploaded_at desc limit 30`, [patientId, studioId]);
  const attesa = docs.filter((d) => d.ocr_stato === 'da_fare').length;
  const leggibili: { d: (typeof docs)[number]; pagine: string[] }[] = [];
  for (const d of docs) {
    if (d.ocr_stato === 'da_fare') continue;
    try {
      const pagine = await testoPerPagina(d.storage_key);
      if (pagine.length >= 3) leggibili.push({ d, pagine });
    } catch { /* PDF che non si legge: saltato */ }
  }
  const proposte: PropostaCartella[] = [];
  const senza: string[] = [];
  for (const r of richieste) {
    const trovate = leggibili.flatMap(({ d, pagine }) => cercaPagine(pagine, r).map((p) => ({ d, n: pagine.length, p })))
      .sort((x, y) => y.p.punteggio - x.p.punteggio).slice(0, 2);
    // L'ECG citato senza data è quello del giorno: se la cartella non ce l'ha
    // non è una mancanza da segnalare qui (lo dice già la regola dell'ECG).
    if (!trovate.length) { if (r.esplicita) senza.push(etichettaRichiesta(r)); continue; }
    for (const { d, n, p } of trovate) {
      const base = d.filename.replace(/\.pdf$/i, '');
      const eti = p.pagina_da === p.pagina_a ? `${p.pagina_da}` : `${p.pagina_da}–${p.pagina_a}`;
      const gia = docs.find((x) => x.filename === `${base} – pp. ${eti}.pdf`);
      proposte.push({
        richiesta: etichettaRichiesta(r), tipo: r.tipo, categoria: CATEGORIA_DI[r.tipo],
        documento_id: d.id, documento: etichettaDocumento(d) || d.filename, pagine_documento: n,
        da: p.pagina_da, a: p.pagina_a, motivi: p.motivi, gia_estratto: gia?.id ?? null,
      });
    }
  }
  console.log(`[cartella] proposte per ${bozzaId.slice(0, 8)}: ${richieste.length} richieste, ${proposte.length} proposte, ${leggibili.length} PDF letti`);
  return { proposte, senza_proposta: senza, attesa_ocr: attesa };
}
