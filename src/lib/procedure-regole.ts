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
