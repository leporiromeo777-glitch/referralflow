import 'server-only';

import JSZip from 'jszip';
import { applicaPiano, type Piano } from './anonimizza';

// Riscrive un .docx SOSTITUENDO solo i dati identificativi, dentro il
// documento originale: logo, intestazione, data, tabelle e impaginazione
// restano quelli. Un .docx è un pacchetto zip di XML: si toccano solo i
// nodi di testo (<w:t>) del corpo, delle intestazioni e dei piè di pagina.
//
// Due livelli, dal meno invasivo al più invasivo:
// 1. dentro ogni singolo <w:t> (il nome sta in un run solo: caso comune) —
//    la formattazione non cambia di una virgola;
// 2. se un nome è SPEZZATO su più run (Word lo fa, per esempio dopo una
//    correzione), si lavora sul paragrafo intero: tutto il testo del
//    paragrafo finisce nel primo run e gli altri si svuotano. Solo per i
//    paragrafi dove una sostituzione è davvero scattata: gli altri non
//    vengono nemmeno sfiorati.

const XML_DA_TRATTARE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function conSpaziPreservati(tagApertura: string): string {
  return tagApertura.includes('xml:space')
    ? tagApertura
    : tagApertura.replace(/>$/, ' xml:space="preserve">');
}

const RUN_TESTO = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;

function sostituisciInXml(xml: string, piano: Piano): string {
  // Livello 1: run per run.
  xml = xml.replace(RUN_TESTO, (intero, apre, corpo, chiude) => {
    const [nuovo, effettive] = applicaPiano(unescapeXml(corpo), piano);
    if (effettive.length === 0) return intero;
    return conSpaziPreservati(apre) + escapeXml(nuovo) + chiude;
  });

  // Livello 2: paragrafo per paragrafo, solo se il testo unito dei run
  // contiene ancora qualcosa da sostituire (nome spezzato tra i run).
  xml = xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, (paragrafo) => {
    const pezzi: string[] = [];
    paragrafo.replace(RUN_TESTO, (m, _a, corpo) => {
      pezzi.push(unescapeXml(corpo));
      return m;
    });
    if (pezzi.length < 2) return paragrafo;
    const unito = pezzi.join('');
    const [nuovo, effettive] = applicaPiano(unito, piano);
    if (effettive.length === 0) return paragrafo;
    let primo = true;
    return paragrafo.replace(RUN_TESTO, (m, apre, _corpo, chiude) => {
      if (primo) {
        primo = false;
        return conSpaziPreservati(apre) + escapeXml(nuovo) + chiude;
      }
      return apre + chiude;
    });
  });

  return xml;
}

export async function anonimizzaDocx(originale: Buffer, piano: Piano): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originale);
  for (const nome of Object.keys(zip.files)) {
    if (!XML_DA_TRATTARE.test(nome)) continue;
    const xml = await zip.files[nome].async('string');
    const nuovo = sostituisciInXml(xml, piano);
    if (nuovo !== xml) zip.file(nome, nuovo);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
