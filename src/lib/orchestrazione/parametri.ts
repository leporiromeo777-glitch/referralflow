// I pesi e le soglie dell'orchestrazione (16.9.2026).
//
// I default sono QUI, con i motivi; la tabella `orchestrazione_parametri`
// tiene solo quel che lo studio ha cambiato. Ogni numero è scritto con il
// verso della stabilità: il sistema deve cambiare il piano solo quando
// cambiare serve ([[Piattaforma/Orchestrazione sale]] §6, §8).

export type Parametri = {
  // Orizzonte mobile (minuti). Oltre, gli appuntamenti si muovono a blocco.
  orizzonte_min: number;
  // Rigidità dal tempo che manca all'inizio stimato (minuti).
  congela_entro_min: number;      // ≤ → rigidità 3 (stanza e ora fisse)
  stanza_fissa_entro_min: number; // ≤ → rigidità 2 (stanza fissa)
  costoso_entro_min: number;      // ≤ → rigidità 1 (cambiare costa molto)
  // Ingresso in stanza.
  anticipo_ingresso_min: number;  // il paziente entra N min prima dell'arrivo previsto del medico
  attesa_in_sala_max_min: number; // oltre, resta in sala d'attesa e la stanza non si occupa
  // Ritardi.
  passo_ritardo_min: number;      // ogni N min di ritardo si ripianifica
  soglia_avviso_min: number;      // sotto, nessun avviso
  soglia_comunicazione_min: number; // sotto, la modifica si applica in silenzio
  soglia_accoglienza_min: number; // oltre, avviso all'accoglienza
  soglia_escalation_min: number;  // oltre, il modello grande
  attesa_conferma_min: number;    // una proposta non confermata scade
  // Ritmo.
  intervallo_min_ripianifica_s: number;
  limite_solver_ms: number;
  limite_solver_mattino_ms: number;
  // Stessa stanza, uno dopo l'altro: solo con questa pausa in mezzo (16.9.2026,
  // detto dallo studio). Altrimenti il paziente successivo va in un'altra
  // stanza. Non vale per chi ha una stanza sola per regola.
  pausa_stessa_stanza_min: number;
  // Spostamenti.
  distanza_default_s: number;
  // Cuscinetti: uno ogni N visite per medico, nel piano del mattino.
  cuscinetto_ogni_visite: number;
  cuscinetto_min: number;
  // Pesi dell'obiettivo (§6). Ogni livello vale almeno dieci volte il successivo.
  pesi: {
    congelato: number;
    attesa: number;
    ritardo: number;
    stanza_inutile: number;
    spostamento: number;
    modifica: number;
    modifica_stanza: number;   // costo fisso di un cambio di stanza rispetto al comunicato
    propagazione: number;
    uso: number;
  };
};

export const PARAMETRI_DEFAULT: Parametri = {
  orizzonte_min: 90,
  congela_entro_min: 0,
  stanza_fissa_entro_min: 10,
  costoso_entro_min: 30,
  anticipo_ingresso_min: 8,
  attesa_in_sala_max_min: 15,
  passo_ritardo_min: 5,
  soglia_avviso_min: 8,
  soglia_comunicazione_min: 5,
  soglia_accoglienza_min: 15,
  soglia_escalation_min: 30,
  attesa_conferma_min: 3,
  intervallo_min_ripianifica_s: 30,
  limite_solver_ms: 2000,
  limite_solver_mattino_ms: 60_000,
  pausa_stessa_stanza_min: 10,
  distanza_default_s: 60,
  cuscinetto_ogni_visite: 6,
  cuscinetto_min: 10,
  pesi: {
    congelato: 100_000,
    attesa: 100,
    ritardo: 80,
    stanza_inutile: 20,
    spostamento: 10,
    modifica: 30,
    modifica_stanza: 15,
    propagazione: 40,
    uso: 5,
  },
};

// Fonde i valori salvati sopra i default. Una chiave sconosciuta si ignora,
// un valore del tipo sbagliato pure: la tabella non può rompere il motore.
export function fondiParametri(salvati: Record<string, unknown>): Parametri {
  const p: Parametri = JSON.parse(JSON.stringify(PARAMETRI_DEFAULT));
  for (const [k, v] of Object.entries(salvati ?? {})) {
    if (k === 'pesi' && v && typeof v === 'object') {
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        if (pk in p.pesi && typeof pv === 'number' && pv >= 0) (p.pesi as Record<string, number>)[pk] = pv;
      }
      continue;
    }
    if (k in p && k !== 'pesi' && typeof v === 'number' && v >= 0) (p as unknown as Record<string, number>)[k] = v;
  }
  return p;
}
