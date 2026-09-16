// Il modello piccolo capisce testo (16.9.2026, §10.1): un evento scritto
// dalla segreteria, un comando in italiano, la frase per un diff troppo
// articolato per le frasi fisse. Mai il calcolo. Qui i prompt e la lettura
// delle risposte in forma fissa; la chiamata a Ollama sta nell'orchestratore.

export const EVENTO_PROMPT = `Sei l'assistente di uno studio di cardiologia. Una persona della segreteria scrive una frase su quel che succede in studio. Devi trasformarla in UN evento per il sistema che gestisce le sale, scegliendo fra questi tipi:
paziente_arrivato, paziente_in_ritardo, paziente_assente, visita_iniziata, visita_finita, medico_in_ritardo, sala_fuori_servizio, sala_ripristinata, urgenza, comando

Le persone e le stanze che esistono oggi sono queste (usa ESATTAMENTE questi nomi):
PAZIENTI: {pazienti}
MEDICI: {medici}
STANZE: {stanze}

Rispondi con queste righe e nient'altro; lascia vuoto quel che non c'è:
TIPO: <uno dei tipi>
PAZIENTE: <codice del paziente dall'elenco>
MEDICO: <nome dall'elenco>
STANZA: <nome dall'elenco>
MINUTI: <numero, per i ritardi>
COMANDO: <se TIPO è comando: blocca_paziente | non_spostare | blocca_sala | sala_fuori_servizio | medico_resta | priorita | forza | visita_breve | ripristina>
NOTA: <una riga, solo se c'è un vincolo in più, per esempio «dopo il prelievo»>

Se la frase non è un evento dello studio, rispondi: TIPO: nessuno

Frase: {testo}`;

export type EventoLetto = { tipo: string; paziente: string; medico: string; stanza: string; minuti: number | null; comando: string; nota: string };

export function leggiEvento(risposta: string): EventoLetto | null {
  const t = String(risposta ?? '').replace(/\*\*/g, '');
  // Dopo i due punti solo spazi, non a capo: una riga vuota non deve
  // inghiottire quella dopo.
  const prendi = (k: string) => { const m = new RegExp(`(^|\\n)[ \\t]*${k}[ \\t]*:[ \\t]*([^\\n]*)`, 'i').exec(t); return m ? m[2].trim() : ''; };
  const tipo = prendi('TIPO').toLowerCase().replace(/[^a-z_]/g, '');
  if (!tipo || tipo === 'nessuno') return null;
  const minuti = parseInt(prendi('MINUTI').replace(/[^\d-]/g, ''), 10);
  return { tipo, paziente: prendi('PAZIENTE'), medico: prendi('MEDICO'), stanza: prendi('STANZA'), minuti: Number.isFinite(minuti) ? minuti : null, comando: prendi('COMANDO').toLowerCase(), nota: prendi('NOTA') };
}

// Il codice verifica: il tipo esiste, il paziente/medico/stanza sono
// nell'elenco di oggi. Se no, non è un evento: è una domanda per la persona.
export function verificaEvento(e: EventoLetto, oggi: { pazienti: string[]; medici: string[]; stanze: string[] }): { ok: boolean; problemi: string[] } {
  const problemi: string[] = [];
  const TIPI = ['paziente_arrivato', 'paziente_in_ritardo', 'paziente_assente', 'visita_iniziata', 'visita_finita', 'medico_in_ritardo', 'sala_fuori_servizio', 'sala_ripristinata', 'urgenza', 'comando'];
  if (!TIPI.includes(e.tipo)) problemi.push(`tipo «${e.tipo}» sconosciuto`);
  const ha = (lista: string[], x: string) => !x || lista.some((y) => y.toLowerCase() === x.toLowerCase());
  if (!ha(oggi.pazienti, e.paziente)) problemi.push(`paziente «${e.paziente}» non è fra quelli di oggi`);
  if (!ha(oggi.medici, e.medico)) problemi.push(`medico «${e.medico}» non è fra quelli di oggi`);
  if (!ha(oggi.stanze, e.stanza)) problemi.push(`stanza «${e.stanza}» non esiste`);
  if (e.tipo.startsWith('paziente_') && !e.paziente) problemi.push('manca il paziente');
  if (e.tipo === 'medico_in_ritardo' && (!e.medico || e.minuti == null)) problemi.push('servono il medico e i minuti');
  if (e.tipo.startsWith('sala_') && !e.stanza) problemi.push('manca la stanza');
  return { ok: !problemi.length, problemi };
}

export const SPIEGA_PROMPT = `Scrivi in italiano, in due o tre frasi asciutte, che cosa è cambiato nel piano delle sale e perché. Usa SOLO i fatti qui sotto: non aggiungere cause, non inventare orari. I pazienti sono indicati con un codice: usa il codice.

FATTI:
{fatti}`;
