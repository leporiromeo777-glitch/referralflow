import 'server-only';
import type { Parametri } from './parametri';
import { misura, type ApparecchioDisp, type AssistenteDisp, type MedicoDisp, type Piano, type Pianificata, type StanzaDisp, type VisitaDaPianificare } from './riparatore';

// Il client del servizio CP-SAT (§12). Un contratto piccolo, nessun testo
// clinico nel corpo. Se il servizio non risponde entro il limite, chi chiama
// usa il riparatore: qui si torna null e si scrive nel log solo la causa.

const URL = (process.env.SOLVER_SALE_URL ?? 'http://127.0.0.1:8711').replace(/\/$/, '');

export type PianoSolver = Omit<Piano, 'motore'> & { motore: 'cp-sat'; alternativi: Piano['visite'][]; statoSolver: string; ms: number };

export async function risolviConSolver(input: {
  adesso: number; visite: VisitaDaPianificare[]; stanze: StanzaDisp[]; medici: MedicoDisp[];
  assistenti: AssistenteDisp[]; apparecchi: ApparecchioDisp[]; distanze: Record<string, number>; distanzaDefault: number;
}, p: Parametri, opz: { limiteMs: number; quantiPiani?: number }): Promise<PianoSolver | null> {
  const corpo = {
    adesso: input.adesso, anticipo: p.anticipo_ingresso_min, limite_ms: opz.limiteMs, quanti_piani: opz.quantiPiani ?? 1,
    pesi: p.pesi, distanze: input.distanze, distanza_default: input.distanzaDefault,
    stanze: input.stanze.map((s) => ({ nome: s.nome, posti: s.posti, bloccata: s.bloccata, ultima: !!s.ultima })),
    medici: input.medici.map((m) => ({ nome: m.nome, libero_da: m.liberoDa, in_sala: m.inSala, ritardo: m.ritardo })),
    assistenti: input.assistenti.map((a) => ({ nome: a.nome, libero_da: a.liberoDa })),
    apparecchi: input.apparecchi.map((a) => ({ nome: a.nome, mobile: a.mobile, in_sala: a.inSala, bloccato: a.bloccato })),
    visite: input.visite.map((v) => ({
      id: v.id, medico: v.medico, teorica: v.teorica, durata: v.durata, prep: v.prep, ripristino: v.ripristino,
      sale_possibili: v.salePossibili, sala_preferita: v.salaPreferita ?? null, apparecchi: v.apparecchi, assistenti: v.assistenti,
      senza_medico: v.senzaMedico, arrivo: v.arrivo ?? null, stato: v.stato, rigidita: v.rigidita,
      sala_fissa: v.salaFissa ?? null, inizio_fisso: v.inizioFisso ?? null, comunicato: v.comunicato ?? null, priorita: v.priorita,
    })),
  };
  try {
    const r = await fetch(`${URL}/risolvi`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(opz.limiteMs + 3000), cache: 'no-store',
    });
    if (!r.ok) { console.log(`[solver-sale] HTTP ${r.status}`); return null; }
    const j = await r.json();
    if (!Array.isArray(j?.piani) || !j.piani.length) { console.log(`[solver-sale] ${j?.stato ?? 'senza piani'} in ${j?.ms ?? '?'} ms`); return null; }
    const daPiano = (pl: any): Record<string, Pianificata> => {
      const out: Record<string, Pianificata> = {};
      for (const x of pl.visite) {
        const v = input.visite.find((y) => y.id === x.id);
        const rif = v ? Math.max(v.teorica, v.arrivo != null && v.arrivo <= input.adesso ? v.arrivo : v.teorica) : x.inizio;
        out[x.id] = { id: x.id, sala: x.sala, ingresso: x.ingresso, inizio: x.inizio, fine: x.fine, assistente: x.assistente ?? null, apparecchi: v?.apparecchi ?? [], attesa: Math.max(0, x.inizio - rif), perche: { motore: 'cp-sat' } };
      }
      return out;
    };
    const visite = daPiano(j.piani[0]);
    const sequenze: Piano['sequenze'] = {};
    for (const [m, seq] of Object.entries(j.piani[0].sequenze ?? {})) sequenze[m] = (seq as any[]).map((t) => ({ id: t.id, sala: t.sala, inizio: t.inizio, fine: t.fine, spostamento: 0 }));
    const termini = misura(visite, input.visite, sequenze, p);
    const costo = Object.entries(termini).reduce((s, [k, v]) => s + v * ((p.pesi as Record<string, number>)[k] ?? 0), 0);
    console.log(`[solver-sale] ${j.stato} in ${j.ms} ms, ${Object.keys(visite).length} visite, ${j.piani.length} piani`);
    return {
      visite, senzaSala: (j.senza_sala ?? []).map((x: any) => ({ id: x.id, perche: x.perche })), sequenze, termini, costo,
      motore: 'cp-sat', alternativi: j.piani.slice(1).map(daPiano), statoSolver: j.stato, ms: j.ms,
    };
  } catch (e) {
    console.log(`[solver-sale] non raggiungibile: ${String((e as Error)?.name ?? e).slice(0, 40)}`);
    return null;
  }
}

export async function solverVivo(): Promise<boolean> {
  try { const r = await fetch(`${URL}/vivo`, { signal: AbortSignal.timeout(800), cache: 'no-store' }); return r.ok; } catch { return false; }
}
