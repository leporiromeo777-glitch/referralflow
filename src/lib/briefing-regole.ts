// Regole del briefing pre-visita (13.9.2026): la parte PURA della procedura,
// senza DB né modello, testata in `prove-briefing.test.ts`. Riceve i dati già
// letti (documenti, referto precedente, referral, appuntamenti) e decide
// cosa c'è, cosa manca e da dove viene ogni riga. Il modello, se c'è, scrive
// solo la sintesi finale sopra queste righe; il codice decide i passi.

export type Fonte = { tipo: 'documento' | 'referto' | 'appuntamento' | 'referral' | 'questionario'; id: string; titolo: string; data?: string };
export type Riga = { testo: string; fonte?: Fonte };
export type Sezione = { chiave: string; titolo: string; righe: Riga[] };
export type Mancante = { controllo: string; testo: string };
export type Passo = { passo: string; esito: 'ok' | 'mancante' | 'vuoto'; fonti: string[]; nota?: string };

export type DocumentoIn = { id: string; filename: string; nota: string | null; categoria: string; uploaded_at: string };
export type ReferralIn = { id: string; quesito: string | null; urgenza: string; status: string; medico: string | null; created_at: string; follow_up_due: string | null; follow_up_done_at: string | null; questionario: { motivo?: string; farmaci?: string; allergie?: string; note?: string } | null };
export type AppuntamentoIn = { id: string; starts_at: string; motivo: string | null; medico: string | null; completed_at: string | null };
export type RefertoPrecedente = { id: string; data: string | null; terapia: string[]; fonte: 'referto' | 'documento' } | null;
export type BozzaIn = { id: string; created_at: string; critiche: number };

export type IngressoBriefing = {
  oggi: Date;
  documenti: DocumentoIn[];
  referral: ReferralIn[];
  appuntamenti: AppuntamentoIn[];
  refertoPrecedente: RefertoPrecedente;
  bozze: BozzaIn[];
};

export type Briefing = { sezioni: Sezione[]; mancanti: Mancante[]; passi: Passo[]; fonti: Fonte[] };

export const MESI_ECG = 12;
export const MESI_ECO = 24;
export const MESI_DOCUMENTI_RECENTI = 24;

