// Il riparatore: il pianificatore deterministico (16.9.2026, §5.5).
//
// È l'evoluzione dei tre giri di `assegnaVisite`, portata al nuovo verso:
// la stanza si sceglie per l'appuntamento, il medico si sposta. Fa due
// mestieri: il piano del mattino quando il solver CP-SAT non risponde, e la
// riparazione in giornata — prende lo stato di adesso, tiene fermo quel che è
// congelato, e sistema solo quel che resta. Non ottimizza: mette ogni visita
// nella prima stanza che la può ospitare al primo momento possibile, e fra
// più stanze sceglie quella che cambia meno rispetto a quanto già detto. Per
// questo è un ripiego e non il motore: ma è testato, spiegabile, e sempre
// disponibile.
//
// Tutti i tempi sono minuti dalla mezzanotte. Regole che non si negoziano,
// le stesse di ieri e del progetto: mai due medici nella stessa stanza allo
// stesso momento; mai un paziente in due stanze; mai una visita prima che il
// paziente sia arrivato; mai un congelato spostato.

import type { Parametri } from './parametri';
import type { StatoPaziente } from './stato';

export type VisitaDaPianificare = {
  id: string;
  medico: string;                 // '' se senzaMedico
  prestazione: string;
  teorica: number;
  durata: number;
  prep: number;
  ripristino: number;
  salePossibili: string[];
  salaPreferita?: string | null;
  apparecchi: string[];
  assistenti: string[];           // chi può fare la preparazione; vuoto = nessuna preparazione richiesta
  senzaMedico: boolean;
  arrivo?: number | null;
  stato: StatoPaziente;
  rigidita: number;
  salaFissa?: string | null;
  inizioFisso?: number | null;
  comunicato?: { sala: string; ingresso: number } | null;
  priorita: number;
  etichetta?: string;
  // Chi ha una stanza sola per regola (Paiocchi in Sala 1) può fare due
  // visite di fila nella stessa stanza senza la pausa.
  stessaStanzaLibera?: boolean;
};

export type StanzaDisp = { nome: string; posti: number; bloccata: [number, number][]; ultima: boolean };
export type MedicoDisp = { nome: string; liberoDa: number; inSala: string | null; ritardo: number; fermoIn?: string | null };
export type AssistenteDisp = { nome: string; liberoDa: number };
export type ApparecchioDisp = { nome: string; mobile: boolean; inSala: string | null; bloccato: [number, number][] };

export type Pianificata = {
  id: string; sala: string; ingresso: number; inizio: number; fine: number;
  assistente: string | null; apparecchi: string[];
  attesa: number;                 // minuti oltre max(teorica, arrivo)
  perche: Record<string, unknown>;
};
export type Tappa = { id: string; sala: string; inizio: number; fine: number; spostamento: number };
export type Piano = {
  visite: Record<string, Pianificata>;
  senzaSala: { id: string; perche: string }[];
  sequenze: Record<string, Tappa[]>;
  termini: Record<string, number>;
  costo: number;
  motore: 'riparatore';
};

type Intervallo = { da: number; a: number; id: string; chi: string };

const sovrapposti = (l: Intervallo[], da: number, a: number) => l.filter((x) => x.da < a && x.a > da);

