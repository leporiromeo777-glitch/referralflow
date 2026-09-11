// Terapia della lettera, «secondo tempo» (11.9.2026): il medico spesso NON
// ridetta tutta la terapia ma solo le modifiche («sospendo il Valsartan,
// aumento il Concor a 5 mg», «terapia invariata, aggiungo Ezetimibe»). La
// catena estrae le voci dettate con lo stato (tappa «terapia»); qui il
// CODICE le fonde con il blocco «Terapia:» dell'ultima lettera confermata
// del paziente, riga per riga, dicendo da dove viene ogni riga. Niente AI,
// tutto deterministico e testabile (npm run test:app). Mai contenuti nei log.

export type VoceTerapia = { nome?: string; dose?: string; posologia?: string; stato?: string; nota?: string };
export type TerapiaDettata = { righe?: unknown; voci?: unknown; sospesi?: unknown; dubbi?: unknown } | null | undefined;
export type FonteRiga = 'precedente' | 'dettato' | 'modificata' | 'nuova';
export type RigaTerapia = { riga: string; fonte: FonteRiga };
export type TerapiaFusa = {
  // 'dettato' = il dettato porta la terapia intera (vince lui);
  // 'fusione' = lettera precedente + modifiche dettate;
  // 'precedente' = niente dettato sulla terapia, si riprende la precedente;
  // 'nessuna' = niente da mettere.
  modo: 'dettato' | 'fusione' | 'precedente' | 'nessuna';
  righe: RigaTerapia[];
  sospese: string[];
  avvisi: string[];
};

// Il dettato dice che la terapia resta com'era? (Anche «invariata salvo…»:
// le modifiche arrivano dalle voci estratte.)
export function terapiaInvariata(testo: string): boolean {
  return /terapia[^.\n]{0,40}(rimane|resta|è|e')\s+invariata|terapia\s+invariata|senza modifiche (alla|della) terapia/i.test(testo);
}

// Il dettato contiene già una terapia (farmaci con dosaggio)? Se no, la
// lettera riprende quella della lettera precedente (prassi della segretaria:
// ogni lettera porta la terapia in corso, anche se il medico non la ridetta).
export function dettatoConTerapia(testo: string): boolean {
  return /^\s*terapia\s*:?\s*$/im.test(testo) || (testo.match(/\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ml|ui)\b/gi) ?? []).length >= 2;
}

// Unità dettate a parole → sigle della lettera (12.9.2026, dal banco di
// forma): «78 chili per 175 centimetri, pressione 128 su 76, frequenza 64
// battiti, frazione di eiezione del 60 per cento» → «78 Kg per 175 cm,
// pressione 128/76 mmHg, frequenza 64 bpm, frazione di eiezione del 60%».
// Va fatto dal CODICE prima del modello: la guardia sui numeri confronta
// numero+unità, e il modello che scrive «Kg» come la segretaria veniva
// scartato. Solo forme inequivocabili; il numero non cambia mai.
export function unitaInSigle(testo: string): string {
  return testo
    .replace(/(\d+(?:[.,]\d+)?)\s+chil[io](?:grammi)?\b/gi, '$1 Kg')
    .replace(/(\d+(?:[.,]\d+)?)\s+centimetri\b/gi, '$1 cm')
    .replace(/(\d+(?:[.,]\d+)?)\s+millimetri di mercurio\b/gi, '$1 mmHg')
    .replace(/(\d+(?:[.,]\d+)?)\s+milligrammi\b/gi, '$1 mg')
    .replace(/(\d+(?:[.,]\d+)?)\s+microgrammi\b/gi, '$1 mcg')
    .replace(/(\d+(?:[.,]\d+)?)\s+per\s?cento\b/gi, '$1%')
    .replace(/(\d+(?:[.,]\d+)?)\s+battiti(?:\s+al\s+minuto)?\b/gi, '$1 bpm')
    .replace(/(\bpression[ei](?:\s+arteriosa)?(?:\s+\w+){0,3}?\s+)(\d{2,3})\s+su\s+(\d{2,3})\b(?!\s*mmHg)/gi, '$1$2/$3 mmHg');
}

