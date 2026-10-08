// Pressione: la cartella condivisa (8.10.2026) — la parte PURA.
// Che cosa si può leggere, e di chi è un file: lo si capisce dal NOME del file
// («Rossi Maria 12.06.1955.csv») o dalle prime righe (certi programmi scrivono
// «Paziente: …», «Data di nascita: …» sopra la tabella). Non si indovina: se
// manca il nome o la data di nascita, o se non c'è UNA persona sola che
// combacia, il file aspetta che qualcuno scelga il paziente.

export const ESTENSIONI_LETTE = ['csv', 'txt', 'tsv'];
export const PESO_MASSIMO = 400_000;

export function estensione(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(String(nome ?? ''));
  return m ? m[1].toLowerCase() : '';
}
// Un file di servizio (nascosto, temporaneo, di sistema) non è un documento.
export const daIgnorare = (nome: string): boolean => /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$|\.(tmp|part|crdownload|perche\.txt)$/i.test(String(nome ?? ''));

// Perché un file non si legge, in parole per chi lo ha messo lì. null = si può provare a leggerlo.
export function perNonLeggerlo(nome: string, byte: number): string | null {
  const e = estensione(nome);
  if (['xlsx', 'xls', 'ods', 'numbers'].includes(e)) return 'È un foglio di calcolo: dal programma (o da Excel) salvalo come CSV e rimettilo nella cartella.';
  if (e === 'pdf') return 'È un PDF: serve il file con le misure una per riga (CSV o testo), non il referto stampato.';
  if (!ESTENSIONI_LETTE.includes(e)) return `Tipo di file non letto (.${e || 'senza estensione'}): servono CSV o testo, una misura per riga.`;
  if (byte > PESO_MASSIMO) return 'Il file è troppo grande per essere un profilo pressorio.';
  if (byte === 0) return 'Il file è vuoto.';
  return null;
}

const due = (n: number) => String(n).padStart(2, '0');
function data(g: number, m: number, a: number): string | null {
  if (a < 100) a += a > 30 ? 1900 : 2000;
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || g < 1 || g > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCMonth() === m - 1 ? `${a}-${due(m)}-${due(g)}` : null;
}
function primaData(s: string): { iso: string; inizio: number; fine: number } | null {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) { const iso = data(+m[3], +m[2], +m[1]); if (iso) return { iso, inizio: m.index, fine: m.index + m[0].length }; }
  m = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(s);
  if (m) { const iso = data(+m[1], +m[2], +m[3]); if (iso) return { iso, inizio: m.index, fine: m.index + m[0].length }; }
  return null;
}

export type Identita = { nome: string; nascita: string | null; da: 'file' | 'nome_del_file' | 'niente' };

// Il nome e la data di nascita scritti NEL file, nelle righe prima della tabella.
function dalleRighe(testo: string): { nome: string; nascita: string | null } {
  let cognome = '', nomeProprio = '', intero = '', nascita: string | null = null;
  for (const riga of String(testo ?? '').replace(/\r/g, '').split('\n').slice(0, 25)) {
    const m = /^\s*"?([A-Za-zÀ-ÿ .'’/-]{2,40}?)"?\s*[:;=\t,]\s*"?(.+?)"?\s*[;,\t]*\s*$/.exec(riga);
    if (!m) continue;
    const chiave = m[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(), valore = m[2].replace(/^["']|["']$/g, '').trim();
    if (/nascita|geburt|birth|naissance|^geb\b|^dob$|^nato/.test(chiave)) { nascita = nascita ?? primaData(valore)?.iso ?? null; continue; }
    if (/\d{2}[.:]\d{2}/.test(valore) && /\d{2,3}\D+\d{2,3}/.test(valore)) continue;   // è già una riga di misure
    if (/^(cognome|nachname|surname|last ?name|nom|familienname)$/.test(chiave)) cognome = valore;
    else if (/^(nome|vorname|first ?name|prenom|given ?name)$/.test(chiave)) nomeProprio = valore;
    else if (/^(paziente|patient|name|nome e cognome|cognome e nome|nominativo)$/.test(chiave)) intero = valore;
  }
  const nome = (cognome || nomeProprio ? `${cognome} ${nomeProprio}` : intero).replace(/[^A-Za-zÀ-ÿ '’-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { nome: nome.slice(0, 80), nascita };
}

export function identitaDaFile(nomeFile: string, testo: string): Identita {
  const righe = dalleRighe(testo);
  if (righe.nome && righe.nascita) return { ...righe, da: 'file' };
  // Dal nome del file: la data che c'è scritta è quella di NASCITA (è la convenzione
  // detta in pagina), tutto ciò che è lettere prima o dopo è il nome.
  const base = String(nomeFile ?? '').replace(/\.[A-Za-z0-9]{1,6}$/, '').replace(/[_]+/g, ' ');
  const d = primaData(base);
  const lettere = (d ? base.slice(0, d.inizio) + ' ' + base.slice(d.fine) : base).replace(/[^A-Za-zÀ-ÿ '’-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nome = righe.nome || lettere;
  const nascita = righe.nascita ?? d?.iso ?? null;
  return { nome: nome.slice(0, 80), nascita, da: nome || nascita ? (righe.nome || righe.nascita ? 'file' : 'nome_del_file') : 'niente' };
}

// Il testo di un file esportato da Windows può non essere UTF-8: si prova, e se
// escono caratteri rotti si rilegge come Latin-1 (accenti di «è», «ü»).
export function decodifica(b: Uint8Array): string {
  const utf = new TextDecoder('utf-8', { fatal: false }).decode(b);
  return utf.includes('�') ? new TextDecoder('latin1').decode(b) : utf.replace(/^﻿/, '');
}
