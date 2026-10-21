// Prova end-to-end della dettatura in tempo reale accanto alla registrazione (11.10.2026) sul DB DEMO, dati inventati:
// il testo scritto dal programma di dettatura viaggia con l'audio, resta accanto al dettato, e nel dettaglio della
// bozza esce a confronto con le parole che la catena ha ricavato dall'audio. Poi toglie tutto.
import { query, pool } from '../../src/lib/db';
import { deleteFile } from '../../src/lib/storage';
import { applicaFoglio } from '../../src/lib/dittafono-foglio';
import { togliAudit } from './pulizia-audit';

const [base, S, C] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
// Un secondo di silenzio, WAV mono 16 bit a 16 kHz.
function wav(): Buffer {
  const n = 16000 * 2, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}
async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  const fatti: string[] = [], bozze: string[] = [], pazienti: string[] = [];
  try {
    const medici = ((await (await fetch(`${base}/api/referti/upload`, { headers: { cookie: C } })).json()) as any).medici ?? [];
    const carica = async (cookie: string, campi: Record<string, string>) => {
      const fd = new FormData(); fd.append('audio', new Blob([wav()], { type: 'audio/wav' }), 'prova-dettato.wav'); fd.append('tipo', 'referto'); if (medici[0]) fd.append('medico', medici[0].id);
      for (const [k, v] of Object.entries(campi)) fd.append(k, v);
      const r = await fetch(`${base}/api/referti/upload`, { method: 'POST', headers: cookie ? { cookie } : {}, body: fd });
      const j = (await r.json().catch(() => ({}))) as any; if (j.id) fatti.push(j.id);
      // Fuori dalla coda subito: è un dettato di prova, nessuna catena deve prenderlo.
      if (j.id) await query(`update referti_audio set stato = 'fatto' where id = $1`, [j.id]);
      return { stato: r.status, id: j.id as string | undefined };
    };
    const dettato = 'Terapia: bisoprololo 5 mg al mattino. La paziente riferisce dolori toracici.';
    const a = await carica(C, { dettato_testo: dettato, dettato_tempi: JSON.stringify([[0.4, 20], [1.2, 38], ['x', 1], [2.5, dettato.length]]), dettato_fonte: 'Dragon!' });
    const [riga] = a.id ? await query<any>(`select dettato_testo, dettato_fonte, jsonb_array_length(dettato_tempi) as tempi from referti_audio where id = $1`, [a.id]) : [];
    verifica(a.stato === 201 && riga?.dettato_testo === dettato && riga?.dettato_fonte === 'dragon' && riga?.tempi === 3,
      `il testo dettato viaggia con l'audio e resta accanto al dettato, coi tempi validi (${a.stato}, fonte ${riga?.dettato_fonte}, ${riga?.tempi} tempi)`);
    const b = await carica(C, {}), fuori = await carica('', { dettato_testo: dettato });
    const [senza] = b.id ? await query<any>(`select dettato_testo, dettato_fonte from referti_audio where id = $1`, [b.id]) : [];
    verifica(b.stato === 201 && senza?.dettato_testo === null && senza?.dettato_fonte === null && fuori.stato === 401, `un dettato normale non ha testo accanto; senza sessione non si carica niente (${b.stato}, ${fuori.stato})`);

    // La bozza della catena (inventata): la parola «2,5» dove Dragon ha scritto «5», e un «non» che Dragon non ha.
    const mac = 'Terapia: bisoprololo 2,5 mg al mattino. La paziente non riferisce dolori toracici.'.split(' ').map((w, i) => [w, i * 0.5]);
    const nuova = async (audio: string | undefined) => {
      const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo) values ($1, 'prova-dettato-' || gen_random_uuid(), $2, 'referto') returning id`, [S, JSON.stringify({ testo_corretto: mac.map((x) => x[0]).join(' '), parole: mac })]);
      bozze.push(id); if (audio) await query(`update referti_audio set bozza_id = $2 where id = $1`, [audio, id]);
      return id;
    };
    const conDettato = await nuova(a.id), senzaDettato = await nuova(b.id);
    const d1 = ((await (await fetch(`${base}/api/prototipo/referti/${conDettato}`, { headers: { cookie: C } })).json()) as any).dettato;
    const d2 = ((await (await fetch(`${base}/api/prototipo/referti/${senzaDettato}`, { headers: { cookie: C } })).json()) as any).dettato;
    const diversi = (d1?.pezzi ?? []).filter((p: any) => !p.uguale);
    verifica(d1?.fonte === 'dragon' && d1?.punti === 2 && d1?.parole_dettato === 11 && d1?.uguali === 10 && diversi[0]?.t === '5' && diversi[0]?.mac === '2,5' && diversi[0]?.s === 1 && diversi[1]?.t === '' && diversi[1]?.mac === 'non' && d2 === null,
      `in revisione i due testi a confronto: due punti diversi (la dose, e un «non» che ha solo il Mac), ognuno col secondo da riascoltare; una bozza senza dettatura non ha il riquadro (${d1?.punti} punti)`);
    // Il foglio (12.10.2026): le parti già scritte, e la lettera del foglio che diventa il testo da rivedere.
    const fg = await fetch(`${base}/api/prototipo/dittafono/foglio?medico=${encodeURIComponent(medici[0]?.id ?? '')}`, { headers: { cookie: C } });
    const fj = (await fg.json().catch(() => ({}))) as any;
    const fgFuori = await fetch(`${base}/api/prototipo/dittafono/foglio`);
    verifica(fg.status === 200 && /^\d{2}\.\d{2}\.\d{4}$/.test(fj.data ?? '') && typeof fj.destinatario === 'string' && fj.destinatario.length > 5 && typeof fj.titolo === 'string' && ['lettera', 'rapporto'].includes(fj.formato) && fgFuori.status === 401,
      `il foglio si prepara dalla carta intestata: data di oggi, destinatario, titolo, formato del medico; senza sessione no (${fg.status}, ${fj.formato}, ${fgFuori.status})`);
    const foglio = { destinatario: 'Egregio Signor\nDr. med. Altro Inventato\nVia e-mail', data: fj.data, titolo: 'Visita', paziente: 'Paziente\nProva Anna – 03.04.1950', saluto: 'Caro collega,', chiusura: 'Con i migliori saluti\n\nDr. med. Inventato', copia: '' };
    const c = await carica(C, { dettato_testo: dettato, dettato_foglio: JSON.stringify(foglio), dettato_fonte: 'dragon' });
    const sulFoglio = await nuova(c.id);
    const fatto = await applicaFoglio(S, sulFoglio, c.id ?? null), nonFatto = await applicaFoglio(S, senzaDettato, b.id ?? null);
    const [bz] = await query<any>(`select testo_finale, payload->'foglio'->>'fonte' as fonte, payload->>'testo_corretto' as catena, campi_confermati->>'medico_destinatario' as dest, campi_confermati->>'nome_paziente' as paz, campi_confermati->>'data_nascita' as nascita from referti_bozze where id = $1`, [sulFoglio]);
    const d3 = ((await (await fetch(`${base}/api/prototipo/referti/${sulFoglio}`, { headers: { cookie: C } })).json()) as any);
    verifica(c.stato === 201 && fatto === true && nonFatto === false && bz?.testo_finale === `Caro collega,\n\n${dettato}\n\nCon i migliori saluti\n\nDr. med. Inventato` && bz?.fonte === 'dragon' && bz?.dest === 'Dr. med. Altro Inventato'
      && /bisoprololo 2,5 mg/.test(bz?.catena ?? '') && bz?.paz === 'Prova Anna' && bz?.nascita === '03.04.1950'      // il paziente del foglio va nei campi del Word, con la data di nascita (15.10.2026)
      && d3.dettato?.foglio === true && d3.versione?.dalla_catena === false && d3.testo_attuale === bz?.testo_finale,      // la revisione semplice (15.10.2026) parte da questo testo
      `la lettera dettata sul foglio diventa il testo da rivedere (saluto, corpo, saluti e firma), col destinatario fra i campi; il testo della catena resta come controllo; un dettato senza foglio non cambia (${fatto}, ${nonFatto})`);

    // I comandi a voce (12.10.2026): «per favore, inserisci la lettera più recente» — il server dà il corpo della
    // lettera più recente del paziente scelto, e la terapia dal suo blocco.
    const [{ id: paz }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita) values ($1, 'Comandoprova', 'Anna', '1950-04-03') returning id`, [S]); pazienti.push(paz);
    const [{ id: vuoto }] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome) values ($1, 'Comandoprova', 'Senzalettere') returning id`, [S]); pazienti.push(vuoto);
    const lettera = (quando: string, corpo: string) => `Caro collega,\n\n${corpo} ${'Il decorso inventato prosegue senza novità di rilievo. '.repeat(4)}${quando === 'nuova' ? '' : '\n\nFRCV: ipertensione inventata.\n\nComorbidità: nessuna di rilievo.'}\n\nTerapia:\nFarmacoA ${quando === 'nuova' ? '10' : '5'} mg 1-0-0\nFarmacoB 5 mg 0-0-1\n\nIn conclusione quadro stabile.\n\nRimanendo a disposizione, porgo cordiali saluti.\n\nDr. med. Inventato`;
    for (const [quando, giorno] of [['vecchia', '2026-01-10'], ['nuova', '2026-06-20']] as const) {
      // il nome nei campi è scritto diverso apposta: la lettera si trova dal legame col paziente
      const [{ id }] = await query<{ id: string }>(`insert into referti_bozze (studio_id, file_id, payload, tipo, stato, testo_finale, reviewed_at, patient_id, campi_confermati) values ($1, 'prova-comando-' || gen_random_uuid(), $2, 'referto', 'confermata', $3, now(), $4, $5) returning id`,
        [S, JSON.stringify({ dettato_il: `${giorno}T09:00:00Z` }), lettera(quando, `ho rivisto la paziente inventata, visita ${quando}.`), paz, JSON.stringify({ nome_paziente: 'Sig.ra A. Comandoprova' })]);
      bozze.push(id);
    }
    const comando = async (corpo: unknown, cookie = C) => { const r = await fetch(`${base}/api/prototipo/dittafono/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(corpo) }); return { stato: r.status, j: (await r.json().catch(() => ({}))) as any }; };
    const k1 = await comando({ comando: 'lettera_recente', paziente: paz }), k2 = await comando({ comando: 'parti', parti: ['terapia'], paziente: paz });
    verifica(k1.stato === 200 && k1.j.testo.startsWith('ho rivisto la paziente inventata, visita nuova.') && k1.j.testo.endsWith('In conclusione quadro stabile.') && !/Caro collega|cordiali saluti|Dr\. med\./.test(k1.j.testo) && k1.j.data === '20.06.2026'
      && k2.stato === 200 && k2.j.testo === 'Terapia:\nFarmacoA 10 mg 1-0-0\nFarmacoB 5 mg 0-0-1'
      // la lettera di provenienza, da aprire accanto al foglio: qui un referto della piattaforma, quindi il suo testo intero
      && k1.j.apri?.tipo === 'referto' && k1.j.apri?.pdf === false && k1.j.apri?.docx === true && k1.j.saluto === 'Caro collega,' && !k2.j.saluto && k1.j.apri?.testo.startsWith('Caro collega,') && /cordiali saluti/.test(k1.j.apri?.testo ?? ''),
      `«inserisci la lettera più recente»: arriva il corpo della più recente (senza saluto, saluti e firma), trovata dal legame col paziente; «la terapia»: il suo blocco (${k1.stato}, ${k1.j.data}, ${k2.stato})`);
    // Le frecce fra le lettere (21.10.2026): l'elenco in ordine di data dalla più recente, e una lettera per posizione.
    const kl = await comando({ comando: 'lettere', paziente: paz }), ka = await comando({ comando: 'apri_lettera', paziente: paz, indice: 1 }), kz = await comando({ comando: 'apri_lettera', paziente: paz, indice: 2 });
    verifica(kl.stato === 200 && kl.j.lettere?.length === 2 && kl.j.lettere[0].data === '20.06.2026' && kl.j.lettere[1].data === '10.01.2026' && !('testo' in kl.j.lettere[0])
      && k1.j.indice === 0 && k1.j.totale === 2 && ka.stato === 200 && ka.j.indice === 1 && ka.j.totale === 2 && ka.j.data === '10.01.2026' && /visita vecchia/.test(ka.j.apri?.testo ?? '') && kz.stato === 404,
      `frecce: le lettere in ordine di data (${kl.j.lettere?.map((x: any) => x.data).join(', ')}), la seconda si apre, oltre l'ultima no (${kz.stato})`);
    // La lettera vera accanto al foglio (15.10.2026): il Word con la carta intestata, in anteprima — non conta come scaricato.
    const wPrima = await query<{ n: number }>(`select count(*)::int as n from referti_eventi where bozza_id = $1 and azione = 'word_scaricato'`, [k1.j.apri?.id]).catch(() => [{ n: -1 }]);
    const w = await fetch(`${base}/api/referti/docx/${k1.j.apri?.id}?anteprima=1`, { headers: { cookie: C } }), wb = Buffer.from(await w.arrayBuffer());
    const wDopo = await query<{ n: number }>(`select count(*)::int as n from referti_eventi where bozza_id = $1 and azione = 'word_scaricato'`, [k1.j.apri?.id]).catch(() => [{ n: -2 }]);
    const wFuori = await fetch(`${base}/api/referti/docx/${k1.j.apri?.id}?anteprima=1`);
    verifica(w.status === 200 && wb.subarray(0, 2).toString() === 'PK' && /inline/.test(w.headers.get('content-disposition') ?? '') && wPrima[0].n === wDopo[0].n && wFuori.status === 401,
      `la lettera vera da aprire accanto: il Word con la carta intestata, mostrato e non scaricato (nessun evento «word_scaricato»); senza sessione no (${w.status}, ${wPrima[0].n}→${wDopo[0].n}, ${wFuori.status})`);
    // Solo una parte: l'anamnesi e la conclusione dalla più recente; FRCV e comorbidità, che la più recente non ha,
    // dalla lettera prima — tutte dalla stessa lettera, e ciò che lì manca viene detto.
    const p1 = await comando({ comando: 'parti', parti: ['anamnesi', 'conclusione', 'allergie'], paziente: paz }), p2 = await comando({ comando: 'parti', parti: ['frcv', 'comorbidita'], paziente: paz });
    const p3 = await comando({ comando: 'parti', parti: ['holter'], paziente: paz }), p4 = await comando({ comando: 'parti', parti: ['inventata'], paziente: paz });
    verifica(p1.stato === 200 && p1.j.testo.startsWith('ho rivisto la paziente inventata, visita nuova.') && p1.j.testo.endsWith('\n\nIn conclusione quadro stabile.') && !/Terapia|FarmacoA/.test(p1.j.testo) && p1.j.cosa === 'anamnesi, conclusione' && p1.j.mancanti?.join() === 'allergie' && p1.j.data === '20.06.2026'
      && p2.stato === 200 && p2.j.testo === 'FRCV: ipertensione inventata.\n\nComorbidità: nessuna di rilievo.' && p2.j.data === '10.01.2026' && p3.stato === 404 && !p3.j.testo && p4.stato === 400,
      `solo una parte: anamnesi e conclusione dalla più recente, senza il resto, e la parte che lì manca viene detta; FRCV e comorbidità dalla lettera che le ha; una parte che non c'è in nessuna dà un avviso; una parte non prevista è rifiutata (${p1.stato}, ${p1.j.cosa}, ${p2.j.data}, ${p3.stato}, ${p4.stato})`);
    // «Riprendimi la lettera fino a…» (15.10.2026): dall'inizio fino alla parte, compresa o no; dalla lettera che quella parte ce l'ha.
    const f1 = await comando({ comando: 'fino', parti: ['terapia'], paziente: paz }), f2 = await comando({ comando: 'fino', parti: ['comorbidita'], paziente: paz });
    const f3 = await comando({ comando: 'fino', parti: ['conclusione'], esclusa: true, paziente: paz }), f4 = await comando({ comando: 'fino', parti: [], paziente: paz });
    verifica(f1.stato === 200 && f1.j.testo.startsWith('ho rivisto la paziente inventata, visita nuova.') && f1.j.testo.endsWith('FarmacoB 5 mg 0-0-1') && !/conclusione/i.test(f1.j.testo) && f1.j.data === '20.06.2026'
      && f2.stato === 404 && /lettera più recente \(20\.06\.2026\) comorbidità non è una parte a sé/.test(f2.j.errore ?? '')
      && f3.stato === 200 && f3.j.testo.endsWith('FarmacoB 5 mg 0-0-1') && /a prima di conclusione/.test(f3.j.cosa) && f4.stato === 400,
      `«fino a»: la lettera più recente dall'inizio fino alla terapia compresa, fino a prima della conclusione; una parte che la più recente non ha viene detta con la data (non si prende una lettera più vecchia); senza parte è rifiutato (${f1.stato}, ${f2.stato}, ${f3.stato}, ${f4.stato})`);
    // «Detto la lettera all'indirizzo del dottor … per il paziente …» (15.10.2026): medico dalla rubrica, paziente dalla cartella, anche storpiati.
    const [{ id: inv }] = await query<{ id: string }>(`insert into referring_doctors (studio_id, nome, specialita, email) values ($1, 'Indirizzoprova Luca', 'Medicina interna', 'luca@example.org') returning id`, [S]);
    try {
      const i1 = await comando({ comando: 'indirizzo', medico_nome: 'Indirizzoprovva', paziente_nome: 'Anna Comandoprova', nascita: '03.04.1950', donna: false });
      const i2 = await comando({ comando: 'indirizzo', medico_nome: 'Nessunoinventato', paziente_nome: 'Comandoprova', donna: true });
      const i3 = await comando({ comando: 'indirizzo', medico_nome: 'Indirizzoprova' }, '');
      verifica(i1.stato === 200 && i1.j.medico?.stato === 'trovato' && /Indirizzoprova Luca/.test(i1.j.medico?.scelta?.destinatario ?? '')
        && i1.j.paziente?.stato === 'trovato' && i1.j.paziente?.scelta?.id === paz && i1.j.paziente?.scelta?.nascita === '03.04.1950'
        && i2.j.medico?.stato === 'nessuno' && i2.j.paziente?.stato === 'scegli' && (i2.j.paziente?.alternative ?? []).length === 2 && i3.stato === 401,
        `detto la lettera all'indirizzo di…: medico trovato nella rubrica anche storpiato, col destinatario pronto; paziente trovato con la data di nascita; un medico che non c'è viene detto; due pazienti con lo stesso cognome si propongono; senza sessione no (${i1.j.medico?.stato}, ${i1.j.paziente?.stato}, ${i2.j.medico?.stato}, ${i2.j.paziente?.stato}, ${i3.stato})`);
    } finally { await query(`delete from referring_doctors where id = $1`, [inv]); }
    const k3 = await comando({ comando: 'lettera_recente', paziente: vuoto }), k4 = await comando({ comando: 'cancella_tutto', paziente: paz }), k5 = await comando({ comando: 'lettera_recente', paziente: 'x' }), k6 = await comando({ comando: 'lettera_recente', paziente: paz }, '');
    verifica(k3.stato === 404 && typeof k3.j.errore === 'string' && !k3.j.testo && k4.stato === 400 && k5.stato === 400 && k6.stato === 401,
      `un paziente senza lettere dà un avviso e niente testo; un comando non previsto, un paziente non scelto e una richiesta senza sessione sono rifiutati (${k3.stato}, ${k4.stato}, ${k5.stato}, ${k6.stato})`);

    // Il microfono di ogni medico (20.10.2026): tasto, microfono e Dragon salvati per profilo, solo i campi mandati cambiano.
    const disp = async (corpo: unknown, cookie = C) => { const r = await fetch(`${base}/api/prototipo/dittafono/dispositivi`, corpo === undefined ? { headers: cookie ? { cookie } : {} } : { method: 'POST', headers: { ...(cookie ? { cookie } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, j: (await r.json().catch(() => ({}))) as any }; };
    try {
      const tasto = { tipo: 'hid', vid: 0x0911, pid: 0x0c1c, rid: 0, i: 2, maschera: 4, premuto: 4, tipo0: 0x80, nome: 'SpeechMike di prova' };
      const d1 = await disp({ medico: 'prova-dispositivi', tasto, microfono: 'SpeechMike III (prova)', dettatura: true });
      const d2 = await disp({ medico: 'prova-dispositivi', microfono: 'Microfono di prova 2' });
      const g = await disp(undefined), pr = g.j.profili?.['prova-dispositivi'];
      verifica(d1.stato === 200 && d2.stato === 200 && pr?.tasto?.vid === 0x0911 && pr.tasto.tipo0 === 0x80 && pr.microfono === 'Microfono di prova 2' && pr.dettatura === true,
        `dispositivi del medico: salvati tasto, microfono e Dragon; cambiando solo il microfono il tasto resta (${d1.stato}, ${d2.stato}, ${JSON.stringify(pr)})`);
      const d3 = await disp({ medico: 'prova-dispositivi', tasto: null }), pr3 = (await disp(undefined)).j.profili?.['prova-dispositivi'];
      verifica(d3.stato === 200 && pr3?.tasto === null && pr3.microfono === 'Microfono di prova 2', 'dispositivi del medico: tasto scollegato, il microfono resta');
      const e1 = await disp({ medico: 'prova-dispositivi', tasto: { tipo: 'hid', vid: 1 } }), e2 = await disp({ medico: 'Non valido!', dettatura: true }), e3 = await disp({ medico: 'prova-dispositivi', tasto: { tipo: 'tasto', code: '<script>' } }), e4 = await disp(undefined, ''), e5 = await disp({ medico: 'prova-dispositivi', dettatura: true }, '');
      verifica(e1.stato === 400 && e2.stato === 400 && e3.stato === 400 && e4.stato === 401 && e5.stato === 401, `dispositivi del medico: tasto o medico non validi rifiutati, senza sessione no (${e1.stato}, ${e2.stato}, ${e3.stato}, ${e4.stato}, ${e5.stato})`);
    } finally { await query(`delete from dittafono_dispositivi where studio_id = $1 and medico = 'prova-dispositivi'`, [S]); }
  } finally {
    const chiavi = fatti.length ? await query<{ storage_key: string }>(`select storage_key from referti_audio where id = any($1::uuid[])`, [fatti]) : [];
    if (fatti.length) await query(`delete from referti_audio where id = any($1::uuid[])`, [fatti]);
    // le lettere «subito» (19.10.2026) nate dagli invii di prova col foglio
    if (fatti.length) for (const { id } of await query<{ id: string }>(`select id from referti_bozze where file_id = any($1::text[])`, [fatti.map((f) => `foglio-${f}`)])) bozze.push(id);
    if (bozze.length) await togliAudit(bozze).catch(() => null);
    if (bozze.length) await query(`delete from referti_eventi where bozza_id = any($1::uuid[])`, [bozze]).catch(() => null);
    if (bozze.length) await query(`delete from referti_bozze where id = any($1::uuid[])`, [bozze]);
    if (pazienti.length) await query(`delete from patients where id = any($1::uuid[])`, [pazienti]);
    for (const c of chiavi) await deleteFile(c.storage_key).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