// La chiave di una riga o di un nome: la prima parola in maiuscolo senza
// accenti. «ASPIRIN CARDIO 100 mg 1-0-0-0» → ASPIRIN; «Aspirina Cardio» →
// ASPIRINA. Due chiavi combaciano se uguali o se condividono le prime sei
// lettere (ASPIRIN/ASPIRINA, XARELTO/XARELTO): i nomi dettati e quelli
// scritti dalla segretaria non coincidono sempre alla lettera.
export function chiaveFarmaco(s: string): string {
  const prima = String(s ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/)[0] ?? '';
  return prima.replace(/[^A-Z]/g, '');
}

export function stessoFarmaco(a: string, b: string): boolean {
  const ka = chiaveFarmaco(a); const kb = chiaveFarmaco(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const n = Math.min(6, ka.length, kb.length);
  return n >= 5 && ka.slice(0, n) === kb.slice(0, n);
}

const stringhe = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, max)) : [];

export function fondiTerapia(precedenti: string[], terapia: TerapiaDettata, testo: string): TerapiaFusa {
  const prev = stringhe(precedenti).slice(0, 30);
  const righeDettate = stringhe(terapia?.righe).slice(0, 15);
  const voci = Array.isArray(terapia?.voci) ? (terapia!.voci as unknown[]).filter((v): v is VoceTerapia => !!v && typeof v === 'object') : [];
  const sospesi = stringhe(terapia?.sospesi, 80);
  const avvisi: string[] = [];

  // Le righe e le voci della catena nascono in parallelo (stessa iterazione):
  // la voce k spiega la riga k. Se non tornano, si guarda solo alle righe.
  const statoDi = (k: number): string => (voci.length === righeDettate.length ? String(voci[k]?.stato ?? '').toLowerCase() : '');

  if (!prev.length) {
    if (!righeDettate.length) return { modo: 'nessuna', righe: [], sospese: [], avvisi: sospesi.length ? ['Sospensioni dettate senza una lettera precedente da cui toglierle: ' + sospesi.join(', ')] : [] };
    return { modo: 'dettato', righe: righeDettate.map((riga) => ({ riga, fonte: 'dettato' as const })), sospese: [], avvisi };
  }
  if (!righeDettate.length && !sospesi.length) {
    // Niente dettato sulla terapia: la precedente (regola già in uso).
    return { modo: 'precedente', righe: prev.map((riga) => ({ riga, fonte: 'precedente' as const })), sospese: [], avvisi };
  }

  const dettaIntera = !terapiaInvariata(testo)
    && righeDettate.length > 0
    && righeDettate.every((_r, k) => statoDi(k) === 'in corso' || statoDi(k) === '')
    && !sospesi.length;
  if (dettaIntera) {
    // Il medico ha ridettato la terapia: comanda lui. I farmaci della lettera
    // precedente che non ha nominato vanno detti a chi rivede, non rimessi.
    const nonNominati = prev.filter((r) => !righeDettate.some((d) => stessoFarmaco(d, r))).map((r) => chiaveFarmaco(r));
    if (nonNominati.length) avvisi.push('Nella lettera precedente c’era anche: ' + nonNominati.join(', ') + ' (non dettato: sospeso o dimenticato?)');
    return { modo: 'dettato', righe: righeDettate.map((riga) => ({ riga, fonte: 'dettato' as const })), sospese: [], avvisi };
  }

  // Fusione: precedente + modifiche.
  const righe: RigaTerapia[] = [];
  const sospese: string[] = [];
  const usate = new Set<number>();
  for (const r of prev) {
    if (sospesi.some((s) => stessoFarmaco(s, r))) { sospese.push(r); continue; }
    const k = righeDettate.findIndex((d, i) => !usate.has(i) && stessoFarmaco(d, r));
    if (k === -1) { righe.push({ riga: r, fonte: 'precedente' }); continue; }
    usate.add(k);
    const st = statoDi(k);
    righe.push({ riga: righeDettate[k], fonte: st === 'modificato' || righeDettate[k].toLowerCase() !== r.toLowerCase() ? 'modificata' : 'dettato' });
  }
  righeDettate.forEach((d, i) => { if (!usate.has(i)) righe.push({ riga: d, fonte: 'nuova' }); });
  for (const s of sospesi) {
    if (!prev.some((r) => stessoFarmaco(s, r))) avvisi.push(`«${s}» è dettato come sospeso ma nella lettera precedente non c’era.`);
  }
  return { modo: 'fusione', righe: righe.slice(0, 30), sospese, avvisi };
}
