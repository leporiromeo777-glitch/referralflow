// La forma «da documento» delle risposte delle procedure (21.9.2026).
//
// Le procedure dell'assistente (preparazione della giornata, briefing
// pre-visita, richiami, lettere in ritardo, chiusura mensile…) producevano
// sezioni di righe, e il visore le disegnava tutte come un unico elenco di
// pallini. Chi chiede «preparami la giornata» vuole un FOGLIO: un'intestazione,
// i numeri che contano, che cosa c'è da segnalare, l'agenda in tabella, e una
// scheda per paziente con le sue parti distinte. Questo modulo è PURO: prende
// ciò che le regole hanno già calcolato e gli dà quella forma. Non aggiunge
// dati, non ne toglie: `sezioni`, `mancanti` e `fonti` restano come prima
// (la traccia e i test esistenti ci si appoggiano).
import type { Fonte, Mancante, Riga, Sezione } from './briefing-regole';

export type NumeroDoc = { etichetta: string; valore: string; tono?: 'ok' | 'attenzione' | 'neutro' };
export type GruppoDoc = { titolo: string; righe: Riga[] };
export type BloccoDoc =
  | { tipo: 'avviso'; titolo: string; righe: Riga[]; gruppi?: GruppoDoc[]; totale?: number }
  | { tipo: 'tabella'; titolo: string; colonne: string[]; righe: { celle: string[]; go?: string; tono?: 'attenzione' | 'ok'; crea?: string }[] }
  | { tipo: 'scheda'; titolo: string; etichetta?: string; sottotitolo?: string; tono?: 'attenzione' | 'ok'; go?: string; gruppi: GruppoDoc[] }
  | { tipo: 'gruppo'; titolo: string; righe: Riga[] };
export type DocumentoProcedura = {
  intestazione: { titolo: string; sottotitolo?: string };
  numeri: NumeroDoc[];
  blocchi: BloccoDoc[];
};

// «Preparazione della giornata · 21.09.2026» → titolo e sottotitolo.
export function dividiTitolo(titolo: string): { titolo: string; sottotitolo?: string } {
  const i = titolo.indexOf(' · ');
  return i < 0 ? { titolo } : { titolo: titolo.slice(0, i), sottotitolo: titolo.slice(i + 3) };
}
const senzaConteggio = (t: string) => t.replace(/\s*\(\d+\)\s*$/, '');

// Qualunque procedura: le mancanze in un riquadro in cima, ogni sezione un
// gruppo a sé, i numeri dalle sezioni (quante righe ha ciascuna).
export function documentoGenerico(e: { titolo: string; sottotitolo?: string; procedura?: string; sezioni: Sezione[]; mancanti: Mancante[] }): DocumentoProcedura {
  const t = dividiTitolo(e.titolo);
  const blocchi: BloccoDoc[] = [];
  if (e.mancanti.length) blocchi.push({ tipo: 'avviso', titolo: e.procedura === 'briefing_previsita' ? 'Da segnalare al medico' : 'Da fare', righe: e.mancanti.map((m) => ({ testo: m.testo })) });
  // la sezione «mancanze» ripete il riquadro: non si disegna due volte
  for (const s of e.sezioni) if (s.chiave !== 'mancanze') blocchi.push({ tipo: 'gruppo', titolo: senzaConteggio(s.titolo), righe: s.righe });
  const numeri: NumeroDoc[] = e.sezioni.filter((s) => s.chiave !== 'mancanze').slice(0, 4).map((s) => ({ etichetta: senzaConteggio(s.titolo), valore: String(s.righe.length), tono: 'neutro' as const }));
  if (e.mancanti.length) numeri.push({ etichetta: e.procedura === 'briefing_previsita' ? 'Da segnalare' : 'Da fare', valore: String(e.mancanti.length), tono: 'attenzione' });
  return { intestazione: { titolo: t.titolo, sottotitolo: e.sottotitolo ?? t.sottotitolo }, numeri, blocchi };
}

// Il briefing di un paziente: numeri su terapia, esami, sospesi, mancanze;
// poi ogni parte della cartella è un gruppo con il suo titolo.
export function documentoBriefing(e: { titolo: string; sezioni: Sezione[]; mancanti: Mancante[] }): DocumentoProcedura {
  const doc = documentoGenerico({ ...e, procedura: 'briefing_previsita' });
  const conFonte = (chiave: string) => (e.sezioni.find((s) => s.chiave === chiave)?.righe ?? []).filter((r) => r.fonte).length;
  const terapia = e.sezioni.find((s) => s.chiave === 'terapia');
  // la prima riga della terapia dice da quale lettera viene: i farmaci sono le altre
  const farmaci = terapia && terapia.righe.length > 1 ? terapia.righe.length - 1 : 0;
  doc.numeri = [
    { etichetta: 'Farmaci in terapia', valore: farmaci ? String(farmaci) : '—', tono: farmaci ? 'neutro' : 'attenzione' },
    { etichetta: 'Esami recenti', valore: String(conFonte('esami')), tono: 'neutro' },
    { etichetta: 'In sospeso', valore: String(e.sezioni.find((s) => s.chiave === 'sospeso')?.righe.length ?? 0), tono: e.sezioni.some((s) => s.chiave === 'sospeso') ? 'attenzione' : 'ok' },
    { etichetta: 'Da segnalare', valore: String(e.mancanti.length), tono: e.mancanti.length ? 'attenzione' : 'ok' },
  ];
  return doc;
}

