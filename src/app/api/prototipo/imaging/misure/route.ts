import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query, transazione } from '@/lib/db';
import { isUuid } from '@/lib/cartella';
import { mse, puntoValido, cautionValidati, versioneSoftware, verificaIndipendente, tolleranzaVerifica, type Calibrazione, type Geometria, type Punto } from '@/lib/imaging-misura';

export const dynamic = 'force-dynamic';

// Il righello: le misure fatte da una persona sull'immagine (19.9.2026).
//
// È la parte di ReferralFlow che è un dispositivo medico in-house dello
// studio (docs/legale/dispositivo-in-house/). Tre regole qui dentro:
// - misura chi cura: medico, aiuto medico, amministrazione. La segreteria
//   vede le immagini ma non misura.
// - il numero lo calcola il SERVER con lo stesso codice del browser
//   (public/prototipo/mse/*.js), sulla calibrazione salvata in tabella: il
//   browser manda i due punti, non il risultato. Il Validation Gate decide
//   VALIDATED / CAUTION / NOT_MEASURABLE, e un secondo calcolo indipendente
//   (Python) deve coincidere entro la tolleranza tecnica, o non si salva.
// - niente si cancella: una misura sbagliata si annulla, e resta scritto chi
//   l'ha annullata e quando; ogni cosa che succede a una misura è un evento
//   con prima e dopo (imaging_misure_eventi).
const MISURA = new Set(['medico', 'admin', 'assistente']);
const VEDE = new Set(['segretaria', 'medico', 'admin', 'assistente']);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!MISURA.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });
  const sid = session.studioId;
  let corpo: any = {};
  try { corpo = await req.json(); } catch { return NextResponse.json({ errore: 'corpo_non_valido' }, { status: 400 }); }

  const evento = async (q: typeof query, misuraId: string, tipo: string, prima: unknown, dopo: unknown) => {
    await q(`insert into imaging_misure_eventi (misura_id, studio_id, evento, user_id, prima, dopo, versione_software) values ($1,$2,$3,$4,$5,$6,$7)`,
      [misuraId, sid, tipo, session.id, prima === undefined ? null : JSON.stringify(prima), dopo === undefined ? null : JSON.stringify(dopo), versioneSoftware()]);
  };

  if (corpo.azione === 'annulla') {
    if (!isUuid(corpo.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const esito = await transazione(async (q) => {
      const [m] = await q<{ id: string; annullata_at: string }>(
        `update imaging_misure_manuali set annullata_at = now(), annullata_da = $3
          where id = $1 and studio_id = $2 and annullata_at is null returning id, annullata_at::text`, [corpo.id, sid, session.id]);
      if (!m) return null;
      await evento(q, m.id, 'annullata', { annullata_at: null }, { annullata_at: m.annullata_at, motivo: typeof corpo.motivo === 'string' ? corpo.motivo.slice(0, 200) : null });
      return m;
    });
    if (!esito) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (corpo.azione === 'etichetta') {
    if (!isUuid(corpo.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const nuova = typeof corpo.etichetta === 'string' ? corpo.etichetta.trim().slice(0, 80) : '';
    const esito = await transazione(async (q) => {
      const [prima] = await q<{ etichetta: string | null }>(`select etichetta from imaging_misure_manuali where id = $1 and studio_id = $2 and annullata_at is null`, [corpo.id, sid]);
      if (!prima) return null;
      await q(`update imaging_misure_manuali set etichetta = nullif($3, '') where id = $1 and studio_id = $2`, [corpo.id, sid, nuova]);
      await evento(q, corpo.id, 'etichettata', { etichetta: prima.etichetta }, { etichetta: nuova || null });
      return true;
    });
    if (!esito) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (corpo.azione === 'riferimento') {
    // Per la validazione: lega la misura a quella dell'apparecchio sullo stesso esame.
    if (!isUuid(corpo.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const rif = corpo.riferimento_misura_id;
    if (rif !== null && !isUuid(rif)) return NextResponse.json({ errore: 'riferimento_non_valido' }, { status: 400 });
    const esito = await transazione(async (q) => {
      const [prima] = await q<{ riferimento_misura_id: string | null }>(`select riferimento_misura_id from imaging_misure_manuali where id = $1 and studio_id = $2`, [corpo.id, sid]);
      if (!prima) return null;
      const [m] = await q<{ id: string }>(
        `update imaging_misure_manuali m set riferimento_misura_id = $3
          where m.id = $1 and m.studio_id = $2
            and ($3::uuid is null or exists (select 1 from imaging_misure r where r.id = $3 and r.esame_id = m.esame_id))
          returning m.id`, [corpo.id, sid, rif]);
      if (!m) return null;
      await evento(q, m.id, 'riferimento', { riferimento_misura_id: prima.riferimento_misura_id }, { riferimento_misura_id: rif });
      return m;
    });
    if (!esito) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // Nuova misura.
  const immagineId = String(corpo.immagine_id ?? '');
  if (!isUuid(immagineId)) return NextResponse.json({ errore: 'immagine_non_valida' }, { status: 400 });
  const punti = Array.isArray(corpo.punti) ? corpo.punti : [];
  if (punti.length !== 2 || !puntoValido(punti[0]) || !puntoValido(punti[1])) {
    return NextResponse.json({ errore: 'punti_non_validi' }, { status: 400 });
  }
  const frame = Number.isInteger(corpo.frame) && corpo.frame >= 0 ? Number(corpo.frame) : 0;
  const etichetta = typeof corpo.etichetta === 'string' ? corpo.etichetta.trim().slice(0, 80) : '';
  const rif = corpo.riferimento_misura_id;
  if (rif && !isUuid(rif)) return NextResponse.json({ errore: 'riferimento_non_valido' }, { status: 400 });

  const sostituisce = corpo.sostituisce_id;
  if (sostituisce && !isUuid(sostituisce)) return NextResponse.json({ errore: 'sostituisce_non_valido' }, { status: 400 });

  const [img] = await query<{ id: string; esame_id: string; immagine: boolean; calibrazione: Calibrazione | null; geometria: Geometria | null; frame: number; sha256: string | null }>(
    `select i.id, s.esame_id, i.immagine, i.calibrazione, i.geometria, i.frame, i.sha256
       from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id
      where i.id = $1 and e.studio_id = $2`, [immagineId, sid]);
  if (!img) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (!img.immagine) return NextResponse.json({ errore: 'non_immagine' }, { status: 415 });

  const M = mse();
  const p1: Punto = { x: Number(punti[0].x), y: Number(punti[0].y) };
  const p2: Punto = { x: Number(punti[1].x), y: Number(punti[1].y) };
  // Il Validation Gate, rifatto qui: lo stato lo decide il server.
  const esito = M.validazione.valuta({
    cal: img.calibrazione, geometria: img.geometria, frame, frameTotali: Math.max(1, img.frame),
    punti: [p1, p2], algoritmo: 'distanza', cautionValidati: cautionValidati(),
  });
  if (esito.stato === 'NOT_MEASURABLE' || esito.valore === null) {
    return NextResponse.json({ errore: esito.motivi[0] ?? 'non_misurabile', stato: esito.stato, motivi: esito.motivi, avvisi: esito.avvisi, testi: esito.testi, motivo: esito.testi[0] ?? '' }, { status: 422 });
  }
  // Doppio controllo: un'implementazione separata deve dare lo stesso numero.
  const b = await verificaIndipendente(img.calibrazione, [p1, p2]);
  const tolleranza = tolleranzaVerifica(esito.valore);
  const scarto = b.stato === 'ok' && typeof b.mm === 'number' ? Math.abs(b.mm - esito.valore) : null;
  const verifica = { metodo: 'imaging/verifica-indipendente.py (numpy.hypot)', valore_a: esito.valore, valore_b: b.mm ?? null, stato_b: b.stato, scarto, tolleranza, esito: scarto !== null && scarto <= tolleranza ? 'ok' : 'fallita' };
  if (verifica.esito !== 'ok') {
    console.error(`[imaging] verifica indipendente fallita: stato_b=${b.stato} scarto=${scarto} tolleranza=${tolleranza} immagine=${img.id}`);
    return NextResponse.json({ errore: 'verifica_indipendente_fallita', stato: 'NOT_MEASURABLE', motivi: ['verifica_indipendente_fallita'], testi: [M.validazione.testo('verifica_indipendente_fallita')], motivo: M.validazione.testo('verifica_indipendente_fallita'), verifica }, { status: 422 });
  }

  if (rif) {
    const [r] = await query<{ id: string }>(`select id from imaging_misure where id = $1 and esame_id = $2`, [rif, img.esame_id]);
    if (!r) return NextResponse.json({ errore: 'riferimento_non_valido' }, { status: 400 });
  }

  const riga = await transazione(async (q) => {
    if (sostituisce) {
      const [vecchia] = await q<{ id: string }>(`select id from imaging_misure_manuali where id = $1 and studio_id = $2 and immagine_id = $3 and annullata_at is null`, [sostituisce, sid, img.id]);
      if (!vecchia) return null;
    }
    const [nuova] = await q<{ id: string; quando: string }>(
      `insert into imaging_misure_manuali (studio_id, esame_id, immagine_id, frame, user_id, tipo, punti, valore, unita, calibrazione, versione_calcolo, etichetta, riferimento_misura_id,
                                          punti_fisici, valore_mostrato, algoritmo, versione_gate, versione_software, stato_validazione, avvisi, verifica_indipendente, geometria, sostituisce_id)
       values ($1,$2,$3,$4,$5,'distanza',$6,$7,$8,$9,$10,nullif($11,''),$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning id, created_at::text as quando`,
      [sid, img.esame_id, img.id, frame, session.id, JSON.stringify([p1, p2]), esito.valore, esito.unita, JSON.stringify(img.calibrazione),
       esito.versione_algoritmo, etichetta, rif || null,
       JSON.stringify(esito.punti_fisici), esito.valore_mostrato, esito.algoritmo, esito.versione_gate, versioneSoftware(), esito.stato,
       JSON.stringify(esito.avvisi), JSON.stringify(verifica), img.geometria ? JSON.stringify(img.geometria) : null, sostituisce || null]);
    await evento(q, nuova.id, 'creata', null, { valore: esito.valore, valore_mostrato: esito.valore_mostrato, stato: esito.stato, avvisi: esito.avvisi, etichetta: etichetta || null, punti: [p1, p2], frame, sha256_file: img.sha256, sostituisce_id: sostituisce || null });
    if (sostituisce) {
      await q(`update imaging_misure_manuali set annullata_at = now(), annullata_da = $3 where id = $1 and studio_id = $2`, [sostituisce, sid, session.id]);
      await evento(q, sostituisce, 'sostituita', { annullata_at: null }, { sostituita_da: nuova.id });
    }
    return nuova;
  });
  if (!riga) return NextResponse.json({ errore: 'sostituisce_non_valido' }, { status: 400 });
  try {
    await query(`insert into imaging_accessi (studio_id, esame_id, user_id, azione) values ($1,$2,$3,'misurato')`, [sid, img.esame_id, session.id]);
  } catch (e) { console.error(`[imaging] registro accessi: ${(e as Error)?.message ?? e}`); }

  return NextResponse.json({ ok: true, id: riga.id, valore: esito.valore, unita: esito.unita, testo: esito.valore_mostrato, stato: esito.stato, avvisi: esito.avvisi, testi: esito.testi, verifica, quando: riga.quando }, { status: 201 });
}

// La validazione, in numeri: tutte le misure manuali dello studio con la
// misura dell'apparecchio a cui sono state legate, e lo scarto. In CSV per il
// fascicolo (`?formato=csv`), in JSON per la pagina.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.studioId) return NextResponse.json({ errore: 'non_autorizzato' }, { status: 401 });
  if (!VEDE.has(session.role)) return NextResponse.json({ errore: 'ruolo_non_ammesso' }, { status: 403 });

  const righe = await query<{
    id: string; quando: string; chi: string | null; esame_id: string; data_esame: string | null; modalita: string;
    immagine_id: string; frame: number; etichetta: string | null; valore: number; annullata: boolean;
    stato_validazione: string | null; versione_calcolo: string; versione_software: string | null;
    rif_nome: string | null; rif_gruppo: string | null; rif_valore: number | null; rif_unita: string | null;
  }>(
    `select m.id, m.created_at::text as quando, split_part(u.email, '@', 1) as chi, m.esame_id, e.data_esame::text, e.modalita,
            m.immagine_id, m.frame, m.etichetta, m.valore, (m.annullata_at is not null) as annullata,
            m.stato_validazione, m.versione_calcolo, m.versione_software,
            r.nome as rif_nome, r.gruppo as rif_gruppo, r.valore as rif_valore, r.unita as rif_unita
       from imaging_misure_manuali m
       join imaging_esami e on e.id = m.esame_id
       left join users u on u.id = m.user_id
       left join imaging_misure r on r.id = m.riferimento_misura_id
      where m.studio_id = $1 order by m.created_at`, [session.studioId]);

  // Lo scarto si calcola solo quando le unità combaciano (mm/mm, o cm→mm).
  const inMm = (v: number | null, u: string | null) => v === null ? null : (u || '').toLowerCase() === 'cm' ? v * 10 : (u || 'mm').toLowerCase() === 'mm' ? v : null;
  const dati = righe.map((r) => {
    const rif = inMm(r.rif_valore, r.rif_unita);
    return { ...r, rif_mm: rif, scarto_mm: rif === null ? null : r.valore - rif };
  });
  const valide = dati.filter((d) => !d.annullata && d.scarto_mm !== null);
  const scarti = valide.map((d) => Math.abs(d.scarto_mm as number));
  const riepilogo = {
    totale: dati.length, annullate: dati.filter((d) => d.annullata).length, confrontate: valide.length,
    scarto_medio_mm: scarti.length ? scarti.reduce((a, b) => a + b, 0) / scarti.length : null,
    scarto_massimo_mm: scarti.length ? Math.max(...scarti) : null,
    entro_1mm: scarti.filter((s) => s <= 1).length,
  };

  if (req.nextUrl.searchParams.get('formato') === 'csv') {
    const n = (v: number | null) => v === null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
    const c = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const testa = ['data_misura', 'chi', 'esame', 'data_esame', 'modalita', 'immagine', 'fotogramma', 'etichetta', 'valore_mm', 'annullata', 'stato', 'versione_algoritmo', 'versione_software', 'riferimento', 'riferimento_mm', 'scarto_mm'];
    const corpo = dati.map((d) => [c(d.quando.slice(0, 19)), c(d.chi), c(d.esame_id), c(d.data_esame), c(d.modalita), c(d.immagine_id), d.frame + 1,
      c(d.etichetta), n(d.valore), d.annullata ? 'sì' : 'no', c(d.stato_validazione ?? ''), c(d.versione_calcolo), c(d.versione_software ?? ''),
      c(d.rif_nome ? `${d.rif_gruppo ? d.rif_gruppo + ' · ' : ''}${d.rif_nome}` : ''), n(d.rif_mm), n(d.scarto_mm)].join(';'));
    return new NextResponse('﻿' + [testa.join(';'), ...corpo].join('\r\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="validazione-righello.csv"', 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json({ riepilogo, misure: dati.slice(-200) }, { headers: { 'Cache-Control': 'no-store' } });
}
