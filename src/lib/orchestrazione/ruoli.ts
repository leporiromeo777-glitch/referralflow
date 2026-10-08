// Chi può fare cosa nell'orchestrazione delle sale (§12; rivisto l'8.10.2026).
// PURO. Tre livelli:
// - `operare`: guardare lo stato e il piano, e registrare ciò che succede —
//   paziente arrivato, in sala d'attesa, chiamato, in preparazione, pronto,
//   in visita, uscito — anche scrivendolo a parole nel riquadro Accoglienza.
//   Lo fa chi sta coi pazienti: segreteria, medico, AIUTO MEDICO, amministrazione.
//   (Fino all'8.10.2026 l'aiuto medico era escluso: vedeva la pagina Sale ma
//   il server gli rifiutava tutto, compresi «in preparazione» e «pronto», che
//   sono proprio il suo lavoro.)
// - `decidere`: i comandi che cambiano il piano (blocca, sala fuori servizio,
//   medico resta, priorità…), rifare il piano del mattino, accettare o
//   rifiutare una proposta. Segreteria, medico, amministrazione.
// - `parametri` e `durate`: come prima.
// Il tecnico tiene in piedi il sistema e non registra niente sui pazienti.
export const PUO_ORCH = {
  operare: ['segretaria', 'medico', 'assistente', 'admin'],
  decidere: ['segretaria', 'medico', 'admin'],
  parametri: ['admin'],
  durate: ['medico', 'admin'],
} as const;
export type CapacitaOrch = keyof typeof PUO_ORCH;
export const puoOrch = (ruolo: string | null | undefined, cosa: CapacitaOrch): boolean => !!ruolo && (PUO_ORCH[cosa] as readonly string[]).includes(ruolo);
