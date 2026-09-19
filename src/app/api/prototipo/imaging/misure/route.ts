import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { query, transazione } from '@/lib/db';
import { statisticheRoi } from '@/lib/imaging';
import { pianoVirtuale } from '@/lib/imaging-serie';
import type { GeometriaSerie } from '@/lib/imaging-misura';
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

  if (corpo.azione === 'statistiche') {
    // Fase 4: i valori dei pixel dentro una ROI già salvata (rettangolo,
    // ellisse, poligono). HU solo per la TAC con Rescale; a.u. per la RM;
    // niente per il resto. Il risultato entra in `extra.statistiche` con il
    // suo doppio calcolo, e un evento lo registra.
    if (!isUuid(corpo.id)) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    const [m] = await query<{ id: string; tipo: string; frame: number; punti: Punto[]; extra: Record<string, unknown> | null; storage_key: string; immagine: boolean; modalita: string }>(
      `select m.id, m.tipo, m.frame, m.punti, m.extra, i.storage_key, i.immagine, e.modalita
         from imaging_misure_manuali m join imaging_immagini i on i.id = m.immagine_id join imaging_esami e on e.id = m.esame_id
        where m.id = $1 and m.studio_id = $2 and m.annullata_at is null`, [corpo.id, sid]);
    if (!m) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
    if (!['rettangolo', 'ellisse', 'poligono'].includes(m.tipo)) return NextResponse.json({ errore: 'roi_non_supportata', motivo: 'Le statistiche si calcolano su rettangolo, ellisse e poligono.' }, { status: 422 });
    const st = await statisticheRoi(m.storage_key, m.frame, m.tipo, m.punti);
    if (st.stato !== 'ok') {
      const testi: Record<string, string> = {
        statistiche_non_applicabili: 'Statistiche non applicabili: valgono solo per TAC (HU) e RM (unità arbitrarie), in immagini monocromatiche.',
        hu_non_disponibili: 'Unità Hounsfield non disponibili: il file non dichiara un Rescale in HU.',
        roi_vuota: 'La ROI non contiene pixel.', fotogramma_non_valido: 'Fotogramma inesistente.',
        verifica_indipendente_fallita: 'I due calcoli delle statistiche non coincidono: risultato non validato.',
        pixel_non_leggibili: 'Pixel non leggibili.', lettore_non_disponibile: 'Lettore DICOM non disponibile.',
      };
      console.error(`[imaging] statistiche: ${st.stato} misura=${m.id}`);
      return NextResponse.json({ errore: st.stato, motivo: testi[st.stato] ?? 'Statistiche non disponibili.' }, { status: 422 });
    }
    const statistiche = { unita: st.unita, n: st.n, min: st.min, max: st.max, media: st.media, deviazione: st.deviazione, verifica: st.verifica, rescale: st.rescale, avvisi: st.avvisi, versione_software: versioneSoftware(), quando: new Date().toISOString() };
    await transazione(async (q) => {
      await q(`update imaging_misure_manuali set extra = coalesce(extra, '{}'::jsonb) || $3::jsonb where id = $1 and studio_id = $2`, [m.id, sid, JSON.stringify({ statistiche })]);
      await evento(q, m.id, 'statistiche', m.extra?.statistiche ?? null, statistiche);
    });
    return NextResponse.json({ ok: true, statistiche });
  }

  if (corpo.azione === 'volume') {
    // Fase 9: il volume dai poligoni già salvati su fette consecutive della
    // stessa serie: V = Σ area × distanza reale fra le fette (dalla geometria
    // di serie, uniforme). Il server sceglie i dati, il motore calcola, il
    // verificatore ricalcola, e il volume diventa una misura come le altre.
    const ids: string[] = Array.isArray(corpo.misure) ? corpo.misure.filter((x: unknown) => typeof x === 'string' && isUuid(x)) : [];
    if (ids.length < 2) return NextResponse.json({ errore: 'volume_poche_fette', motivo: mse().validazione.testo('volume_poche_fette') }, { status: 422 });
    const pol = await query<{ id: string; immagine_id: string; serie_id: string; esame_id: string; valore: number; tipo: string; etichetta: string | null }>(
      `select m.id, m.immagine_id, i.serie_id, m.esame_id, m.valore, m.tipo, m.etichetta
         from imaging_misure_manuali m join imaging_immagini i on i.id = m.immagine_id
        where m.id = any($1::uuid[]) and m.studio_id = $2 and m.annullata_at is null and m.piano is null`, [ids, sid]);
    if (pol.length !== ids.length) return NextResponse.json({ errore: 'non_trovato', motivo: 'Una delle misure non esiste, è annullata o è su un piano ricostruito.' }, { status: 404 });
    if (pol.some((m) => m.tipo !== 'poligono' && m.tipo !== 'ellisse' && m.tipo !== 'rettangolo')) return NextResponse.json({ errore: 'roi_non_supportata', motivo: 'Il volume si calcola da poligoni, ellissi o rettangoli.' }, { status: 422 });
    if (new Set(pol.map((m) => m.serie_id)).size !== 1) return NextResponse.json({ errore: 'serie_diverse', motivo: 'Le ROI devono stare nella stessa serie.' }, { status: 422 });
    const [serie] = await query<{ geometria: GeometriaSerie | null }>(`select geometria from imaging_serie where id = $1`, [pol[0].serie_id]);
    const g = serie?.geometria;
    const ordine = g?.ordine ?? [];
    const indici = pol.map((m) => ordine.indexOf(m.immagine_id));
    if (indici.some((i) => i < 0)) return NextResponse.json({ errore: 'spazio_assente', motivo: mse().validazione.testo('spazio_assente') }, { status: 422 });
    if (new Set(pol.map((m) => m.immagine_id)).size !== pol.length) return NextResponse.json({ errore: 'poligoni_non_consecutivi', motivo: 'Una sola ROI per fetta.' }, { status: 422 });
    const ctxVolume = { aree_mm2: pol.map((m) => Number(m.valore)), indici, d_mm: g?.distanza_media_mm ?? null, uniforme: !!g?.uniforme, misure: pol.map((m) => m.id) };
    const M = mse();
    const esitoV = M.validazione.valuta({ cal: null, geometria: null, frame: 0, frameTotali: 1, punti: [], algoritmo: 'volume', volume: ctxVolume, cautionValidati: cautionValidati() });
    if (esitoV.stato === 'NOT_MEASURABLE' || !esitoV.ok) {
      return NextResponse.json({ errore: esitoV.motivi[0] ?? 'non_misurabile', stato: esitoV.stato, motivi: esitoV.motivi, avvisi: esitoV.avvisi, testi: esitoV.testi, motivo: esitoV.testi[0] ?? '' }, { status: 422 });
    }
    const bV = await verificaIndipendente(null, [], 'volume', { volume: ctxVolume });
    const tolV = tolleranzaVerifica(esitoV.valore as number);
    const scartoV = bV.stato === 'ok' && typeof bV.mm === 'number' ? Math.abs(bV.mm - (esitoV.valore as number)) : null;
    const verificaV = { metodo: 'imaging/verifica-indipendente.py (numpy)', algoritmo: 'volume', valore_a: esitoV.valore, valore_b: bV.mm ?? null, stato_b: bV.stato, scarto: scartoV, tolleranza: tolV, esito: scartoV !== null && scartoV <= tolV ? 'ok' : 'fallita' };
    if (verificaV.esito !== 'ok') return NextResponse.json({ errore: 'verifica_indipendente_fallita', motivo: M.validazione.testo('verifica_indipendente_fallita'), verifica: verificaV }, { status: 422 });
    const primo = pol.slice().sort((a, b) => indici[pol.indexOf(a)] - indici[pol.indexOf(b)])[0];
    const riga = await transazione(async (q) => {
      const [nuova] = await q<{ id: string; quando: string }>(
        `insert into imaging_misure_manuali (studio_id, esame_id, immagine_id, frame, user_id, tipo, punti, valore, unita, calibrazione, versione_calcolo, etichetta,
                                            punti_fisici, valore_mostrato, algoritmo, versione_gate, versione_software, stato_validazione, avvisi, verifica_indipendente, geometria, extra)
         values ($1,$2,$3,0,$4,'volume','[]'::jsonb,$5,$6,$7,$8,nullif($9,''),'[]'::jsonb,$10,'volume',$11,$12,$13,$14,$15,$16,$17) returning id, created_at::text as quando`,
        [sid, primo.esame_id, primo.immagine_id, session.id, esitoV.valore, esitoV.unita, JSON.stringify({ tipo: 'serie', distanza_fette_mm: g?.distanza_media_mm, uniforme: g?.uniforme }),
         esitoV.versione_algoritmo, typeof corpo.etichetta === 'string' ? corpo.etichetta.trim().slice(0, 80) : '', esitoV.valore_mostrato, esitoV.versione_gate, versioneSoftware(), esitoV.stato,
         JSON.stringify(esitoV.avvisi), JSON.stringify(verificaV), JSON.stringify(g), JSON.stringify(esitoV.extra)]);
      await evento(q, nuova.id, 'creata', null, { tipo: 'volume', valore: esitoV.valore, unita: esitoV.unita, valore_mostrato: esitoV.valore_mostrato, extra: esitoV.extra, stato: esitoV.stato, avvisi: esitoV.avvisi });
      return nuova;
    });
    return NextResponse.json({ ok: true, id: riga.id, tipo: 'volume', valore: esitoV.valore, unita: esitoV.unita, extra: esitoV.extra, testo: esitoV.valore_mostrato, stato: esitoV.stato, avvisi: esitoV.avvisi, verifica: verificaV }, { status: 201 });
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

  // Nuova misura: l'algoritmo è uno di quelli dichiarati dal motore, e i
  // punti sono quanti quell'algoritmo vuole (il motore lo dice, non la rotta).
  const immagineId = String(corpo.immagine_id ?? '');
  if (!isUuid(immagineId)) return NextResponse.json({ errore: 'immagine_non_valida' }, { status: 400 });
  const algoritmo = typeof corpo.algoritmo === 'string' ? corpo.algoritmo : 'distanza';
  const alg = mse().misure.ALGORITMI[algoritmo];
  if (!alg) return NextResponse.json({ errore: 'algoritmo_sconosciuto' }, { status: 400 });
  const punti = Array.isArray(corpo.punti) ? corpo.punti : [];
  if (punti.length < alg.punti[0] || punti.length > alg.punti[1] || !punti.every((p: unknown) => puntoValido(p))) {
    return NextResponse.json({ errore: 'punti_non_validi' }, { status: 400 });
  }
  const frame = Number.isInteger(corpo.frame) && corpo.frame >= 0 ? Number(corpo.frame) : 0;   // per i piani MPR si azzera più sotto
  const etichetta = typeof corpo.etichetta === 'string' ? corpo.etichetta.trim().slice(0, 80) : '';
  const rif = corpo.riferimento_misura_id;
  if (rif && !isUuid(rif)) return NextResponse.json({ errore: 'riferimento_non_valido' }, { status: 400 });

  const sostituisce = corpo.sostituisce_id;
  if (sostituisce && !isUuid(sostituisce)) return NextResponse.json({ errore: 'sostituisce_non_valido' }, { status: 400 });

  const [img] = await query<{ id: string; esame_id: string; serie_id: string; immagine: boolean; calibrazione: Calibrazione | null; geometria: Geometria | null; frame: number; sha256: string | null; geometria_serie: GeometriaSerie | null }>(
    `select i.id, s.esame_id, s.id as serie_id, i.immagine, i.calibrazione, i.geometria, i.frame, i.sha256, s.geometria as geometria_serie
       from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id
      where i.id = $1 and e.studio_id = $2`, [immagineId, sid]);
  if (!img) return NextResponse.json({ errore: 'non_trovato' }, { status: 404 });
  if (!img.immagine) return NextResponse.json({ errore: 'non_immagine' }, { status: 415 });

  const M = mse();
  // Misura su un piano ricostruito (MPR): la griglia virtuale e la sua
  // calibrazione le decide il SERVER dalla geometria di serie, non il browser.
  let piano: { piano: 'sagittale' | 'coronale'; indice: number } | null = null;
  let calBase = img.calibrazione, geoBase = img.geometria, frameTot = Math.max(1, img.frame), frameUso = frame;
  let virt: ReturnType<typeof pianoVirtuale> = null;
  if (corpo.piano && typeof corpo.piano === 'object') {
    const tipoPiano = corpo.piano.tipo === 'coronale' ? 'coronale' : corpo.piano.tipo === 'sagittale' ? 'sagittale' : null;
    if (!tipoPiano || !Number.isInteger(corpo.piano.indice)) return NextResponse.json({ errore: 'piano_non_valido' }, { status: 400 });
    virt = img.geometria_serie ? pianoVirtuale(img.geometria_serie, tipoPiano) : null;
    if (!virt) return NextResponse.json({ errore: 'serie_non_ricostruibile', motivo: 'Questa serie non si ricostruisce: fette non uniformi o geometria assente.' }, { status: 422 });
    if (corpo.piano.indice < 0 || corpo.piano.indice >= virt.n_indici) return NextResponse.json({ errore: 'piano_non_valido' }, { status: 400 });
    piano = { piano: tipoPiano, indice: Number(corpo.piano.indice) };
    calBase = virt.calibrazione as Calibrazione; geoBase = virt.geometria; frameTot = 1; frameUso = 0;
    if (algoritmo === 'distanza_3d' || algoritmo === 'volume') return NextResponse.json({ errore: 'algoritmo_non_su_mpr' }, { status: 400 });
  }
  const pts: (Punto & { immagine_id?: string })[] = punti.map((p: Punto & { immagine_id?: string }) => ({ x: Number(p.x), y: Number(p.y), ...(typeof p.immagine_id === 'string' ? { immagine_id: p.immagine_id } : {}) }));
  // Distanza 3D: ogni punto porta la sua immagine; le geometrie le carica il server (stessa serie, stesso studio).
  let geometrie: Record<string, Geometria | null> | undefined;
  if (algoritmo === 'distanza_3d') {
    const idsImg = pts.map((p) => p.immagine_id ?? img.id);
    if (!idsImg.every((x) => isUuid(x))) return NextResponse.json({ errore: 'punti_non_validi' }, { status: 400 });
    const righeG = await query<{ id: string; geometria: Geometria | null }>(
      `select i.id, i.geometria from imaging_immagini i join imaging_serie s on s.id = i.serie_id join imaging_esami e on e.id = s.esame_id
        where i.id = any($1::uuid[]) and e.studio_id = $2 and s.id = $3`, [idsImg, sid, img.serie_id]);
    geometrie = Object.fromEntries(righeG.map((r) => [r.id, r.geometria]));
    pts.forEach((p, k) => { p.immagine_id = idsImg[k]; });
  }
  // Il Validation Gate, rifatto qui: lo stato lo decide il server.
  const esito = M.validazione.valuta({
    cal: calBase, geometria: geoBase, frame: frameUso, frameTotali: frameTot,
    punti: pts, algoritmo, cautionValidati: cautionValidati(), geometrie,
  });
  if (esito.stato === 'NOT_MEASURABLE' || !esito.ok) {
    return NextResponse.json({ errore: esito.motivi[0] ?? 'non_misurabile', stato: esito.stato, motivi: esito.motivi, avvisi: esito.avvisi, testi: esito.testi, motivo: esito.testi[0] ?? '' }, { status: 422 });
  }
  // Doppio controllo: un'implementazione separata deve dare lo stesso numero
  // (per il punto: le due coordinate).
  const calEff = (esito as unknown as { cal: Calibrazione | null }).cal ?? calBase;
  const b = await verificaIndipendente(calEff, pts, algoritmo, geometrie ? { geometrie } : undefined);
  const valoreA = algoritmo === 'punto' ? Number(esito.extra?.x_mm) : (esito.valore as number);
  const tolleranza = tolleranzaVerifica(valoreA);
  let scarto: number | null = b.stato === 'ok' && typeof b.mm === 'number' ? Math.abs(b.mm - valoreA) : null;
  if (algoritmo === 'punto' && scarto !== null && typeof b.y_mm === 'number') scarto = Math.max(scarto, Math.abs(b.y_mm - Number(esito.extra?.y_mm)));
  const verifica = { metodo: 'imaging/verifica-indipendente.py (numpy)', algoritmo, valore_a: valoreA, valore_b: b.mm ?? null, stato_b: b.stato, scarto, tolleranza, esito: scarto !== null && scarto <= tolleranza ? 'ok' : 'fallita' };
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
                                          punti_fisici, valore_mostrato, algoritmo, versione_gate, versione_software, stato_validazione, avvisi, verifica_indipendente, geometria, sostituisce_id, extra, piano)
       values ($1,$2,$3,$4,$5,$23,$6,$7,$8,$9,$10,nullif($11,''),$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$24,$25) returning id, created_at::text as quando`,
      [sid, img.esame_id, img.id, frameUso, session.id, JSON.stringify(pts), esito.valore, esito.unita, JSON.stringify(calEff),
       esito.versione_algoritmo, etichetta, rif || null,
       JSON.stringify(esito.punti_fisici), esito.valore_mostrato, esito.algoritmo, esito.versione_gate, versioneSoftware(), esito.stato,
       JSON.stringify(esito.avvisi), JSON.stringify(verifica), geoBase ? JSON.stringify(geoBase) : null, sostituisce || null,
       algoritmo, esito.extra ? JSON.stringify(esito.extra) : null,
       piano ? JSON.stringify({ ...piano, colonne: virt!.colonne, righe: virt!.righe, sp_x: virt!.sp_x, sp_y: virt!.sp_y, serie_id: img.serie_id }) : null]);
    await evento(q, nuova.id, 'creata', null, { tipo: algoritmo, valore: esito.valore, unita: esito.unita, valore_mostrato: esito.valore_mostrato, extra: esito.extra, stato: esito.stato, avvisi: esito.avvisi, etichetta: etichetta || null, punti: pts, frame: frameUso, piano, sha256_file: img.sha256, sostituisce_id: sostituisce || null });
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

  return NextResponse.json({ ok: true, id: riga.id, tipo: algoritmo, valore: esito.valore, unita: esito.unita, extra: esito.extra, testo: esito.valore_mostrato, stato: esito.stato, avvisi: esito.avvisi, testi: esito.testi, verifica, quando: riga.quando }, { status: 201 });
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
    immagine_id: string; frame: number; etichetta: string | null; valore: number | null; annullata: boolean; tipo: string; unita: string;
    stato_validazione: string | null; versione_calcolo: string; versione_software: string | null;
    rif_nome: string | null; rif_gruppo: string | null; rif_valore: number | null; rif_unita: string | null;
  }>(
    `select m.id, m.created_at::text as quando, split_part(u.email, '@', 1) as chi, m.esame_id, e.data_esame::text, e.modalita,
            m.immagine_id, m.frame, m.etichetta, m.valore, (m.annullata_at is not null) as annullata, m.tipo, m.unita,
            m.stato_validazione, m.versione_calcolo, m.versione_software,
            r.nome as rif_nome, r.gruppo as rif_gruppo, r.valore as rif_valore, r.unita as rif_unita
       from imaging_misure_manuali m
       join imaging_esami e on e.id = m.esame_id
       left join users u on u.id = m.user_id
       left join imaging_misure r on r.id = m.riferimento_misura_id
      where m.studio_id = $1 order by m.created_at`, [session.studioId]);

  // Lo scarto si calcola solo quando le unità combaciano (mm/mm, o cm→mm).
  // Lo scarto si calcola nell'unità della misura: mm↔mm/cm, mm²↔mm²/cm², gradi↔gradi.
  const nellaUnita = (v: number | null, u: string | null, unita: string): number | null => {
    if (v === null) return null;
    const uu = (u || '').toLowerCase().replace('2', '²');
    if (unita === 'mm') return uu === 'cm' ? v * 10 : (uu === 'mm' || uu === '') ? v : null;
    if (unita === 'mm²') return uu === 'cm²' ? v * 100 : uu === 'mm²' ? v : null;
    if (unita === '°') return (uu === '°' || uu === 'deg' || uu === 'gradi' || uu === '') ? v : null;
    return null;
  };
  const dati = righe.map((r) => {
    const rif = nellaUnita(r.rif_valore, r.rif_unita, r.unita);
    return { ...r, rif_mm: rif, scarto_mm: rif === null || r.valore === null ? null : r.valore - rif };
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
    const testa = ['data_misura', 'chi', 'esame', 'data_esame', 'modalita', 'immagine', 'fotogramma', 'strumento', 'etichetta', 'valore', 'unita', 'annullata', 'stato', 'versione_algoritmo', 'versione_software', 'riferimento', 'riferimento_nella_unita', 'scarto'];
    const corpo = dati.map((d) => [c(d.quando.slice(0, 19)), c(d.chi), c(d.esame_id), c(d.data_esame), c(d.modalita), c(d.immagine_id), d.frame + 1,
      c(d.tipo), c(d.etichetta), n(d.valore), c(d.unita), d.annullata ? 'sì' : 'no', c(d.stato_validazione ?? ''), c(d.versione_calcolo), c(d.versione_software ?? ''),
      c(d.rif_nome ? `${d.rif_gruppo ? d.rif_gruppo + ' · ' : ''}${d.rif_nome}` : ''), n(d.rif_mm), n(d.scarto_mm)].join(';'));
    return new NextResponse('﻿' + [testa.join(';'), ...corpo].join('\r\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="validazione-righello.csv"', 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json({ riepilogo, misure: dati.slice(-200) }, { headers: { 'Cache-Control': 'no-store' } });
}