// La giornata: numeri, che cosa segnalare, l'agenda in tabella, e una scheda
// per appuntamento con motivo / terapia / esami / sospesi DISTINTI.
export type VoceDocumento = {
  ora: string; paziente: string; medico: string | null; motivo: string | null; patientId: string | null;
  mancanti: string[]; gruppi: GruppoDoc[]; inCartella: boolean;
  crea?: string;   // titolo dell'agenda da cui proporre una cartella nuova (solo se non in cartella ed è una persona)
};
export function documentoGiornata(voci: VoceDocumento[], dataCh: string): DocumentoProcedura {
  const daSegnalare = voci.reduce((n, v) => n + v.mancanti.length, 0) + voci.filter((v) => !v.inCartella).length;
  const numeri: NumeroDoc[] = [
    { etichetta: 'Appuntamenti', valore: String(voci.length), tono: 'neutro' },
    { etichetta: 'Con cartella', valore: String(voci.filter((v) => v.inCartella).length), tono: 'ok' },
    { etichetta: 'Non in cartella', valore: String(voci.filter((v) => !v.inCartella).length), tono: voci.some((v) => !v.inCartella) ? 'attenzione' : 'ok' },
    { etichetta: 'Da segnalare', valore: String(daSegnalare), tono: daSegnalare ? 'attenzione' : 'ok' },
  ];
  const blocchi: BloccoDoc[] = [];
  // Il riquadro resta leggibile anche nei giorni pieni: le segnalazioni
  // RAGGRUPPATE per paziente (al massimo 8 pazienti, gli altri sono nelle
  // schede), i «non in cartella» in UNA riga con il conteggio — sono già tutti
  // nella colonna «Cartella». Il totale è quello vero, non le righe mostrate.
  const MAX_PAZIENTI = 8;
  const conMancanze = voci.filter((v) => v.mancanti.length);
  const gruppiAvviso: GruppoDoc[] = conMancanze.slice(0, MAX_PAZIENTI).map((v) => ({ titolo: `${v.ora} · ${v.paziente}`, righe: v.mancanti.map((m) => ({ testo: m })) }));
  const avvisi: Riga[] = [];
  if (conMancanze.length > MAX_PAZIENTI) avvisi.push({ testo: `… e altri ${conMancanze.length - MAX_PAZIENTI} pazienti con qualcosa da segnalare: sono nelle schede qui sotto.` });
  const fuori = voci.filter((v) => !v.inCartella);
  if (fuori.length === 1) avvisi.push({ testo: `${fuori[0].ora} · ${fuori[0].paziente} — non è in cartella` });
  else if (fuori.length > 1) avvisi.push({ testo: `${fuori.length} appuntamenti non sono in cartella (nessuna referral, documento o referto): sono segnati nella tabella.` });
  if (gruppiAvviso.length || avvisi.length) blocchi.push({ tipo: 'avviso', titolo: 'Da segnalare', righe: avvisi, gruppi: gruppiAvviso, totale: daSegnalare });
  if (voci.length) {
    blocchi.push({
      tipo: 'tabella', titolo: 'Agenda del giorno', colonne: ['Ora', 'Paziente', 'Medico', 'Motivo', 'Cartella'],
      righe: voci.map((v) => ({
        celle: [v.ora, v.paziente, v.medico ?? '—', v.motivo ?? '—', !v.inCartella ? 'non in cartella' : v.mancanti.length ? `${v.mancanti.length} da segnalare` : 'a posto'],
        go: v.patientId ? `#/patients/${v.patientId}` : undefined,
        tono: !v.inCartella || v.mancanti.length ? 'attenzione' as const : 'ok' as const,
        crea: !v.inCartella ? v.crea : undefined,
      })),
    });
  }
  // Una scheda solo per chi ha una cartella da leggere: gli altri stanno nella tabella.
  for (const v of voci.filter((x) => x.inCartella || voci.length <= 12)) {
    blocchi.push({
      tipo: 'scheda', etichetta: v.ora, titolo: v.paziente,
      sottotitolo: [v.medico, v.motivo].filter(Boolean).join(' · ') || undefined,
      tono: !v.inCartella || v.mancanti.length ? 'attenzione' : 'ok',
      go: v.patientId ? `#/patients/${v.patientId}` : undefined,
      gruppi: v.inCartella ? (v.gruppi.length ? v.gruppi : [{ titolo: 'Cartella', righe: [{ testo: 'Cartella vuota.' }] }]) : [{ titolo: 'Cartella', righe: [{ testo: 'Non in cartella: nessuna referral, documento o referto.' }] }],
    });
  }
  return { intestazione: { titolo: 'Preparazione della giornata', sottotitolo: dataCh }, numeri, blocchi };
}
export type { Fonte };
