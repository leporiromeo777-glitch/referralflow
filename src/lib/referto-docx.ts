import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';

// Referto in carta intestata: si parte dallo STAMPO Word dello studio
// (modelli/referto-carta-intestata.docx — derivato da una lettera vera
// anonimizzata: logo, intestazione, stili e piè di pagina sono i suoi) e si
// riempiono i segnaposto {{…}} con i dati della bozza. Il testo del referto
// (che di solito contiene già saluto, corpo e firma dettati) diventa i
// paragrafi del corpo, uno per riga, con la formattazione del paragrafo
// segnaposto. Percorso dello stampo personalizzabile con REFERTO_MODELLO_DOCX
// (in futuro: un modello per studio).

const PERCORSO_MODELLO =
  process.env.REFERTO_MODELLO_DOCX ||
  path.join(process.cwd(), 'modelli', 'referto-carta-intestata.docx');

const T_RUN = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
const PARAGRAFO = /<w:p[\s>][\s\S]*?<\/w:p>/g;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function riempiSegnaposto(xml: string, valori: Record<string, string>): string {
  return xml.replace(T_RUN, (intero, apre, corpo, chiude) => {
    if (!corpo.includes('{{')) return intero;
    const nuovo = corpo.replace(/\{\{(\w+)\}\}/g, (m: string, chiave: string) =>
      chiave in valori ? escapeXml(valori[chiave]) : m
    );
    return apre + nuovo + chiude;
  });
}

// Il paragrafo che contiene {{testo}} viene clonato: un paragrafo per ogni
// riga del referto (le righe vuote diventano paragrafi vuoti), tutti con la
// stessa formattazione del segnaposto.
function espandiTesto(xml: string, testo: string): string {
  return xml.replace(PARAGRAFO, (par) => {
    if (!par.includes('{{testo}}')) return par;
    const righe = testo.replace(/\r\n/g, '\n').split('\n');
    return righe
      .map((riga) =>
        par.replace(T_RUN, (intero, apre, corpo, chiude) => {
          if (!corpo.includes('{{testo}}')) return apre + chiude;
          const apre2 = apre.includes('xml:space')
            ? apre
            : apre.replace(/>$/, ' xml:space="preserve">');
          return apre2 + escapeXml(riga) + chiude;
        })
      )
      .join('');
  });
}

// Ricompone i ritorni a capo tecnici della trascrizione (whisper spezza una
// riga per segmento audio, anche a metà frase) in paragrafi ordinati: una
// riga che non finisce con un segno di fine frase scorre in quella dopo;
// le righe vuote e gli elenchi («- …», «1. …») restano confini veri.
export function ricomponiParagrafi(testo: string): string {
  const righe = testo.replace(/\r\n/g, '\n').split('\n');
  const fineFrase = /[.!?:;]["»)]?\s*$/;
  const vociElenco = /^\s*(?:[-•–]|\d{1,2}[.)])\s/;
  const salutoIniziale = /^\s*(?:car[oa]|gentile|egregi[oa]|spett)/i;
  const out: string[] = [];
  let corrente = '';
  const chiudi = () => { if (corrente) { out.push(corrente); corrente = ''; } };
  for (const grezza of righe) {
    const riga = grezza.trim();
    if (!riga) { chiudi(); out.push(''); continue; }
    const eElenco = vociElenco.test(riga);
    if (corrente && eElenco) chiudi();
    const eSaluto = !corrente && salutoIniziale.test(riga) && /,\s*$/.test(riga);
    corrente = corrente ? `${corrente} ${riga}` : riga;
    // Una voce d'elenco o il saluto («Caro collega,») chiudono la propria
    // riga anche senza punto finale.
    if (fineFrase.test(riga) || eElenco || eSaluto) chiudi();
  }
  chiudi();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type DatiReferto = {
  medico: string;
  telefono: string;
  destinatario: string;
  data: string;
  paziente: string;
  piede: string;
  testo: string;
};

export async function generaDocxReferto(dati: DatiReferto): Promise<Buffer> {
  const modello = await fs.readFile(PERCORSO_MODELLO);
  const zip = await JSZip.loadAsync(modello);
  const { testo, ...valori } = dati;
  for (const nome of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml', 'word/footer2.xml']) {
    const file = zip.files[nome];
    if (!file) continue;
    let xml = await file.async('string');
    xml = riempiSegnaposto(xml, valori);
    if (nome === 'word/document.xml') xml = espandiTesto(xml, testo);
    zip.file(nome, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
