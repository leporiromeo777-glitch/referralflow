// Il nome del file Word (20.10.2026, richiesta dello studio): «AA.MM.GG Cognome Nome» — le ultime due cifre dell'anno,
// mese e giorno della lettera, poi il paziente — così in una cartella i Word stanno in ordine di tempo. PURO.
// La data è quella della lettera (`dataBase`, «gg.mm.aaaa»); il paziente è quello della cartella (cognome, nome) o,
// se la bozza non è collegata a una cartella, il nome scritto nei campi. Niente segni che un file system rifiuta.
export function nomeFileWord(dataBase: string, paziente: { cognome?: string | null; nome?: string | null } | string | null): string {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(dataBase ?? ''));
  const data = m ? `${m[3].slice(2)}.${m[2].padStart(2, '0')}.${m[1].padStart(2, '0')}` : '';
  const chi = typeof paziente === 'string' ? paziente : paziente ? [paziente.cognome, paziente.nome].filter(Boolean).join(' ') : '';
  const pulito = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nome = pulito(`${data} ${pulito(chi).slice(0, 80)}`);
  return `${nome || 'referto'}.docx`;
}
// Per l'intestazione HTTP: il nome com'è (UTF-8) e una copia senza accenti per i programmi vecchi.
export function intestazioneFile(nome: string): string {
  const ascii = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
