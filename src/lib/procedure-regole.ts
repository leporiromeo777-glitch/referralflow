// Regole PURE delle procedure dell'assistente oltre il briefing (13.9.2026):
// «cosa è cambiato dall'ultima visita», «richiami del mese», «controllo prima
// della firma». Nessun DB, nessun modello: ricevono dati già letti e
// producono sezioni con fonte per riga, mancanze e passi con esito. Test in
// `prove-procedure.test.ts`. Il modello locale non entra in nessuna di
// queste: sono confronti e conteggi, li fa meglio il codice.
import { estraiTerapia, stessoFarmaco } from './referti-terapia';
import { dataCh, type Fonte, type Mancante, type Passo, type Riga, type Sezione } from './briefing-regole';

export type EsitoProcedura = {
  procedura: string;
  titolo: string;
  sottotitolo?: string;
  sintesi: string | null;
  sezioni: Sezione[];
  mancanti: Mancante[];
  fonti: Fonte[];
  azioni: { etichetta: string; go?: string; href?: string }[];
  passi: Passo[];
};

/* ---------- cosa è cambiato dall'ultima visita ---------- */
export type RefertoConfermato = { id: string; data: string | null; testo: string };

export function confrontaReferti(
  prima: RefertoConfermato | null,
  dopo: RefertoConfermato | null,
  misureDi: (testo: string) => Record<string, string[]>
): Omit<EsitoProcedura, 'procedura' | 'titolo' | 'azioni'> {
  const sezioni: Sezione[] = [];
  const mancanti: Mancante[] = [];
  const passi: Passo[] = [];
  const fonti: Fonte[] = [];
  if (!prima || !dopo) {
    passi.push({ passo: 'Ultimi due referti confermati del paziente', esito: 'mancante', fonti: [dopo?.id, prima?.id].filter((x): x is string => !!x), nota: dopo ? 'uno solo' : 'nessuno' });
    mancanti.push({ controllo: 'due_referti', testo: dopo ? 'C’è un solo referto confermato: il confronto ha bisogno di due visite.' : 'Nessun referto confermato per questo paziente.' });
    return { sottotitolo: undefined, sintesi: null, sezioni, mancanti, fonti, passi };
  }
  const fPrima: Fonte = { tipo: 'referto', id: prima.id, titolo: 'Referto precedente', data: prima.data ? dataCh(prima.data) : undefined };
  const fDopo: Fonte = { tipo: 'referto', id: dopo.id, titolo: 'Ultimo referto', data: dopo.data ? dataCh(dopo.data) : undefined };
  fonti.push(fDopo, fPrima);
  passi.push({ passo: 'Ultimi due referti confermati del paziente', esito: 'ok', fonti: [dopo.id, prima.id], nota: `${fPrima.data ?? '?'} → ${fDopo.data ?? '?'}` });

  // Misure: per ogni misura presente in entrambi, il primo valore.
  const a = misureDi(prima.testo);
  const b = misureDi(dopo.testo);
  const cambiate: Riga[] = [];
  const uguali: string[] = [];
  const soloDopo: string[] = [];
  for (const nome of Object.keys(b)) {
    if (!(nome in a)) { soloDopo.push(`${nome} ${b[nome][0]}`); continue; }
    if (a[nome][0] !== b[nome][0]) cambiate.push({ testo: `${nome}: ${a[nome][0]} → ${b[nome][0]}`, fonte: fDopo });
    else uguali.push(`${nome} ${b[nome][0]}`);
  }
  const soloPrima = Object.keys(a).filter((n) => !(n in b)).map((n) => `${n} ${a[n][0]}`);
  const righeMisure: Riga[] = [...cambiate];
  if (uguali.length) righeMisure.push({ testo: `Invariate: ${uguali.join(', ')}`, fonte: fDopo });
  if (soloDopo.length) righeMisure.push({ testo: `Solo nell’ultimo referto: ${soloDopo.join(', ')}`, fonte: fDopo });
  if (soloPrima.length) righeMisure.push({ testo: `Solo nel precedente: ${soloPrima.join(', ')}`, fonte: fPrima });
  sezioni.push({ chiave: 'misure', titolo: 'Misure', righe: righeMisure.length ? righeMisure : [{ testo: 'Nessuna misura riconosciuta in nessuno dei due referti.' }] });
  passi.push({ passo: 'Confronto delle misure riconosciute (stesse espressioni della catena)', esito: righeMisure.length ? 'ok' : 'vuoto', fonti: [dopo.id, prima.id], nota: `${cambiate.length} cambiate · ${uguali.length} invariate` });

  // Terapia: righe del blocco «Terapia:» dei due referti, farmaco per farmaco.
  const tPrima = estraiTerapia(prima.testo);
  const tDopo = estraiTerapia(dopo.testo);
  const righeTerapia: Riga[] = [];
  for (const r of tDopo) {
    const gemella = tPrima.find((p) => stessoFarmaco(p, r));
    if (!gemella) righeTerapia.push({ testo: `Nuova: ${r}`, fonte: fDopo });
    else if (gemella.trim().toLowerCase() !== r.trim().toLowerCase()) righeTerapia.push({ testo: `Modificata: ${gemella} → ${r}`, fonte: fDopo });
  }
  for (const p of tPrima) if (!tDopo.some((r) => stessoFarmaco(p, r))) righeTerapia.push({ testo: `Tolta: ${p}`, fonte: fPrima });
  const invariate = tDopo.filter((r) => tPrima.some((p) => p.trim().toLowerCase() === r.trim().toLowerCase())).length;
  if (!tDopo.length && !tPrima.length) {
    sezioni.push({ chiave: 'terapia', titolo: 'Terapia', righe: [{ testo: 'Nessun blocco «Terapia» nei due referti.' }] });
    passi.push({ passo: 'Confronto della terapia (blocco «Terapia:»)', esito: 'vuoto', fonti: [] });
  } else {
    if (invariate) righeTerapia.push({ testo: `${invariate} righe invariate`, fonte: fDopo });
    sezioni.push({ chiave: 'terapia', titolo: 'Terapia', righe: righeTerapia.length ? righeTerapia : [{ testo: 'Terapia invariata.', fonte: fDopo }] });
    passi.push({ passo: 'Confronto della terapia (blocco «Terapia:»)', esito: 'ok', fonti: [dopo.id, prima.id], nota: `${righeTerapia.filter((r) => !/righe invariate/.test(r.testo)).length} differenze` });
  }
  if (!tDopo.length && tPrima.length) mancanti.push({ controllo: 'terapia_assente', testo: 'L’ultimo referto non ha il blocco «Terapia» mentre il precedente sì.' });

  const nCamb = cambiate.length + righeTerapia.filter((r) => /^(Nuova|Modificata|Tolta)/.test(r.testo)).length;
  const sintesi = nCamb ? `${nCamb} cambiament${nCamb === 1 ? 'o' : 'i'} tra il referto del ${fPrima.data ?? '?'} e quello del ${fDopo.data ?? '?'}: ${cambiate.length} misure, ${nCamb - cambiate.length} righe di terapia.` : `Nessun cambiamento nelle misure riconosciute e nella terapia tra il ${fPrima.data ?? '?'} e il ${fDopo.data ?? '?'}.`;
  return { sottotitolo: undefined, sintesi, sezioni, mancanti, fonti, passi };
}

