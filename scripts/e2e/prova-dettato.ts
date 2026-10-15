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
    const [bz] = await query<any>(`select testo_finale, payload->'foglio'->>'fonte' as fonte, payload->>'testo_corretto' as catena, campi_confermati->>'medico_destinatario' as dest from referti_bozze where id = $1`, [sulFoglio]);
    const d3 = ((await (await fetch(`${base}/api/prototipo/referti/${sulFoglio}`, { headers: { cookie: C } })).json()) as any);
    verifica(c.stato === 201 && fatto === true && nonFatto === false && bz?.testo_finale === `Caro collega,\n\n${dettato}\n\nCon i migliori saluti\n\nDr. med. Inventato` && bz?.fonte === 'dragon' && bz?.dest === 'Dr. med. Altro Inventato'
      && /bisoprololo 2,5 mg/.test(bz?.catena ?? '') && d3.dettato?.foglio === true && d3.versione?.dalla_catena === false,
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
      && k1.j.apri?.tipo === 'referto' && k1.j.apri?.pdf === false && k1.j.apri?.testo.startsWith('Caro collega,') && /cordiali saluti/.test(k1.j.apri?.testo ?? ''),
      `«inserisci la lettera più recente»: arriva il corpo della più recente (senza saluto, saluti e firma), trovata dal legame col paziente; «la terapia»: il suo blocco (${k1.stato}, ${k1.j.data}, ${k2.stato})`);
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
      && f2.stato === 200 && f2.j.testo.endsWith('Comorbidità: nessuna di rilievo.') && !/Terapia/.test(f2.j.testo) && f2.j.data === '10.01.2026'
      && f3.stato === 200 && f3.j.testo.endsWith('FarmacoB 5 mg 0-0-1') && /a prima di conclusione/.test(f3.j.cosa) && f4.stato === 400,
      `«fino a»: la lettera dall'inizio fino alla terapia compresa, fino alle comorbidità dalla lettera che le ha, fino a prima della conclusione; senza parte è rifiutato (${f1.stato}, ${f2.stato}, ${f2.j.data}, ${f3.stato}, ${f4.stato})`);
    const k3 = await comando({ comando: 'lettera_recente', paziente: vuoto }), k4 = await comando({ comando: 'cancella_tutto', paziente: paz }), k5 = await comando({ comando: 'lettera_recente', paziente: 'x' }), k6 = await comando({ comando: 'lettera_recente', paziente: paz }, '');
    verifica(k3.stato === 404 && typeof k3.j.errore === 'string' && !k3.j.testo && k4.stato === 400 && k5.stato === 400 && k6.stato === 401,
      `un paziente senza lettere dà un avviso e niente testo; un comando non previsto, un paziente non scelto e una richiesta senza sessione sono rifiutati (${k3.stato}, ${k4.stato}, ${k5.stato}, ${k6.stato})`);
  } finally {
    const chiavi = fatti.length ? await query<{ storage_key: string }>(`select storage_key from referti_audio where id = any($1::uuid[])`, [fatti]) : [];
    if (fatti.length) await query(`delete from referti_audio where id = any($1::uuid[])`, [fatti]);
    if (bozze.length) await togliAudit(bozze).catch(() => null);
    if (bozze.length) await query(`delete from referti_bozze where id = any($1::uuid[])`, [bozze]);
    if (pazienti.length) await query(`delete from patients where id = any($1::uuid[])`, [pazienti]);
    for (const c of chiavi) await deleteFile(c.storage_key).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
