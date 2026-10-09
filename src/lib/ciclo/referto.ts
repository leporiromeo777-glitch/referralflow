// Prova da sforzo: leggere il referto PDF della ciclo (9.10.2026). PURO.
//
// Il programma della ciclo (Cardioline CubeStress) chiama il file
//   STX_<id>_<nome>_<cognome>_<sesso>__<esame AAAAMMGGhhmmss>__<referto AAAAMMGGhhmmss>__<n>.pdf
// e nel PDF scrive «Nome : Cognome, Nome», «Data di nascita : …», «Data Esame: gg/mm/aaaa - hh:mm».
// Dal NOME del file si prendono solo le due ore (sono cifre, non si sbaglia); chi è il paziente
// si legge dal TESTO, dove cognome e nome sono separati da una virgola e non da un trattino basso.
// Niente di più furbo: se manca la data di nascita il referto non si aggancia da solo.

export type NomeFile = { esame: string; referto: string; n: number };
const ora = (s: string): string | null => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const [a, me, g, h, mi, se] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(a, me - 1, g, h, mi, se));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g || h > 23 || mi > 59 || se > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
};
export function daNomeFile(nome: string): NomeFile | null {
  const m = /^STX_.*__(\d{14})__(\d{14})__(\d+)\.pdf$/i.exec(String(nome ?? ''));
  if (!m) return null;
  const esame = ora(m[1]), referto = ora(m[2]);
  return esame && referto ? { esame, referto, n: Number(m[3]) } : null;
}

const giorno = (s: string): string | null => {
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s.trim());
  let a = 0, me = 0, g = 0;
  if (m) { g = +m[1]; me = +m[2]; a = +m[3]; }
  else { m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim()); if (!m) return null; a = +m[1]; me = +m[2]; g = +m[3]; }
  if (a < 1900 || a > 2100) return null;
  const d = new Date(Date.UTC(a, me - 1, g));
  if (d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
  return `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
};

export type Referto = { cognome: string; nome: string; nascita: string | null; esame: string | null };
// null = non è un referto della prova da sforzo (un altro PDF finito lì, o una scansione senza testo).
export function daTesto(testo: string): Referto | null {
  const t = String(testo ?? '');
  if (!/Esame\s+Stress/i.test(t) || !/Data\s+Esame\s*:/i.test(t)) return null;
  // «Nome : Cognome, Nome» — sulla stessa riga non c'è altro.
  const rn = /^\s*Nome\s*:\s*(.*)$/im.exec(t);
  const intero = (rn ? rn[1] : '').replace(/\s+/g, ' ').trim();
  const v = intero.indexOf(',');
  const cognome = (v >= 0 ? intero.slice(0, v) : intero).trim(), nome = (v >= 0 ? intero.slice(v + 1) : '').trim();
  // «Data di nascita : gg/mm/aaaa Età : NN anni» — la data può mancare.
  const rd = /Data\s+di\s+nascita\s*:\s*([0-9]{1,4}[./-][0-9]{1,2}[./-][0-9]{2,4})?/i.exec(t);
  const re = /Data\s+Esame\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*-\s*(\d{1,2}):(\d{2})/i.exec(t);
  const ge = re ? giorno(re[1]) : null;
  return {
    cognome: cognome.slice(0, 80), nome: nome.slice(0, 80),
    nascita: rd && rd[1] ? giorno(rd[1]) : null,
    esame: ge && re ? `${ge}T${re[2].padStart(2, '0')}:${re[3]}:00` : null,
  };
}

// Come si chiama il documento nella cartella del paziente. Di ECG se ne fanno anche due nello
// stesso giorno: il nome porta pure l'ora.
export function nomeDocumento(esame: string | null, tipo: 'ciclo' | 'ecg' = 'ciclo'): string {
  const g = esame ? `${esame.slice(8, 10)}.${esame.slice(5, 7)}.${esame.slice(0, 4)}` : '';
  if (tipo === 'ecg') return `ECG${g ? ` ${g}` : ''}${esame && esame.length >= 16 ? ` ${esame.slice(11, 13)}.${esame.slice(14, 16)}` : ''}.pdf`;
  return `Prova da sforzo${g ? ` ${g}` : ''}.pdf`;
}
