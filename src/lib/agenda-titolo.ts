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
  resto: string;        // quel che avanza e non si è saputo classificare
};

const NASCITA = /\((\d{2}\.\d{2}\.\d{4})(?:\s*\/\s*N°?\s*(\d+))?\)/;
const SOLO_NUMERO = /\(\s*N°?\s*(\d+)\s*\)/;
const DURATA = /\((\d{1,2}:\d{2})\)/;

export function leggiTitolo(titolo: string): TitoloAgenda {
  let t = (titolo ?? '').replace(/\s+/g, ' ').trim();
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
  return fuori;
}

// MediOnline ripete spesso il cognome («Rossi Rossi Mario»): la ripetizione
// iniziale si toglie, il resto no — un doppio cognome vero non si perde.
export function nomePulito(nome: string): string {
  const p = (nome ?? '').trim().split(/\s+/);
  if (p.length >= 3 && p[0].toLowerCase() === p[1].toLowerCase()) return p.slice(1).join(' ');
  return p.join(' ');
}
