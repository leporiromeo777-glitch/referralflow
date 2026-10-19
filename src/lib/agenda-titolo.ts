// Che cosa c'è scritto dentro il riquadro dell'agenda MediOnline (15.9.2026).
//
// Il testo del riquadro non è solo il nome: la segreteria ci mette la data di
// nascita, il numero di paziente e la sigla dell'agenda. Esempio reale (forma,
// non un paziente vero):
//
//   «Rossi Rossi Mario Luca (06.03.1942 / N° 202847) · vpaio»
//   «Bianchi Anna (14.01.1963 / N° 202554) · P-E V»
//   «— Formazione (02:00) · M.M.»
//
// Da qui si ricavano data di nascita e numero paziente, che servono a
// riconoscere con certezza il paziente in cartella (nome + nascita) e a
// mostrare la scheda quando si apre un appuntamento. Logica pura e testata:
// il testo arriva già dalla piattaforma, qui non si legge nulla da fuori.

export type TitoloAgenda = {
  nome: string;         // quel che resta tolti nascita, numero e sigla
  nascita: string;      // «dd.mm.aaaa», vuoto se non c'è
  nPaziente: string;    // numero paziente di MediOnline, vuoto se non c'è
  sigla: string;        // sigla dell'agenda in coda dopo «·», vuota se non c'è
  durata: string;       // «(02:00)» dei blocchi, vuota per gli appuntamenti
  resto: string;        // la nota scritta dopo il nome («conf. paz il 14.10»), vuota se non c'è
};

const NASCITA = /\((\d{2}\.\d{2}\.\d{4})(?:\s*\/\s*N°?\s*(\d+))?\)/;
const SOLO_NUMERO = /\(\s*N°?\s*(\d+)\s*\)/;
const DURATA = /\((\d{1,2}:\d{2})\)/;

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', middot: '·', ndash: '–', mdash: '—', rsquo: '’' };
function decodificaEntita(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (x, c: string) => {
    if (c[0] === '#') { const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : Number(c.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : x; }
    return ENTITA[c.toLowerCase()] ?? x;
  });
}

export function leggiTitolo(titolo: string): TitoloAgenda {
  // Un'importazione del 15.9.2026 ha portato titoli coi caratteri in codice HTML («N&#176;» per «N°»): senza
  // decodificarli la data di nascita non si leggeva e la parentesi finiva nel nome (263 appuntamenti dell'8–14.9).
  let t = decodificaEntita(titolo ?? '').replace(/\s+/g, ' ').trim();
  const fuori: TitoloAgenda = { nome: '', nascita: '', nPaziente: '', sigla: '', durata: '', resto: '' };

  // La sigla dell'agenda sta in coda dopo l'ultimo «·».
  const punto = t.lastIndexOf('·');
  if (punto > 0) {
    const coda = t.slice(punto + 1).trim();
    // Una sigla è corta e senza spazi interni lunghi: «vpaio», «P-E V», «M.M.»
    if (coda && coda.length <= 12) {
      fuori.sigla = coda;
      t = t.slice(0, punto).trim();
    }
  }

  const m = NASCITA.exec(t);
  if (m) {
    fuori.nascita = m[1];
    if (m[2]) fuori.nPaziente = m[2];
    t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  } else {
    const n = SOLO_NUMERO.exec(t);
    if (n) {
      fuori.nPaziente = n[1];
      t = (t.slice(0, n.index) + ' ' + t.slice(n.index + n[0].length)).replace(/\s+/g, ' ').trim();
    }
    const d = DURATA.exec(t);
    if (d) {
      fuori.durata = d[1];
      t = (t.slice(0, d.index) + ' ' + t.slice(d.index + d[0].length)).replace(/\s+/g, ' ').trim();
    }
  }

  // I blocchi non di paziente cominciano con un trattino lungo o sono tutti
  // maiuscoli: restano com'erano, non sono nomi.
  fuori.nome = t.replace(/^[—–-]\s*/, '').trim();
  const [nome, nota] = nomeENota(fuori.nome);
  fuori.nome = nome; fuori.resto = nota;
  return fuori;
}

// Nella casella del nome la segreteria a volte aggiunge una nota (19.10.2026, dallo studio: «Rossi Anna conf. paz il
// 14.10» diventava una persona di nome «Anna Conf. Paz Il 14.10»). Se il titolo comincia con un nome scritto da nome —
// almeno due parole con l'iniziale maiuscola — il nome finisce alla prima parola che in un nome non può stare (cifre,
// punti, «·», «/», una minuscola che non sia una particella come «de» o «von»); il resto è la nota. Un titolo che non
// comincia così («in vacanza», «rossi anna») resta com'è.
const PAROLA_NOME = /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*$/;
const PARTICELLE = new Set(['de', 'di', 'da', 'del', 'della', 'dei', 'degli', 'dal', 'dalla', 'van', 'von', 'der', 'den', 'ten', 'ter', 'zu', 'le', 'la', 'du', 'des', 'dos', 'das', 'do', 'el', 'al', 'y', 'e', 'bin', 'ben']);
export function nomeENota(s: string): [string, string] {
  const p = (s ?? '').trim().split(/\s+/).filter(Boolean);
  const diNome = (i: number) => PAROLA_NOME.test(p[i] ?? '') || (PARTICELLE.has(p[i] ?? '') && PAROLA_NOME.test(p[i + 1] ?? ''));
  if (p.length < 3 || !PAROLA_NOME.test(p[0]) || !diNome(1)) return [p.join(' '), ''];
  let k = 2;
  while (k < p.length && diNome(k)) k++;
  return [p.slice(0, k).join(' '), p.slice(k).join(' ').replace(/^[·,;:\s-]+/, '')];
}

// MediOnline ripete spesso il cognome («Rossi Rossi Mario»): la ripetizione
// iniziale si toglie, il resto no — un doppio cognome vero non si perde.
export function nomePulito(nome: string): string {
  const p = (nome ?? '').trim().split(/\s+/);
  if (p.length >= 3 && p[0].toLowerCase() === p[1].toLowerCase()) return p.slice(1).join(' ');
  return p.join(' ');
}
