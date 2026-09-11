// Banco di forma dell'impaginazione (12.9.2026): un dettato FINTO in stile
// Moccetti viene impaginato dal modello locale SENZA e CON la lettera tipo e
// le regole di forma della wiki (Agenti/Moccetti, compilate in medici.json).
// Ogni uscita è controllata contro dieci tratti della forma della segretaria
// (ricavati da 12 lettere anonimizzate) e contro le guardie di sempre.
// Nessun dato vero; gira in locale (Ollama). Uso: npm run banco-forma
import fs from 'fs';
import path from 'path';
import { riorganizzaReferto, type OpzioniLettera } from '../src/lib/referto-struttura';

const DETTATO = `Caro Dottor Bianchi, non ritorno sull'anamnesi del paziente in quanto già presente nei miei incarti precedenti. Rivedo in data 2 settembre 2026 il paziente a margine nell'ambito di un controllo annuale. Egli riferisce di stare bene e nega sintomatologia ascrivibile alla sfera cardiologica. Fattori di rischio cardiovascolare ipertensione arteriosa e dislipidemia. Comorbidità nessuna. Clinicamente mi confronto con un paziente di 78 chili per 175 centimetri, pressione 128 su 76, frequenza 64 battiti. Non vi sono segni per scompenso cardiaco. All'elettrocardiogramma ritmo sinusale regolare normocardico con PR nella norma e QRS fine, assenza di alterazioni specifiche della ripolarizzazione. All'ecocardiogramma la funzione sistolica globale è conservata con una frazione di eiezione del 60 per cento, non vizi valvolari significativi. In conclusione, alla luce degli elementi di cui sopra, propongo di continuare con la terapia in atto. Dal canto mio un prossimo controllo è da prevedersi non prima di dodici mesi, rimanendo a disposizione Tua e del paziente qualora la clinica richiedesse un controllo anticipato. A Te chiedo di ricontrollare periodicamente il profilo lipidico e l'evoluzione pressoria. Mandane una copia anche al paziente. Cordiali e collegiali saluti.`;

type Tratto = { nome: string; ok: (t: string) => boolean };
const TRATTI: Tratto[] = [
  { nome: 'saluto «Caro …,» in prima riga', ok: (t) => /^Car[oa]\s.+,\s*$/m.test(t.split('\n').find((r) => r.trim()) ?? '') },
  { nome: 'corpo riprende in minuscolo', ok: (t) => { const r = t.split('\n').map((x) => x.trim()).filter(Boolean); return !!r[1] && /^[a-zà-ù]/.test(r[1]); } },
  { nome: 'etichetta «FRCV:» a inizio riga', ok: (t) => /^FRCV:/m.test(t) },
  { nome: 'etichetta «Comorbidità:» a inizio riga', ok: (t) => /^Comorbidità:/m.test(t) },
  { nome: 'misure «78 Kg per 175 cm, PA 128/76 mmHg, FC 64 bpm»', ok: (t) => /78 Kg per 175 cm, PA 128\/76 mmHg, FC 64 bpm/.test(t) },
  { nome: 'etichetta «Elettrocardiogramma:»', ok: (t) => /^Elettrocardiogramma:/m.test(t) },
  { nome: 'FE in percentuale «FE 60%»', ok: (t) => /FE\s?60\s?%/.test(t) },
  { nome: 'data in cifre 02.09.2026', ok: (t) => /02\.09\.2026/.test(t) && !/settembre/.test(t) },
  { nome: 'conclusione «In conclusione, alla luce degli elementi di cui sopra,»', ok: (t) => /^In conclusione, alla luce degli elementi di cui sopra,/m.test(t) },
  { nome: 'niente istruzioni alla segreteria («copia») nel corpo', ok: (t) => !/copia anche al paziente/i.test(t) },
  { nome: 'paragrafi separati da righe vuote (≥ 4)', ok: (t) => (t.match(/\n\s*\n/g) ?? []).length >= 4 },
  { nome: 'chiusura esatta «Cordiali e collegiali saluti.»', ok: (t) => /^Cordiali e collegiali saluti\.$/m.test(t) },
];

async function corri(etichetta: string, opz: OpzioniLettera) {
  const t0 = Date.now();
  const esito = await riorganizzaReferto(DETTATO, undefined, 'lettera', opz);
  const s = Math.round((Date.now() - t0) / 1000);
  if (!esito.ok) { console.log(`\n${etichetta}: SCARTATA dalle guardie (${esito.motivo}) · ${s} s`); return 0; }
  const ok = TRATTI.filter((tr) => tr.ok(esito.testo));
  console.log(`\n${etichetta}: ${ok.length}/${TRATTI.length} tratti · ${s} s · parole aggiunte: ${(esito.aggiunte ?? []).length}`);
  for (const tr of TRATTI) console.log(`  ${tr.ok(esito.testo) ? 'OK ' : '...'} ${tr.nome}`);
  return ok.length;
}

async function main() {
  const medici = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'pipeline-referti', 'medici.json'), 'utf8'));
  const m = medici.medici.find((x: any) => x.id === 'moccetti');
  const base: OpzioniLettera = { chiusura: m.chiusura, firma: m.firma };
  const con: OpzioniLettera = { ...base, letteraTipo: m.lettera_tipo, regole: m.regole_forma };
  console.log(`modello: ${process.env.REFERTO_STRUTTURA_LLM ?? '(default)'} · tratti: ${TRATTI.length}`);
  const a = await corri('SENZA lettera tipo e regole', base);
  const b = await corri('CON lettera tipo e regole', con);
  console.log(`\nriepilogo: senza ${a}/${TRATTI.length} · con ${b}/${TRATTI.length}`);
}

main().then(() => process.exit(0), (e) => { console.error(String(e)); process.exit(1); });