/* ---------- richiami del mese ---------- */
export type RichiamoIn = { id: string; tipo: 'referral' | 'appuntamento'; due: string; mesi: number | null; paziente: string; medico: string | null; motivo: string | null; patient_id: string | null };

export function richiamiDelMese(righe: RichiamoIn[], oggi: Date, fattiUltimoMese: number): Omit<EsitoProcedura, 'procedura' | 'titolo' | 'azioni'> {
  const t0 = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime();
  const giorno = 86400000;
  const gruppi: { chiave: string; titolo: string; filtro: (d: number) => boolean }[] = [
    { chiave: 'scaduti', titolo: 'Scaduti', filtro: (d) => d < t0 },
    { chiave: 'settimana', titolo: 'Entro 7 giorni', filtro: (d) => d >= t0 && d < t0 + 7 * giorno },
    { chiave: 'mese', titolo: 'Entro 30 giorni', filtro: (d) => d >= t0 + 7 * giorno && d <= t0 + 30 * giorno },
  ];
  const sezioni: Sezione[] = [];
  const fonti: Fonte[] = [];
  const conteggi: Record<string, number> = {};
  for (const g of gruppi) {
    const lista = righe.filter((r) => g.filtro(new Date(r.due).getTime())).sort((x, y) => x.due.localeCompare(y.due));
    conteggi[g.chiave] = lista.length;
    if (!lista.length) continue;
    sezioni.push({
      chiave: g.chiave, titolo: `${g.titolo} (${lista.length})`,
      righe: lista.map((r) => {
        const f: Fonte = { tipo: r.tipo === 'referral' ? 'referral' : 'appuntamento', id: r.id, titolo: r.tipo === 'referral' ? 'Referral' : 'Agenda', data: dataCh(r.due) };
        fonti.push(f);
        return { testo: `${r.paziente} · ${dataCh(r.due)}${r.mesi ? ` · a ${r.mesi} mesi` : ''}${r.medico ? ` · ${r.medico}` : ''}${r.motivo ? ` · ${r.motivo}` : ''}`, fonte: f };
      }),
    });
  }
  const passi: Passo[] = [
    { passo: 'Referral con richiamo aperto', esito: righe.some((r) => r.tipo === 'referral') ? 'ok' : 'vuoto', fonti: righe.filter((r) => r.tipo === 'referral').map((r) => r.id) },
    { passo: 'Appuntamenti d’agenda con richiamo aperto', esito: righe.some((r) => r.tipo === 'appuntamento') ? 'ok' : 'vuoto', fonti: righe.filter((r) => r.tipo === 'appuntamento').map((r) => r.id) },
    { passo: 'Scadenze divise in scaduti, 7 giorni, 30 giorni', esito: righe.length ? 'ok' : 'vuoto', fonti: [], nota: `${conteggi.scaduti} · ${conteggi.settimana} · ${conteggi.mese}` },
    { passo: 'Richiami segnati come fatti negli ultimi 30 giorni', esito: fattiUltimoMese ? 'ok' : 'vuoto', fonti: [], nota: `${fattiUltimoMese}` },
  ];
  const mancanti: Mancante[] = conteggi.scaduti ? [{ controllo: 'richiami_scaduti', testo: `${conteggi.scaduti} richiam${conteggi.scaduti === 1 ? 'o scaduto' : 'i scaduti'} da fare.` }] : [];
  const tot = righe.filter((r) => new Date(r.due).getTime() <= t0 + 30 * giorno).length;
  const sintesi = tot ? `${tot} richiami entro 30 giorni: ${conteggi.scaduti} scaduti, ${conteggi.settimana} questa settimana, ${conteggi.mese} nel resto del mese. ${fattiUltimoMese} fatti nell’ultimo mese.` : `Nessun richiamo in scadenza entro 30 giorni. ${fattiUltimoMese} fatti nell’ultimo mese.`;
  if (!sezioni.length) sezioni.push({ chiave: 'nessuno', titolo: 'Richiami', righe: [{ testo: 'Nessun richiamo entro 30 giorni.' }] });
  return { sottotitolo: undefined, sintesi, sezioni, mancanti, fonti, passi };
}

