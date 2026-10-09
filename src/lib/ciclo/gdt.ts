// ECG a riposo: leggere il file GDT che touchECG scrive per ogni esame (9.10.2026). PURO.
//
// GDT è uno scambio di file fra programmi medici: righe «LLLCCCCvalore» (tre cifre di
// lunghezza, quattro di campo). Qui serve poco: chi è il paziente, quando è l'esame e come
// si chiama il PDF allegato. Il testo del referto e la tabella delle misure (campi 6220 e
// 6228) NON si leggono: sono già nel PDF, e non devono finire nel database né nei log.
export type EcgGdt = { cognome: string; nome: string; nascita: string | null; esame: string | null; pdf: string };

const giornoGdt = (s: string): string | null => {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const g = +m[1], me = +m[2], a = +m[3];
  if (a < 1900 || a > 2100) return null;
  const d = new Date(Date.UTC(a, me - 1, g));
  return d.getUTCMonth() === me - 1 && d.getUTCDate() === g ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export function campiGdt(testo: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of String(testo ?? '').split(/\r?\n/)) {
    if (r.length < 7 || !/^\d{7}/.test(r)) continue;
    const c = r.slice(3, 7);
    (m.get(c) ?? m.set(c, []).get(c)!).push(r.slice(7));
  }
  return m;
}

// null = non è un esame ECG con un PDF allegato (un altro GDT, o un file rotto).
export function ecgDaGdt(testo: string): EcgGdt | null {
  const c = campiGdt(testo);
  const uno = (k: string) => (c.get(k)?.[0] ?? '').trim();
  if (uno('8000') !== '6310' || !/^EKG/i.test(uno('8402'))) return null;
  // Il PDF: l'ultimo pezzo del percorso scritto dal programma (che è un percorso Windows).
  const pdf = uno('6305').split(/[\\/]/).pop() ?? '';
  if (!/\.pdf$/i.test(pdf)) return null;
  const g = giornoGdt(uno('6200')), o = /^(\d{2})(\d{2})(\d{2})$/.exec(uno('6201'));
  return {
    cognome: uno('3101').slice(0, 80), nome: uno('3102').slice(0, 80),
    nascita: giornoGdt(uno('3103')),
    esame: g ? `${g}T${o ? `${o[1]}:${o[2]}:${o[3]}` : '00:00:00'}` : null,
    pdf,
  };
}

// Il GDT dichiara la sua codifica (9206): 3 = ISO 8859-1, 2 = quella IBM dei vecchi PC. La seconda
// qui si legge come la prima: le lettere senza accento restano giuste, e un nome con l'accento
// sbagliato semplicemente non si aggancia da solo (va assegnato a mano), che è l'errore dalla parte giusta.
export const decodificaGdt = (b: Uint8Array): string => Buffer.from(b).toString('latin1');
