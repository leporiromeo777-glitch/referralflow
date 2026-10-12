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
  const fatti: string[] = [], bozze: string[] = [];
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
  } finally {
    const chiavi = fatti.length ? await query<{ storage_key: string }>(`select storage_key from referti_audio where id = any($1::uuid[])`, [fatti]) : [];
    if (fatti.length) await query(`delete from referti_audio where id = any($1::uuid[])`, [fatti]);
    if (bozze.length) await togliAudit(bozze).catch(() => null);
    if (bozze.length) await query(`delete from referti_bozze where id = any($1::uuid[])`, [bozze]);
    for (const c of chiavi) await deleteFile(c.storage_key).catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