export function pianifica(input: {
  adesso: number;
  visite: VisitaDaPianificare[];
  stanze: StanzaDisp[];
  medici: MedicoDisp[];
  assistenti: AssistenteDisp[];
  apparecchi: ApparecchioDisp[];
  distanza: (da: string | null, a: string) => number;   // secondi
  conCuscinetti?: boolean;
}, p: Parametri): Piano {
  const occStanza: Record<string, Intervallo[]> = {};
  const occAssist: Record<string, Intervallo[]> = {};
  const occApp: Record<string, Intervallo[]> = {};
  const stanze = new Map(input.stanze.map((s) => [s.nome, s]));
  for (const s of input.stanze) occStanza[s.nome] = s.bloccata.map(([da, a]) => ({ da, a, id: 'bloccata', chi: '' }));
  for (const a of input.assistenti) occAssist[a.nome] = a.liberoDa > 0 ? [{ da: 0, a: a.liberoDa, id: 'occupato', chi: a.nome }] : [];
  for (const a of input.apparecchi) occApp[a.nome] = a.bloccato.map(([da, a2]) => ({ da, a: a2, id: 'bloccato', chi: '' }));
  // Restare nella stessa stanza non è uno spostamento, qualunque cosa dica
  // la tabella delle distanze.
  const spostamentoMin = (da: string | null, a: string) => (!da || da.toLowerCase() === a.toLowerCase()) ? 0 : Math.ceil(input.distanza(da, a) / 60);
  // Per ogni medico: quando è finita davvero l'ultima visita (senza i
  // cuscinetti), per la regola della pausa nella stessa stanza.
  const medici = new Map(input.medici.map((m) => [m.nome, { ...m, quante: 0, fineUltima: m.liberoDa }]));
  const medicoDi = (nome: string) => {
    if (!medici.has(nome)) medici.set(nome, { nome, liberoDa: input.adesso, inSala: null, ritardo: 0, quante: 0, fineUltima: input.adesso });
    return medici.get(nome)!;
  };
  const visite: Record<string, Pianificata> = {};
  const senzaSala: Piano['senzaSala'] = [];
  const sequenze: Record<string, Tappa[]> = {};

  // Ordine: prima i congelati (sono fatti, non scelte), poi le urgenze, poi
  // per ora teorica. Lo stesso medico vede così le sue visite in ordine.
  const ordinate = [...input.visite]
    .filter((v) => !['dimesso', 'assente', 'annullato'].includes(v.stato))
    .sort((a, b) => (b.rigidita - a.rigidita) || (b.priorita - a.priorita) || (a.teorica - b.teorica) || a.id.localeCompare(b.id));

  const anticipo = p.anticipo_ingresso_min;
  const finestraStanza = (v: VisitaDaPianificare, inizio: number) => {
    const prima = Math.max(v.prep, v.rigidita >= 3 ? v.prep : anticipo);
    return { da: inizio - prima, a: inizio + v.durata + v.ripristino, ingresso: inizio - prima };
  };

  const libera = (v: VisitaDaPianificare, sala: string, inizio: number): { ok: boolean; fino: number; assistente: string | null } => {
    const s = stanze.get(sala);
    if (!s) return { ok: false, fino: Infinity, assistente: null };
    const f = finestraStanza(v, inizio);
    const dentro = sovrapposti(occStanza[sala] ?? [], f.da, f.a);
    // Un'altra persona nella stanza: mai. Lo stesso medico con più pazienti:
    // fino ai posti della stanza.
    const altri = dentro.filter((x) => x.chi && x.chi !== v.medico);
    if (altri.length || dentro.some((x) => x.id === 'bloccata')) return { ok: false, fino: Math.max(...dentro.map((x) => x.a)), assistente: null };
    if (dentro.length >= s.posti) return { ok: false, fino: Math.max(...dentro.map((x) => x.a)), assistente: null };
    for (const ap of v.apparecchi) {
      const occ = sovrapposti(occApp[ap] ?? [], f.da, f.a);
      if (occ.length) return { ok: false, fino: Math.max(...occ.map((x) => x.a)), assistente: null };
      const app = input.apparecchi.find((x) => x.nome === ap);
      if (app && !app.mobile && app.inSala && app.inSala.toLowerCase() !== sala.toLowerCase()) return { ok: false, fino: Infinity, assistente: null };
    }
    let assistente: string | null = null;
    if (v.prep > 0 && v.assistenti.length) {
      let fino = Infinity;
      for (const a of v.assistenti) {
        const occ = sovrapposti(occAssist[a] ?? [], inizio - v.prep, inizio);
        if (!occ.length) { assistente = a; break; }
        fino = Math.min(fino, Math.max(...occ.map((x) => x.a)) + v.prep);
      }
      if (!assistente) return { ok: false, fino, assistente: null };
    }
    return { ok: true, fino: inizio, assistente };
  };

  for (const v of ordinate) {
    const candidate = v.salaFissa ? [v.salaFissa] : v.salePossibili;
    if (!candidate.length) { senzaSala.push({ id: v.id, perche: 'nessuna stanza compatibile con la prestazione e con le regole del medico' }); continue; }
    const m = v.senzaMedico ? null : medicoDi(v.medico);
    if (m?.fermoIn && !candidate.some((c) => c.toLowerCase() === m.fermoIn!.toLowerCase())) {
      senzaSala.push({ id: v.id, perche: `${v.medico} resta in ${m.fermoIn} per decisione di una persona, e questa visita non può farsi lì` }); continue;
    }
    const cand = m?.fermoIn ? candidate.filter((c) => c.toLowerCase() === m.fermoIn!.toLowerCase()) : candidate;

    // Da quando può cominciare: non prima dell'ora teorica se non è arrivato,
    // non prima dell'arrivo se è arrivato, mai prima di adesso, e mai prima
    // che il medico sia libero e arrivato nella stanza.
    const arrivato = v.arrivo != null && v.arrivo <= input.adesso;
    const base = v.inizioFisso != null ? v.inizioFisso
      : Math.max(input.adesso, arrivato ? Math.min(v.teorica, v.arrivo!) : v.teorica, v.arrivo ?? -Infinity);

    let scelta: { sala: string; inizio: number; assistente: string | null; punti: number } | null = null;
    for (const sala of cand) {
      let t = base;
      if (m && v.inizioFisso == null) t = Math.max(t, m.liberoDa + spostamentoMin(m.inSala, sala));
      // Stessa stanza dell'ultima sua visita: solo con la pausa in mezzo
      // (16.9.2026). Il paziente successivo si prepara altrove mentre lui
      // finisce; se l'altrove non c'è, aspetta la pausa.
      if (m && v.inizioFisso == null && !v.stessaStanzaLibera && m.inSala && m.inSala.toLowerCase() === sala.toLowerCase() && m.quante > 0) {
        t = Math.max(t, m.fineUltima + p.pausa_stessa_stanza_min);
      }
      let giri = 0;
      while (giri++ < 60) {
        const l = libera(v, sala, t);
        if (l.ok) {
          const spost = m && m.inSala && m.inSala.toLowerCase() !== sala.toLowerCase() ? p.pesi.spostamento : 0;
          const cambio = v.comunicato && v.comunicato.sala.toLowerCase() !== sala.toLowerCase() ? p.pesi.modifica_stanza : 0;
          const pref = v.salaPreferita && v.salaPreferita.toLowerCase() !== sala.toLowerCase() ? p.pesi.uso : 0;
          const ultima = stanze.get(sala)?.ultima ? 3 : 0;
          const punti = t * 1000 + cambio + pref + spost + ultima;
          if (!scelta || punti < scelta.punti) scelta = { sala, inizio: t, assistente: l.assistente, punti };
          break;
        }
        if (v.inizioFisso != null || !Number.isFinite(l.fino)) break;   // congelato che non ci sta, o stanza impossibile
        t = Math.max(t + 1, l.fino);
        if (t > v.teorica + 240) break;
      }
    }
    if (!scelta) {
      senzaSala.push({ id: v.id, perche: v.inizioFisso != null ? 'la stanza fissata è occupata da un altro' : 'nessuna stanza libera entro quattro ore dall\'ora teorica' });
      continue;
    }
    const f = finestraStanza(v, scelta.inizio);
    const fine = scelta.inizio + v.durata;
    const riferimento = Math.max(v.teorica, arrivato ? v.arrivo! : v.teorica);
    const spostamento = m ? spostamentoMin(m.inSala, scelta.sala) : 0;
    visite[v.id] = {
      id: v.id, sala: scelta.sala, ingresso: f.ingresso, inizio: scelta.inizio, fine,
      assistente: scelta.assistente, apparecchi: v.apparecchi,
      attesa: Math.max(0, scelta.inizio - riferimento),
      perche: {
        congelato: v.rigidita >= 3, stanzaFissa: !!v.salaFissa,
        stanzaComunicata: v.comunicato?.sala ?? null, stanzaPreferita: v.salaPreferita ?? null,
        medicoLiberoDa: m ? m.liberoDa : null, ritardoMedico: m ? m.ritardo : 0, spostamento,
      },
    };
    occStanza[scelta.sala].push({ da: f.da, a: f.a, id: v.id, chi: v.medico });
    if (scelta.assistente) (occAssist[scelta.assistente] ??= []).push({ da: scelta.inizio - v.prep, a: scelta.inizio, id: v.id, chi: scelta.assistente });
    for (const ap of v.apparecchi) (occApp[ap] ??= []).push({ da: f.da, a: f.a, id: v.id, chi: v.medico });
    if (m) {
      (sequenze[m.nome] ??= []).push({ id: v.id, sala: scelta.sala, inizio: scelta.inizio, fine, spostamento });
      m.liberoDa = Math.max(m.liberoDa, fine);
      m.fineUltima = Math.max(m.fineUltima, fine);
      m.inSala = scelta.sala;
      m.quante += 1;
      // I cuscinetti del mattino: un buco ogni N visite, che di giorno è la
      // prima cosa che assorbe un ritardo.
      if (input.conCuscinetti && p.cuscinetto_ogni_visite > 0 && m.quante % p.cuscinetto_ogni_visite === 0) m.liberoDa += p.cuscinetto_min;
    }
  }

  for (const k of Object.keys(sequenze)) sequenze[k].sort((a, b) => a.inizio - b.inizio);
  const termini = misura(visite, ordinate, sequenze, p);
  const costo = Object.entries(termini).reduce((s, [k, v]) => s + v * ((p.pesi as Record<string, number>)[k] ?? 0), 0);
  return { visite, senzaSala, sequenze, termini, costo, motore: 'riparatore' };
}

