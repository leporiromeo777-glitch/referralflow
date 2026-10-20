// Pressione: l'invio dal generatore dei referti Aktiia (20.10.2026,
// [[Piattaforma/Pressione]]) — la parte PURA. Il generatore è un file HTML
// sui computer dello studio: legge l'Excel dell'Aktiia, il medico controlla
// il referto Word e lo CONFERMA, e solo allora manda qui misure, paziente,
// giorno/notte e il referto. Qui si controlla il corpo e lo si trasforma nel
// testo che `leggiFile` sa già leggere: le misure passano dalla stessa porta
// del caricamento dalla pagina e della cartella condivisa.

export const MASSIMO_MISURE = 1500;            // leggiFile legge fino a 2000 righe; otto giorni di Aktiia sono ~250 misure
export const MASSIMO_REFERTO = 8 * 1024 * 1024;

export type Invio = {
  testo: string;
  chi: { nome: string; nascita: string };
  sveglia: string;
  sonno: string;
  apparecchio: string;
  referto: { nome: string; dati: Buffer } | null;
};

const due = (n: number) => String(n).padStart(2, '0');
const RX_QUANDO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const RX_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function dataValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const pulisciNome = (s: unknown) => String(s ?? '').replace(/[^A-Za-zÀ-ÿ '’-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

// Nome del file del referto: solo caratteri sicuri, sempre .docx.
export function nomeReferto(s: unknown): string {
  const base = String(s ?? '').replace(/\.docx$/i, '').replace(/[^A-Za-zÀ-ÿ0-9 ._()-]+/g, ' ').replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s.]+/, '').trim().slice(0, 120);
  return `${base || 'Referto pressione'}.docx`;
}

export function validaInvio(corpo: unknown): Invio | { errore: string } {
  const c = (corpo ?? {}) as Record<string, any>;
  const p = (c.paziente ?? {}) as Record<string, unknown>;
  const cognome = pulisciNome(p.cognome), nome = pulisciNome(p.nome), nascita = String(p.data_nascita ?? '');
  if (!cognome || !nome) return { errore: 'Mancano cognome e nome del paziente.' };
  if (!dataValida(nascita)) return { errore: 'Manca la data di nascita del paziente (serve per riconoscerlo).' };

  const misure = Array.isArray(c.misure) ? c.misure : null;
  if (!misure || misure.length < 10) return { errore: 'Servono almeno 10 misure.' };
  if (misure.length > MASSIMO_MISURE) return { errore: `Troppe misure (${misure.length}): al massimo ${MASSIMO_MISURE}.` };
  const righe = ['Data;Ora;Sistolica;Diastolica;Frequenza'];
  for (const m of misure) {
    const q = RX_QUANDO.exec(String(m?.quando ?? ''));
    const sis = Number(m?.sis), dia = Number(m?.dia), fc = m?.fc == null || m?.fc === '' ? null : Number(m.fc);
    if (!q || !dataValida(`${q[1]}-${q[2]}-${q[3]}`) || +q[4] > 23 || +q[5] > 59) return { errore: 'Una misura ha data e ora non valide.' };
    if (![sis, dia].every((n) => Number.isInteger(n) && n > 0 && n < 400) || (fc !== null && !(Number.isInteger(fc) && fc > 0 && fc < 400))) return { errore: 'Una misura ha valori non numerici.' };
    righe.push(`${q[1]}-${q[2]}-${q[3]};${due(+q[4])}:${q[5]};${sis};${dia};${fc ?? ''}`);
  }

  const sveglia = String(c.sveglia ?? '07:00'), sonno = String(c.sonno ?? '22:00');
  if (!RX_ORA.test(sveglia) || !RX_ORA.test(sonno) || sveglia === sonno) return { errore: 'Orari di sveglia e sonno non validi.' };

  let referto: Invio['referto'] = null;
  if (c.referto != null) {
    const b64 = String(c.referto.docx_base64 ?? '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length > Math.ceil(MASSIMO_REFERTO / 3) * 4) return { errore: 'Il referto Word non è valido o è troppo grande.' };
    const dati = Buffer.from(b64, 'base64');
    if (dati.length < 4 || dati[0] !== 0x50 || dati[1] !== 0x4b) return { errore: 'Il referto non è un file Word (.docx).' };
    referto = { nome: nomeReferto(c.referto.nome_file), dati };
  }

  return {
    testo: righe.join('\n'),
    chi: { nome: `${cognome} ${nome}`, nascita },
    sveglia, sonno,
    apparecchio: String(c.apparecchio ?? 'Aktiia').replace(/[^A-Za-zÀ-ÿ0-9 .()-]+/g, ' ').trim().slice(0, 40) || 'Aktiia',
    referto,
  };
}