/* ---------- controllo prima della firma ---------- */
export type IngressoPreFirma = {
  bozzaId: string;
  stato: string;
  livelloVerifica: string;
  fiducia: { punteggio?: number; livello?: string } | null;
  issues: { cat: string; sev: string }[];
  fatte: string[];
  chiuse: number;
  campi: Record<string, string>;
  testoFinale: boolean;
  letteraPrecedente: boolean;
  dettatoConTerapia: boolean;
};

const vuoto = (v: unknown) => { const s = typeof v === 'string' ? v.trim().toLowerCase() : ''; return !s || s === 'non indicato'; };

export function controlloPreFirma(i: IngressoPreFirma): Omit<EsitoProcedura, 'procedura' | 'titolo' | 'azioni'> {
  const passi: Passo[] = [];
  const mancanti: Mancante[] = [];
  const f: Fonte = { tipo: 'referto', id: i.bozzaId, titolo: 'Bozza di referto' };
  const conta = (pred: (x: { cat: string; sev: string }) => boolean) => i.issues.filter(pred).length;
  const critiche = conta((x) => x.sev === 'critical');
  const chiuseCritiche = i.fatte.filter((id) => /^(a|r|k|g|o)\d/.test(id)).length;
  const numeri = conta((x) => x.cat === 'NUMERIC' && x.sev !== 'critical');
  const nonSostenute = conta((x) => x.cat === 'NO_SOURCE');
  const omissioniGravi = conta((x) => x.cat === 'OMISSION' && x.sev === 'critical');
  const terapia = conta((x) => x.cat === 'MEDICATION');

  passi.push({ passo: 'Stato della bozza', esito: i.stato === 'bozza' ? 'ok' : 'vuoto', fonti: [i.bozzaId], nota: i.stato });
  if (i.stato !== 'bozza') mancanti.push({ controllo: 'stato', testo: `La bozza è già «${i.stato}».` });

  const pieno = i.livelloVerifica === '' || i.livelloVerifica === 'pieno';
  passi.push({ passo: 'Livello di verifica della catena', esito: pieno ? 'ok' : 'mancante', fonti: [i.bozzaId], nota: i.livelloVerifica || 'pieno' });
  if (!pieno) mancanti.push({ controllo: 'verifica_ridotta', testo: `La catena ha verificato solo in parte (livello «${i.livelloVerifica}»): la conferma chiede una presa d’atto.` });

  passi.push({ passo: 'Fiducia calcolata dalla catena', esito: i.fiducia?.livello === 'bassa' ? 'vuoto' : 'ok', fonti: [i.bozzaId], nota: i.fiducia ? `${i.fiducia.punteggio ?? '?'}/100 · ${i.fiducia.livello ?? '?'}` : 'non calcolata' });

  const aperte = Math.max(0, critiche - chiuseCritiche);
  passi.push({ passo: 'Segnalazioni critiche chiuse nella revisione', esito: critiche === 0 ? 'vuoto' : aperte === 0 ? 'ok' : 'mancante', fonti: [i.bozzaId], nota: critiche ? `${critiche} critiche · ${Math.min(chiuseCritiche, critiche)} chiuse` : 'nessuna critica' });
  if (aperte > 0) mancanti.push({ controllo: 'critiche_aperte', testo: `${aperte} segnalazion${aperte === 1 ? 'e critica ancora aperta' : 'i critiche ancora aperte'} (frasi non sostenute: ${nonSostenute}, omissioni con numeri o farmaci: ${omissioniGravi}).` });

  passi.push({ passo: 'Numeri non confermati dal riascolto', esito: numeri ? 'vuoto' : 'ok', fonti: [i.bozzaId], nota: `${numeri}` });
  passi.push({ passo: 'Terapia da verificare', esito: terapia ? 'vuoto' : 'ok', fonti: [i.bozzaId], nota: `${terapia}` });

  const campiMancanti = ['nome_paziente', 'data_nascita', 'medico_destinatario'].filter((k) => vuoto(i.campi[k]));
  passi.push({ passo: 'Campi confermati: paziente, data di nascita, destinatario', esito: campiMancanti.length ? 'mancante' : 'ok', fonti: [i.bozzaId], nota: campiMancanti.length ? `mancano ${campiMancanti.map((k) => k.replace(/_/g, ' ')).join(', ')}` : 'tutti presenti' });
  if (campiMancanti.length) mancanti.push({ controllo: 'campi', testo: `Campi da confermare: ${campiMancanti.map((k) => k.replace(/_/g, ' ')).join(', ')}.` });

  passi.push({ passo: 'Testo finale presente', esito: i.testoFinale ? 'ok' : 'mancante', fonti: [i.bozzaId] });
  if (!i.testoFinale) mancanti.push({ controllo: 'testo', testo: 'Il testo finale è vuoto.' });

  const terapiaOk = i.dettatoConTerapia || i.letteraPrecedente;
  passi.push({ passo: 'Terapia: dettata per intero o ripresa dalla lettera precedente', esito: terapiaOk ? 'ok' : 'vuoto', fonti: [], nota: i.dettatoConTerapia ? 'dettata' : i.letteraPrecedente ? 'dalla lettera precedente' : 'né dettata né lettera precedente' });
  if (!terapiaOk) mancanti.push({ controllo: 'terapia', testo: 'Nessuna terapia dettata e nessuna lettera precedente: la lettera uscirà senza blocco «Terapia».' });

  passi.push({ passo: 'Revisione: segnalazioni chiuse in tutto', esito: i.chiuse || i.fatte.length ? 'ok' : 'vuoto', fonti: [], nota: `${Math.max(i.chiuse, i.fatte.length)}` });

  const bloccanti = mancanti.filter((m) => ['stato', 'critiche_aperte', 'campi', 'testo'].includes(m.controllo ?? ''));
  const sintesi = bloccanti.length
    ? `Non ancora pronto per la firma: ${bloccanti.length} punt${bloccanti.length === 1 ? 'o' : 'i'} da chiudere.`
    : mancanti.length ? `Pronto per la firma con presa d’atto: ${mancanti.length} avvis${mancanti.length === 1 ? 'o' : 'i'}.` : 'Pronto per la firma: nessun punto aperto.';
  const sezioni: Sezione[] = [{
    chiave: 'controlli', titolo: 'Controlli',
    righe: passi.map((p) => ({ testo: `${p.esito === 'ok' ? '✓' : p.esito === 'mancante' ? '✗' : '–'} ${p.passo}${p.nota ? ` · ${p.nota}` : ''}`, fonte: p.fonti.length ? f : undefined })),
  }];
  return { sottotitolo: undefined, sintesi, sezioni, mancanti, fonti: [f], passi };
}