// I termini dell'obiettivo (§6), misurati sul piano: servono a confrontare
// due piani e a dire quanto costa una modifica. Sono gli stessi che il solver
// CP-SAT minimizza, calcolati allo stesso modo.
export function misura(visite: Record<string, Pianificata>, richieste: VisitaDaPianificare[], sequenze: Record<string, Tappa[]>, p: Parametri): Record<string, number> {
  let attesa = 0, ritardo = 0, modifica = 0, stanzaInutile = 0, congelato = 0;
  for (const v of richieste) {
    const x = visite[v.id];
    if (!x) continue;
    attesa += x.attesa;
    ritardo += Math.max(0, x.inizio - v.teorica);
    stanzaInutile += Math.max(0, (x.inizio - x.ingresso) - Math.max(v.prep, p.anticipo_ingresso_min));
    if (v.comunicato) {
      modifica += Math.abs(x.ingresso - v.comunicato.ingresso) + (x.sala.toLowerCase() !== v.comunicato.sala.toLowerCase() ? p.pesi.modifica_stanza : 0);
      if (v.rigidita >= 2 && (x.sala.toLowerCase() !== v.comunicato.sala.toLowerCase() || (v.rigidita >= 3 && x.ingresso !== v.comunicato.ingresso))) congelato += 1;
    }
  }
  let spostamento = 0, propagazione = 0;
  for (const seq of Object.values(sequenze)) {
    for (let i = 1; i < seq.length; i++) if (seq[i].sala.toLowerCase() !== seq[i - 1].sala.toLowerCase()) spostamento += 1;
    const ultima = seq[seq.length - 1];
    const r = ultima ? richieste.find((v) => v.id === ultima.id) : null;
    if (ultima && r) propagazione += Math.max(0, ultima.inizio - r.teorica);
  }
  return { attesa, ritardo, modifica, stanza_inutile: stanzaInutile, spostamento, propagazione, congelato, uso: 0 };
}
