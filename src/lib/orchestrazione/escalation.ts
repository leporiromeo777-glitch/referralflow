// Il modello grande, solo su chiamata (16.9.2026, §10.2).
//
// Riceve uno stato compatto e strutturato — codici, tipi, minuti, stanze — e
// i piani candidati del solver; risponde con una strategia in forma fissa,
// che il codice legge come fa leggiProposta: quel che non è nel formato si
// scarta. Poi il solver ricalcola con la strategia come vincolo. È asincrona:
// il tempo reale intanto applica il piano conservativo, e la proposta si
// scarta se lo stato è cambiato nel frattempo.

export const STRATEGIA_PROMPT = `Sei il consulente organizzativo di uno studio di cardiologia. Il sistema che assegna le sale ha trovato una situazione difficile e ti chiede una strategia. NON decidi tu: proponi, il calcolo lo rifà un programma e la conferma è di una persona.

SITUAZIONE ADESSO (minuti dalla mezzanotte, pazienti come codici):
{stato}

PIANI CANDIDATI (equivalenti per il calcolo, diversi per le persone):
{piani}

MOSSE POSSIBILI, in ordine di costo per le persone:
- cuscinetto: consumare un tempo cuscinetto di un medico
- stanza_alternativa:<stanza>: far entrare il prossimo paziente in un'altra stanza libera
- riordino:<codice1><><codice2>: invertire due pazienti flessibili dello stesso medico
- preparazione_anticipata: preparare il successivo mentre il medico è ancora dentro
- attesa:<codice>: lasciare un paziente in sala d'attesa invece di farlo entrare
- propagazione: far slittare quel che resta

Regole: non toccare i pazienti CONGELATI; non cambiare medico a nessuno; non abbreviare visite; scegli un piano e al massimo tre mosse.

Rispondi con queste righe e nient'altro:
PIANO: <numero del piano scelto>
MOSSA: <una mossa>
MOSSA: <una mossa>
PERCHE: <tre righe al massimo, per la segreteria>`;

export type Strategia = { piano: number; mosse: string[]; perche: string };

export function leggiStrategia(risposta: string): Strategia | null {
  const t = String(risposta ?? '').replace(/\*\*/g, '');
  const pulito = t.includes('</think>') ? t.split('</think>').pop()! : t;
  const piano = /(^|\n)\s*PIANO\s*:\s*(\d+)/i.exec(pulito);
  if (!piano) return null;
  const mosse = [...pulito.matchAll(/(^|\n)\s*MOSSA\s*:\s*([^\n]+)/gi)].map((m) => m[2].trim())
    .filter((m) => /^(cuscinetto|stanza_alternativa:.+|riordino:.+<>.+|preparazione_anticipata|attesa:.+|propagazione)$/.test(m)).slice(0, 3);
  const perche = /(^|\n)\s*PERCHE\s*:\s*([\s\S]+)$/i.exec(pulito);
  return { piano: parseInt(piano[2], 10), mosse, perche: (perche?.[2] ?? '').trim().split('\n').slice(0, 3).join(' ').trim() };
}

// Le mosse diventano vincoli o preferenze per il ricalcolo. Quel che non è
// ammesso (un congelato, un codice sconosciuto) si scarta e si dice.
export function applicaStrategia(s: Strategia, visite: { id: string; medico: string; rigidita: number; salePossibili: string[] }[], stanze: string[]) {
  const scartate: string[] = [];
  const forzaAttesa = new Set<string>();
  const preferisci: Record<string, string> = {};
  const riordini: [string, string][] = [];
  for (const m of s.mosse) {
    const [k, arg = ''] = m.split(':');
    if (k === 'attesa') {
      const v = visite.find((x) => x.id === arg.trim());
      if (!v) { scartate.push(`${m}: codice sconosciuto`); continue; }
      if (v.rigidita >= 2) { scartate.push(`${m}: il paziente è congelato`); continue; }
      forzaAttesa.add(v.id);
    } else if (k === 'stanza_alternativa') {
      if (!stanze.some((x) => x.toLowerCase() === arg.trim().toLowerCase())) { scartate.push(`${m}: stanza sconosciuta`); continue; }
      preferisci['*'] = arg.trim();
    } else if (k === 'riordino') {
      const [a, b] = arg.split('<>').map((x) => x.trim());
      const va = visite.find((x) => x.id === a), vb = visite.find((x) => x.id === b);
      if (!va || !vb) { scartate.push(`${m}: codice sconosciuto`); continue; }
      if (va.medico.toLowerCase() !== vb.medico.toLowerCase()) { scartate.push(`${m}: medici diversi`); continue; }
      if (va.rigidita >= 2 || vb.rigidita >= 2) { scartate.push(`${m}: uno dei due è congelato`); continue; }
      riordini.push([a, b]);
    }
    // cuscinetto, preparazione_anticipata, propagazione: le fa già il solver
  }
  return { forzaAttesa, preferisci, riordini, scartate };
}