/* ---------- preparazione della giornata ---------- */
export type VoceGiornata = {
  ora: string;              // «08:30»
  paziente: string;         // nome mostrato (dall'agenda)
  medico: string | null;
  motivo: string | null;
  patientId: string | null; // null = non in cartella
  briefing: { sezioni: Sezione[]; mancanti: Mancante[]; fonti: Fonte[] } | null;
};

export function aggregaGiornata(voci: VoceGiornata[], dataCh: string): Omit<EsitoProcedura, 'procedura' | 'titolo' | 'azioni'> {
  const ordinate = [...voci].sort((a, b) => a.ora.localeCompare(b.ora));
  const sezioni: Sezione[] = [];
  const fonti: Fonte[] = [];
  const mancanti: Mancante[] = [];
  const registra = (f: Fonte) => { if (!fonti.some((x) => x.tipo === f.tipo && x.id === f.id)) fonti.push(f); return f; };
  // 1. Tutte le mancanze in cima, con ora e paziente.
  const righeMancanze: Riga[] = [];
  for (const v of ordinate) {
    if (!v.briefing) continue;
    for (const m of v.briefing.mancanti) {
      righeMancanze.push({ testo: `${v.ora} ${v.paziente}: ${m.testo}` });
      mancanti.push({ controllo: m.controllo, testo: `${v.ora} ${v.paziente}: ${m.testo}` });
    }
  }
  const nonInCartella = ordinate.filter((v) => !v.patientId);
  for (const v of nonInCartella) mancanti.push({ controllo: 'non_in_cartella', testo: `${v.ora} ${v.paziente}: non è in cartella (nessuna referral, documento o referto).` });
  if (righeMancanze.length || nonInCartella.length) {
    sezioni.push({ chiave: 'mancanze', titolo: `Da segnalare (${righeMancanze.length + nonInCartella.length})`, righe: [...righeMancanze, ...nonInCartella.map((v) => ({ testo: `${v.ora} ${v.paziente}: non in cartella` }))] });
  }
  // 2. Un blocco per appuntamento: motivo, terapia, esami, visite (righe più corte del briefing singolo).
  for (const v of ordinate) {
    const testa = `${v.ora} · ${v.paziente}${v.medico ? ` · ${v.medico}` : ''}${v.motivo ? ` · ${v.motivo}` : ''}`;
    if (!v.briefing) { sezioni.push({ chiave: `app-${v.ora}-${v.paziente}`, titolo: testa, righe: [{ testo: 'Non in cartella.' }] }); continue; }
    const righe: Riga[] = [];
    const prendi = (chiave: string, max: number) => {
      const s = v.briefing!.sezioni.find((x) => x.chiave === chiave);
      if (!s) return;
      for (const r of s.righe.slice(0, max)) righe.push({ testo: r.testo, fonte: r.fonte ? registra(r.fonte) : undefined });
      if (s.righe.length > max) righe.push({ testo: `… e altre ${s.righe.length - max} righe di «${s.titolo}»` });
    };
    prendi('motivo', 2);
    prendi('terapia', 6);
    prendi('esami', 3);
    prendi('sospeso', 3);
    sezioni.push({ chiave: `app-${v.ora}-${v.paziente}`, titolo: testa, righe: righe.length ? righe : [{ testo: 'Cartella vuota.' }] });
  }
  const conBriefing = ordinate.filter((v) => v.briefing).length;
  const passi: Passo[] = [
    { passo: `Appuntamenti del ${dataCh} in agenda`, esito: ordinate.length ? 'ok' : 'vuoto', fonti: [], nota: `${ordinate.length}` },
    { passo: 'Pazienti trovati in cartella (cognome e nome dell’agenda)', esito: conBriefing ? 'ok' : nonInCartella.length ? 'mancante' : 'vuoto', fonti: ordinate.filter((v) => v.patientId).map((v) => v.patientId as string), nota: `${conBriefing} in cartella · ${nonInCartella.length} no` },
    { passo: 'Briefing pre-visita eseguito per ciascuno (stesse regole del singolo)', esito: conBriefing ? 'ok' : 'vuoto', fonti: [], nota: `${conBriefing} briefing` },
    { passo: 'Mancanze raccolte in cima', esito: righeMancanze.length ? 'ok' : 'vuoto', fonti: [], nota: `${righeMancanze.length}` },
  ];
  const sintesi = ordinate.length
    ? `${ordinate.length} appuntament${ordinate.length === 1 ? 'o' : 'i'} il ${dataCh}: ${conBriefing} con cartella, ${nonInCartella.length} non in cartella, ${righeMancanze.length} cos${righeMancanze.length === 1 ? 'a' : 'e'} da segnalare.`
    : `Nessun appuntamento in agenda il ${dataCh}.`;
  if (!sezioni.length) sezioni.push({ chiave: 'nessuno', titolo: 'Agenda', righe: [{ testo: 'Nessun appuntamento.' }] });
  return { sottotitolo: undefined, sintesi, sezioni, mancanti, fonti, passi };
}

