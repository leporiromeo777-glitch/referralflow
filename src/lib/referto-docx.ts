import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';

// Referto in carta intestata: si parte dallo STAMPO Word dello studio
// (modelli/referto-carta-intestata.docx — derivato da una lettera vera
// anonimizzata: logo, stili e piè di pagina sono i suoi) e si riempiono i
// segnaposto {{…}} con i dati della bozza. Dal 2026-09-07 anche
// l'intestazione e le righe fisse sono segnaposto, così la carta segue il
// MEDICO che ha dettato (nome, righe sotto il nome, titolo, riga «Copia»):
//   header: {{int_nome}} (riga del nome), {{intestazione}} (una riga per
//           ogni voce del profilo)
//   corpo:  {{destinatario}} (più righe), {{via}}, Lugano, {{data}},
//           {{titolo}}, {{paziente}}, {{testo}} (un paragrafo per riga),
//           {{copia}}
//   piè:    {{piede}}
// Percorso dello stampo personalizzabile con REFERTO_MODELLO_DOCX.

const PERCORSO_MODELLO =
  process.env.REFERTO_MODELLO_DOCX ||
  path.join(process.cwd(), 'modelli', 'referto-carta-intestata.docx');

const T_RUN = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
const PARAGRAFO = /<w:p[\s>][\s\S]*?<\/w:p>/g;

// Segnaposto che possono valere PIÙ righe (un paragrafo clonato per riga)
// e che, se vuoti, fanno sparire il loro paragrafo.
const MULTIRIGA = new Set(['testo', 'destinatario', 'intestazione', 'via', 'copia', 'titolo']);

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function riempiSegnaposto(xml: string, valori: Record<string, string>): string {
  return xml.replace(T_RUN, (intero, apre, corpo, chiude) => {
    if (!corpo.includes('{{')) return intero;
    const nuovo = corpo.replace(/\{\{(\w+)\}\}/g, (m: string, chiave: string) =>
      chiave in valori && !MULTIRIGA.has(chiave) ? escapeXml(valori[chiave]) : m
    );
    return apre + nuovo + chiude;
  });
}

// Il paragrafo che contiene {{chiave}} viene clonato: un paragrafo per ogni
// riga del valore (le righe vuote diventano paragrafi vuoti), tutti con la
// stessa formattazione del segnaposto. Valore vuoto = paragrafo tolto.
function espandi(xml: string, chiave: string, valore: string): string {
  const segnaposto = `{{${chiave}}}`;
  return xml.replace(PARAGRAFO, (par) => {
    if (!par.includes(segnaposto)) return par;
    const pulito = valore.replace(/\r\n/g, '\n');
    if (!pulito.trim()) return '';
    const righe = pulito.split('\n');
    return righe
      .map((riga) =>
        par.replace(T_RUN, (intero, apre, corpo, chiude) => {
          if (!corpo.includes(segnaposto)) return apre + chiude;
          const apre2 = apre.includes('xml:space')
            ? apre
            : apre.replace(/>$/, ' xml:space="preserve">');
          return apre2 + escapeXml(corpo.replace(segnaposto, riga)) + chiude;
        })
      )
      .join('');
  });
}

// Ricompone i ritorni a capo tecnici della trascrizione (whisper spezza una
// riga per segmento audio, anche a metà frase) in paragrafi ordinati: una
// riga che non finisce con un segno di fine frase scorre in quella dopo;
// una riga vuota, un titolo di sezione (riga corta senza punto finale
// seguita da testo) o una voce di elenco chiudono il paragrafo.
export function ricomponiParagrafi(testo: string): string {
  const righe = testo.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let buf = '';
  const chiudi = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = '';
  };
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i].trim();
    if (!r) {
      chiudi();
      out.push('');
      continue;
    }
    const elenco = /^([-•*]|\d{1,2}[.)])\s/.test(r);
    // Saluto d'apertura di una lettera («Caro collega,», «Gentile Dottoressa Rossi,»):
    // resta sulla sua riga, non scorre nel corpo (visto dal vivo 2026-09-07).
    if (/^(car[oaie]|gentil[ei]|egregi[oaie]|stimat[oaie]|spett\.?)\b.*,$/i.test(r) && r.length <= 80) {
      chiudi();
      out.push(r);
      continue;
    }
    const titolo = r.length <= 40 && !/[.:;,!?]$/.test(r) && /^[A-ZÀ-Ý]/.test(r)
      && i + 1 < righe.length && righe[i + 1].trim() !== '' && !buf;
    if (elenco || titolo) {
      chiudi();
      out.push(r);
      continue;
    }
    buf = buf ? `${buf} ${r}` : r;
    if (/[.!?»)]$/.test(r) || /:$/.test(r)) chiudi();
  }
  chiudi();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type DatiReferto = {
  medico: string;            // {{int_nome}}: riga del nome in intestazione
  intestazione: string;      // righe sotto il nome (separate da \n; vuoto = nessuna)
  telefono: string;          // segnaposto storico {{telefono}} (se ancora nello stampo)
  destinatario: string;      // una o più righe
  via: string;               // «Via email» (vuoto = riga tolta)
  data: string;              // dopo «Lugano, »
  titolo: string;            // riga del titolo (vuoto = riga tolta)
  paziente: string;
  piede: string;
  testo: string;
  copia: string;             // riga finale «Copia: …» (vuoto = riga tolta)
};

export async function generaDocxReferto(dati: DatiReferto): Promise<Buffer> {
  const modello = await fs.readFile(PERCORSO_MODELLO);
  const zip = await JSZip.loadAsync(modello);
  const valori: Record<string, string> = {
    int_nome: dati.medico,
    medico: dati.medico,
    telefono: dati.telefono,
    data: dati.data,
    paziente: dati.paziente,
    piede: dati.piede,
  };
  const multiriga: Record<string, string> = {
    intestazione: dati.intestazione,
    destinatario: dati.destinatario,
    via: dati.via,
    titolo: dati.titolo,
    testo: dati.testo,
    copia: dati.copia,
  };
  for (const nome of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml', 'word/footer2.xml']) {
    const file = zip.files[nome];
    if (!file) continue;
    let xml = await file.async('string');
    for (const [chiave, valore] of Object.entries(multiriga)) xml = espandi(xml, chiave, valore);
    xml = riempiSegnaposto(xml, valori);
    zip.file(nome, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