export function dataCh(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function mesiFa(oggi: Date, mesi: number): number {
  const d = new Date(oggi);
  d.setMonth(d.getMonth() - mesi);
  return d.getTime();
}

// Che esame è un documento: dalla categoria e, per «altro»/«imaging», dalle
// parole del titolo o del nome del file. Deterministico.
export function tipoEsame(d: { filename: string; nota: string | null; categoria: string }): 'ecg' | 'eco' | 'holter' | 'ergometria' | 'duplex' | 'laboratorio' | 'lettera' | 'referto' | 'altro' {
  const t = `${d.nota ?? ''} ${d.filename}`.toLowerCase();
  if (d.categoria === 'lettera') return 'lettera';
  if (/holter/.test(t)) return 'holter';
  if (/ergometr|da sforzo|cicloergometr/.test(t)) return 'ergometria';
  if (/duplex|doppler|carotid/.test(t)) return 'duplex';
  if (/ecocardio|\beco\b|ecocg|transtoracic/.test(t)) return 'eco';
  if (d.categoria === 'ecg' || /\becg\b|elettrocardiogramm/.test(t)) return 'ecg';
  if (/laborator|esami ematici|analisi|emocromo|creatinina|colesterol/.test(t)) return 'laboratorio';
  if (d.categoria === 'referto') return 'referto';
  return 'altro';
}

const ETICHETTA: Record<ReturnType<typeof tipoEsame>, string> = {
  ecg: 'ECG', eco: 'ecocardiogramma', holter: 'Holter', ergometria: 'ergometria', duplex: 'duplex', laboratorio: 'laboratorio', lettera: 'lettera', referto: 'referto', altro: 'documento',
};

export function costruisciBriefing(i: IngressoBriefing): Briefing {
  const sezioni: Sezione[] = [];
  const mancanti: Mancante[] = [];
  const passi: Passo[] = [];
  const fonti: Fonte[] = [];
  const fonteDoc = (d: DocumentoIn): Fonte => ({ tipo: 'documento', id: d.id, titolo: d.nota || d.filename, data: dataCh(d.uploaded_at) });
  const registra = (f: Fonte) => { if (!fonti.some((x) => x.tipo === f.tipo && x.id === f.id)) fonti.push(f); return f; };

  // 1. Motivo della visita: referral aperte (quesito, medico inviante, urgenza).
  const aperte = i.referral.filter((r) => r.status !== 'chiusa');
  const motivo: Riga[] = aperte.map((r) => ({
    testo: `${r.quesito?.trim() || 'quesito non indicato'}${r.medico ? ` · inviata da ${r.medico}` : ''}${r.urgenza === 'urgente' ? ' · URGENTE' : ''} (${dataCh(r.created_at)})`,
    fonte: registra({ tipo: 'referral', id: r.id, titolo: 'Referral', data: dataCh(r.created_at) }),
  }));
  sezioni.push({ chiave: 'motivo', titolo: 'Motivo della visita', righe: motivo.length ? motivo : [{ testo: 'Nessuna referral aperta: visita di controllo o accesso diretto.' }] });
  passi.push({ passo: 'Referral aperte del paziente', esito: motivo.length ? 'ok' : 'vuoto', fonti: aperte.map((r) => r.id) });

  // 2. Questionario pre-visita compilato dal paziente (farmaci, allergie, note).
  const conQ = aperte.find((r) => r.questionario && (r.questionario.motivo || r.questionario.farmaci || r.questionario.allergie || r.questionario.note));
  if (conQ?.questionario) {
    const q = conQ.questionario;
    const f = registra({ tipo: 'questionario', id: conQ.id, titolo: 'Questionario pre-visita' });
    const righe: Riga[] = [];
    if (q.motivo) righe.push({ testo: `Motivo dichiarato: ${q.motivo}`, fonte: f });
    if (q.farmaci) righe.push({ testo: `Farmaci dichiarati: ${q.farmaci}`, fonte: f });
    if (q.allergie) righe.push({ testo: `Allergie: ${q.allergie}`, fonte: f });
    if (q.note) righe.push({ testo: `Note: ${q.note}`, fonte: f });
    sezioni.push({ chiave: 'questionario', titolo: 'Dichiarato dal paziente', righe });
    passi.push({ passo: 'Questionario pre-visita', esito: 'ok', fonti: [conQ.id] });
  } else {
    passi.push({ passo: 'Questionario pre-visita', esito: 'vuoto', fonti: [] });
  }

  // 3. Ultimo referto confermato (o lettera in cartella) e la sua terapia.
  const prec = i.refertoPrecedente;
  if (prec) {
    const f = registra({ tipo: prec.fonte, id: prec.id, titolo: prec.fonte === 'referto' ? 'Ultimo referto confermato' : 'Ultima lettera in cartella', data: prec.data ? dataCh(prec.data) : undefined });
    sezioni.push({ chiave: 'ultimo_referto', titolo: 'Ultimo referto', righe: [{ testo: `${f.titolo}${f.data ? ` del ${f.data}` : ''}`, fonte: f }] });
    sezioni.push({
      chiave: 'terapia', titolo: 'Terapia in corso (dall’ultima lettera)',
      righe: prec.terapia.length ? prec.terapia.map((t) => ({ testo: t, fonte: f })) : [{ testo: 'La lettera non ha un blocco «Terapia».' }],
    });
    passi.push({ passo: 'Ultimo referto confermato e terapia', esito: prec.terapia.length ? 'ok' : 'vuoto', fonti: [prec.id], nota: prec.terapia.length ? `${prec.terapia.length} righe di terapia` : 'nessun blocco Terapia' });
  } else {
    sezioni.push({ chiave: 'terapia', titolo: 'Terapia in corso', righe: [{ testo: 'Nessuna lettera precedente in piattaforma né in cartella: chiedere la terapia al paziente.' }] });
    mancanti.push({ controllo: 'lettera_precedente', testo: 'Nessun referto confermato né lettera in cartella per questo paziente.' });
    passi.push({ passo: 'Ultimo referto confermato e terapia', esito: 'mancante', fonti: [] });
  }

  // 4. Esami in cartella: gli ultimi 24 mesi per tipo, con le condizioni
  //    «ECG negli ultimi 12 mesi» e «ecocardiogramma negli ultimi 24 mesi».
  const recenti = i.documenti.filter((d) => new Date(d.uploaded_at).getTime() >= mesiFa(i.oggi, MESI_DOCUMENTI_RECENTI)).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const esami = recenti.filter((d) => tipoEsame(d) !== 'lettera');
  sezioni.push({
    chiave: 'esami', titolo: `Esami in cartella (ultimi ${MESI_DOCUMENTI_RECENTI} mesi)`,
    righe: esami.length ? esami.slice(0, 12).map((d) => ({ testo: `${ETICHETTA[tipoEsame(d)]}: ${d.nota || d.filename} (${dataCh(d.uploaded_at)})`, fonte: registra(fonteDoc(d)) })) : [{ testo: 'Nessun esame in cartella negli ultimi 24 mesi.' }],
  });
  passi.push({ passo: `Documenti degli ultimi ${MESI_DOCUMENTI_RECENTI} mesi`, esito: esami.length ? 'ok' : 'vuoto', fonti: esami.map((d) => d.id) });

  const ecg = i.documenti.filter((d) => tipoEsame(d) === 'ecg' && new Date(d.uploaded_at).getTime() >= mesiFa(i.oggi, MESI_ECG));
  if (ecg.length) {
    passi.push({ passo: `ECG negli ultimi ${MESI_ECG} mesi`, esito: 'ok', fonti: ecg.map((d) => d.id), nota: `ultimo del ${dataCh(ecg[0].uploaded_at)}` });
  } else {
    mancanti.push({ controllo: 'ecg_12_mesi', testo: `Nessun ECG negli ultimi ${MESI_ECG} mesi in cartella: da fare o da chiedere.` });
    passi.push({ passo: `ECG negli ultimi ${MESI_ECG} mesi`, esito: 'mancante', fonti: [] });
  }
  const eco = i.documenti.filter((d) => tipoEsame(d) === 'eco' && new Date(d.uploaded_at).getTime() >= mesiFa(i.oggi, MESI_ECO));
  if (eco.length) {
    passi.push({ passo: `Ecocardiogramma negli ultimi ${MESI_ECO} mesi`, esito: 'ok', fonti: eco.map((d) => d.id), nota: `ultimo del ${dataCh(eco[0].uploaded_at)}` });
  } else {
    mancanti.push({ controllo: 'eco_24_mesi', testo: `Nessun ecocardiogramma negli ultimi ${MESI_ECO} mesi in cartella.` });
    passi.push({ passo: `Ecocardiogramma negli ultimi ${MESI_ECO} mesi`, esito: 'mancante', fonti: [] });
  }

  // 5. Visite: ultima passata e prossima.
  const adesso = i.oggi.getTime();
  const ordinati = [...i.appuntamenti].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const passati = ordinati.filter((a) => new Date(a.starts_at).getTime() < adesso);
  const futuri = ordinati.filter((a) => new Date(a.starts_at).getTime() >= adesso);
  const visite: Riga[] = [];
  const ultima = passati[passati.length - 1];
  if (ultima) visite.push({ testo: `Ultima visita: ${dataCh(ultima.starts_at)}${ultima.medico ? ` · ${ultima.medico}` : ''}${ultima.motivo ? ` · ${ultima.motivo}` : ''}`, fonte: registra({ tipo: 'appuntamento', id: ultima.id, titolo: 'Agenda', data: dataCh(ultima.starts_at) }) });
  const prossima = futuri[0];
  if (prossima) {
    const d = new Date(prossima.starts_at);
    visite.push({ testo: `Prossimo appuntamento: ${dataCh(prossima.starts_at)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}${prossima.medico ? ` · ${prossima.medico}` : ''}${prossima.motivo ? ` · ${prossima.motivo}` : ''}`, fonte: registra({ tipo: 'appuntamento', id: prossima.id, titolo: 'Agenda', data: dataCh(prossima.starts_at) }) });
  }
  sezioni.push({ chiave: 'visite', titolo: 'Visite', righe: visite.length ? visite : [{ testo: 'Nessun appuntamento in agenda per questo paziente.' }] });
  passi.push({ passo: 'Appuntamenti in agenda', esito: visite.length ? 'ok' : 'vuoto', fonti: [ultima?.id, prossima?.id].filter((x): x is string => !!x) });

  // 6. Cose in sospeso: richiami scaduti, bozze di referto da rivedere.
  const sospeso: Riga[] = [];
  for (const r of i.referral) {
    if (r.follow_up_due && !r.follow_up_done_at && new Date(r.follow_up_due).getTime() < adesso) {
      sospeso.push({ testo: `Richiamo scaduto il ${dataCh(r.follow_up_due)}`, fonte: registra({ tipo: 'referral', id: r.id, titolo: 'Referral', data: dataCh(r.created_at) }) });
      mancanti.push({ controllo: 'richiamo_scaduto', testo: `Richiamo scaduto il ${dataCh(r.follow_up_due)}.` });
    }
  }
  for (const b of i.bozze) {
    sospeso.push({ testo: `Bozza di referto del ${dataCh(b.created_at)} ancora da rivedere${b.critiche ? ` (${b.critiche} critiche)` : ''}`, fonte: registra({ tipo: 'referto', id: b.id, titolo: 'Bozza di referto', data: dataCh(b.created_at) }) });
    mancanti.push({ controllo: 'bozza_da_rivedere', testo: `Un referto dettato il ${dataCh(b.created_at)} non è ancora stato confermato.` });
  }
  if (sospeso.length) sezioni.push({ chiave: 'sospeso', titolo: 'In sospeso', righe: sospeso });
  passi.push({ passo: 'Richiami scaduti e bozze da rivedere', esito: sospeso.length ? 'ok' : 'vuoto', fonti: sospeso.map((s) => s.fonte?.id ?? '').filter(Boolean), nota: sospeso.length ? `${sospeso.length} in sospeso` : 'niente in sospeso' });

  return { sezioni, mancanti, passi, fonti };
}

// I fatti da scrivere nel grafo (tabella pazienti_fatti) a partire dal briefing.
export type FattoOut = { relazione: string; oggetto: string; dettaglio: Record<string, unknown>; fonte_tipo: string; fonte_id: string | null; data_fatto: string | null };

function isoData(ch: string | undefined): string | null {
  const m = ch?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function fattiDalBriefing(b: Briefing, i: IngressoBriefing): FattoOut[] {
  const out: FattoOut[] = [];
  for (const d of i.documenti) out.push({ relazione: 'ha_documento', oggetto: d.nota || d.filename, dettaglio: { tipo: tipoEsame(d), categoria: d.categoria }, fonte_tipo: 'documento', fonte_id: d.id, data_fatto: d.uploaded_at.slice(0, 10) });
  if (i.refertoPrecedente) {
    const p = i.refertoPrecedente;
    out.push({ relazione: 'ultimo_referto', oggetto: p.fonte === 'referto' ? 'referto confermato' : 'lettera in cartella', dettaglio: { righe_terapia: p.terapia.length }, fonte_tipo: p.fonte, fonte_id: p.id, data_fatto: p.data ? p.data.slice(0, 10) : null });
    for (const t of p.terapia) out.push({ relazione: 'terapia_riga', oggetto: t, dettaglio: {}, fonte_tipo: p.fonte, fonte_id: p.id, data_fatto: p.data ? p.data.slice(0, 10) : null });
  }
  for (const r of i.referral.filter((r) => r.status !== 'chiusa')) out.push({ relazione: 'referral_aperta', oggetto: r.quesito?.trim() || 'quesito non indicato', dettaglio: { urgenza: r.urgenza, medico: r.medico }, fonte_tipo: 'referral', fonte_id: r.id, data_fatto: r.created_at.slice(0, 10) });
  for (const s of b.sezioni.find((s) => s.chiave === 'visite')?.righe ?? []) {
    if (!s.fonte) continue;
    out.push({ relazione: s.testo.startsWith('Prossimo') ? 'prossimo_appuntamento' : 'ultima_visita', oggetto: s.testo, dettaglio: {}, fonte_tipo: 'appuntamento', fonte_id: s.fonte.id, data_fatto: isoData(s.fonte.data) });
  }
  for (const m of b.mancanti) out.push({ relazione: m.controllo === 'richiamo_scaduto' ? 'richiamo_scaduto' : m.controllo === 'bozza_da_rivedere' ? 'bozza_da_rivedere' : 'esame_mancante', oggetto: m.testo, dettaglio: { controllo: m.controllo }, fonte_tipo: 'procedura', fonte_id: null, data_fatto: null });
  return out;
}

// Testo del briefing scritto dal CODICE: è la risposta quando il modello non
// c'è, ed è quello che il modello riceve per scrivere la sintesi.
export function testoBriefing(nome: string, b: Briefing): string {
  const righe: string[] = [`Briefing pre-visita per ${nome}`];
  for (const s of b.sezioni) {
    righe.push('', `${s.titolo}:`);
    for (const r of s.righe) righe.push(`- ${r.testo}`);
  }
  if (b.mancanti.length) {
    righe.push('', 'Da segnalare al medico:');
    for (const m of b.mancanti) righe.push(`- ${m.testo}`);
  }
  return righe.join('\n');
}