/* ---------- lettere in ritardo ---------- */
export type LetteraIn = { id: string; paziente: string; medico: string | null; confermata_il: string | null; dettata_il: string; stato: 'confermata' | 'bozza'; word_scaricato: boolean };
export type ReferralVistaIn = { id: string; paziente: string; vista_il: string; medico: string | null };
export const GIORNI_WORD = 3;
export const GIORNI_BOZZA = 7;
export const GIORNI_REFERRAL_VISTA = 10;

export function lettereInRitardo(lettere: LetteraIn[], referralViste: ReferralVistaIn[], oggi: Date): Omit<EsitoProcedura, 'procedura' | 'titolo' | 'azioni'> {
  const giorniFa = (iso: string) => Math.floor((oggi.getTime() - new Date(iso).getTime()) / 86400000);
  const senzaWord = lettere.filter((l) => l.stato === 'confermata' && !l.word_scaricato && l.confermata_il && giorniFa(l.confermata_il) >= GIORNI_WORD).sort((a, b) => a.confermata_il!.localeCompare(b.confermata_il!));
  const bozzeFerme = lettere.filter((l) => l.stato === 'bozza' && giorniFa(l.dettata_il) >= GIORNI_BOZZA).sort((a, b) => a.dettata_il.localeCompare(b.dettata_il));
  const viste = referralViste.filter((r) => giorniFa(r.vista_il) >= GIORNI_REFERRAL_VISTA).sort((a, b) => a.vista_il.localeCompare(b.vista_il));
  const sezioni: Sezione[] = [];
  const fonti: Fonte[] = [];
  const fRef = (id: string, titolo: string, data: string) => { const f: Fonte = { tipo: 'referto', id, titolo, data: dataCh(data) }; fonti.push(f); return f; };
  if (senzaWord.length) sezioni.push({ chiave: 'senza_word', titolo: `Confermate senza Word da ${GIORNI_WORD}+ giorni (${senzaWord.length})`, righe: senzaWord.map((l) => ({ testo: `${l.paziente} · confermata il ${dataCh(l.confermata_il!)} (${giorniFa(l.confermata_il!)} giorni)${l.medico ? ` · ${l.medico}` : ''}`, fonte: fRef(l.id, 'Referto confermato', l.confermata_il!) })) });
  if (bozzeFerme.length) sezioni.push({ chiave: 'bozze_ferme', titolo: `Bozze ferme da ${GIORNI_BOZZA}+ giorni (${bozzeFerme.length})`, righe: bozzeFerme.map((l) => ({ testo: `${l.paziente} · dettata il ${dataCh(l.dettata_il)} (${giorniFa(l.dettata_il)} giorni)${l.medico ? ` · ${l.medico}` : ''}`, fonte: fRef(l.id, 'Bozza di referto', l.dettata_il) })) });
  if (viste.length) sezioni.push({ chiave: 'viste', titolo: `Referral viste senza referto inviato da ${GIORNI_REFERRAL_VISTA}+ giorni (${viste.length})`, righe: viste.map((r) => { const f: Fonte = { tipo: 'referral', id: r.id, titolo: 'Referral', data: dataCh(r.vista_il) }; fonti.push(f); return { testo: `${r.paziente} · vista il ${dataCh(r.vista_il)} (${giorniFa(r.vista_il)} giorni)${r.medico ? ` · ${r.medico}` : ''}`, fonte: f }; }) });
  if (!sezioni.length) sezioni.push({ chiave: 'nessuna', titolo: 'Lettere', righe: [{ testo: 'Nessuna lettera in ritardo.' }] });
  const mancanti: Mancante[] = [];
  if (senzaWord.length) mancanti.push({ controllo: 'senza_word', testo: `${senzaWord.length} referti confermati senza Word prodotto.` });
  if (bozzeFerme.length) mancanti.push({ controllo: 'bozze_ferme', testo: `${bozzeFerme.length} bozze dettate da oltre ${GIORNI_BOZZA} giorni e mai confermate.` });
  if (viste.length) mancanti.push({ controllo: 'referral_viste', testo: `${viste.length} referral con visita fatta ma referto non ancora inviato.` });
  const passi: Passo[] = [
    { passo: `Referti confermati senza evento «Word scaricato» dopo ${GIORNI_WORD} giorni`, esito: senzaWord.length ? 'mancante' : 'ok', fonti: senzaWord.map((l) => l.id), nota: `${senzaWord.length} su ${lettere.filter((l) => l.stato === 'confermata').length} confermati` },
    { passo: `Bozze in stato «bozza» da oltre ${GIORNI_BOZZA} giorni`, esito: bozzeFerme.length ? 'mancante' : 'ok', fonti: bozzeFerme.map((l) => l.id), nota: `${bozzeFerme.length} su ${lettere.filter((l) => l.stato === 'bozza').length} aperte` },
    { passo: `Referral in stato «vista» da oltre ${GIORNI_REFERRAL_VISTA} giorni`, esito: viste.length ? 'mancante' : 'ok', fonti: viste.map((r) => r.id), nota: `${viste.length}` },
  ];
  const tot = senzaWord.length + bozzeFerme.length + viste.length;
  const sintesi = tot ? `${tot} letter${tot === 1 ? 'a' : 'e'} in ritardo: ${senzaWord.length} confermate senza Word, ${bozzeFerme.length} bozze ferme, ${viste.length} referral viste senza referto.` : 'Nessuna lettera in ritardo.';
  return { sottotitolo: undefined, sintesi, sezioni, mancanti, fonti, passi };
}

/* ---------- chiusura mensile ---------- */
export type NumeriMese = {
  mese: string;                 // «settembre 2026»
  dettati: number; confermati: number; scartati: number; ancoraAperti: number;
  giorniMedianiConferma: number | null;
  referralRicevute: number; referralChiuse: number; referralAperteSenzaAppuntamento: { id: string; paziente: string; da: string }[];
  richiamiFatti: number; richiamiScaduti: { id: string; paziente: string; due: string }[];
  documentiCaricati: number;
  senzaEcg: { id: string; paziente: string }[];   // pazienti con richiamo aperto e nessun ECG in 12 mesi
  lettereInRitardo: number;
  tracce: { procedura: string; n: number }[];
  dizionarioConfermato: number;
};

export function chiusuraMensile(n: NumeriMese): Omit<EsitoProcedura, 'procedura' | 'titolo' | 'azioni'> {
  const fonti: Fonte[] = [];
  const sezioni: Sezione[] = [
    { chiave: 'referti', titolo: 'Referti', righe: [
      { testo: `${n.dettati} dettati · ${n.confermati} confermati · ${n.scartati} scartati · ${n.ancoraAperti} ancora in bozza` },
      { testo: n.giorniMedianiConferma === null ? 'Tempo dettato → conferma: nessun referto confermato nel mese' : `Tempo mediano dettato → conferma: ${n.giorniMedianiConferma} giorn${n.giorniMedianiConferma === 1 ? 'o' : 'i'}` },
      { testo: `Lettere in ritardo oggi: ${n.lettereInRitardo}` },
    ] },
    { chiave: 'referral', titolo: 'Referral', righe: [
      { testo: `${n.referralRicevute} ricevute · ${n.referralChiuse} chiuse` },
      ...n.referralAperteSenzaAppuntamento.slice(0, 10).map((r) => { const f: Fonte = { tipo: 'referral', id: r.id, titolo: 'Referral', data: dataCh(r.da) }; fonti.push(f); return { testo: `Aperta senza appuntamento: ${r.paziente} (dal ${dataCh(r.da)})`, fonte: f }; }),
    ] },
    { chiave: 'richiami', titolo: 'Richiami', righe: [
      { testo: `${n.richiamiFatti} fatti nel mese · ${n.richiamiScaduti.length} scaduti aperti` },
      ...n.richiamiScaduti.slice(0, 10).map((r) => { const f: Fonte = { tipo: 'referral', id: r.id, titolo: 'Referral', data: dataCh(r.due) }; fonti.push(f); return { testo: `Scaduto: ${r.paziente} (${dataCh(r.due)})`, fonte: f }; }),
    ] },
    { chiave: 'cartella', titolo: 'Cartella', righe: [
      { testo: `${n.documentiCaricati} documenti caricati nel mese` },
      ...(n.senzaEcg.length ? n.senzaEcg.slice(0, 10).map((p) => ({ testo: `Richiamo aperto ma nessun ECG negli ultimi 12 mesi: ${p.paziente}`, fonte: undefined })) : [{ testo: 'Tutti i pazienti con richiamo aperto hanno un ECG negli ultimi 12 mesi.' }]),
    ] },
    { chiave: 'assistente', titolo: 'Assistente e apprendimento', righe: [
      { testo: n.tracce.length ? `Tracce del mese: ${n.tracce.map((t) => `${t.procedura} ${t.n}`).join(', ')}` : 'Nessuna traccia dell’assistente nel mese' },
      { testo: `${n.dizionarioConfermato} voci di dizionario confermate a mano nel mese` },
    ] },
  ];
  const mancanti: Mancante[] = [];
  if (n.ancoraAperti) mancanti.push({ controllo: 'bozze_aperte', testo: `${n.ancoraAperti} referti dettati nel mese ancora in bozza.` });
  if (n.lettereInRitardo) mancanti.push({ controllo: 'lettere', testo: `${n.lettereInRitardo} lettere in ritardo.` });
  if (n.referralAperteSenzaAppuntamento.length) mancanti.push({ controllo: 'referral_senza_appuntamento', testo: `${n.referralAperteSenzaAppuntamento.length} referral aperte da oltre 30 giorni senza appuntamento.` });
  if (n.richiamiScaduti.length) mancanti.push({ controllo: 'richiami_scaduti', testo: `${n.richiamiScaduti.length} richiami scaduti.` });
  if (n.senzaEcg.length) mancanti.push({ controllo: 'ecg_richiami', testo: `${n.senzaEcg.length} pazienti con richiamo aperto senza ECG negli ultimi 12 mesi.` });
  const passi: Passo[] = [
    { passo: 'Referti del mese: dettati, confermati, scartati, aperti; tempo mediano di conferma', esito: n.dettati ? 'ok' : 'vuoto', fonti: [], nota: `${n.dettati} dettati` },
    { passo: 'Referral ricevute e chiuse; aperte da oltre 30 giorni senza appuntamento', esito: n.referralAperteSenzaAppuntamento.length ? 'mancante' : 'ok', fonti: n.referralAperteSenzaAppuntamento.map((r) => r.id), nota: `${n.referralRicevute} ricevute · ${n.referralAperteSenzaAppuntamento.length} ferme` },
    { passo: 'Richiami fatti e scaduti', esito: n.richiamiScaduti.length ? 'mancante' : 'ok', fonti: n.richiamiScaduti.map((r) => r.id), nota: `${n.richiamiFatti} fatti · ${n.richiamiScaduti.length} scaduti` },
    { passo: 'Documenti caricati; pazienti con richiamo aperto senza ECG in 12 mesi', esito: n.senzaEcg.length ? 'mancante' : 'ok', fonti: n.senzaEcg.map((p) => p.id), nota: `${n.documentiCaricati} documenti · ${n.senzaEcg.length} senza ECG` },
    { passo: 'Lettere in ritardo (stessa procedura)', esito: n.lettereInRitardo ? 'mancante' : 'ok', fonti: [], nota: `${n.lettereInRitardo}` },
    { passo: 'Tracce dell’assistente e dizionario confermato', esito: 'ok', fonti: [], nota: `${n.tracce.reduce((s, t) => s + t.n, 0)} tracce · ${n.dizionarioConfermato} voci` },
  ];
  const sintesi = `${n.mese}: ${n.dettati} referti dettati, ${n.confermati} confermati${n.giorniMedianiConferma !== null ? ` (mediana ${n.giorniMedianiConferma} giorni)` : ''}, ${n.referralRicevute} referral ricevute, ${n.richiamiFatti} richiami fatti. ${mancanti.length ? `${mancanti.length} punt${mancanti.length === 1 ? 'o aperto' : 'i aperti'} da chiudere.` : 'Nessun punto aperto.'}`;
  return { sottotitolo: undefined, sintesi, sezioni, mancanti, fonti, passi };
}
