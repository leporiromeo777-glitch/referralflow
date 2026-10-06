// Prova end-to-end del monitoraggio remoto (6.10.2026) sul DB DEMO. Sul
// server di prova il motore è SPENTO: qui lo si chiama a mano, facendo
// scorrere il tempo, così gli avvisi si provano senza aspettare — ed è anche
// la prova che il motore non ha bisogno di una pagina aperta. L'assistente AI
// è spento apposta: il resto deve funzionare lo stesso. Poi toglie tutto.
//   DATABASE_URL=…demo NODE_OPTIONS=--conditions=react-server npx tsx scripts/e2e/prova-monitoraggio.ts <base> <studio> <medico> <segretaria> <tecnico> <admin>
import { query, pool } from '../../src/lib/db';
import { giro, ripristinaDemo, scenario } from '../../src/lib/monitoraggio/motore';

const [base, S, C_MED, C_SEG, C_TEC, C_ADM] = process.argv.slice(2);
let ok = 0, no = 0;
const verifica = (cond: boolean, cosa: string) => { if (cond) { ok++; console.log(`ok ${cosa}`); } else { no++; console.log(`NO ${cosa}`); } };
const url = `${base}/api/prototipo/monitoraggio`;
const leggi = async (cookie: string, coda = '') => { const r = await fetch(`${url}${coda}`, { headers: { cookie } }); return { stato: r.status, j: await r.json().catch(() => ({})) }; };
const manda = async (cookie: string, corpo: unknown) => { const r = await fetch(url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { stato: r.status, j: await r.json().catch(() => ({})) }; };
const uno = async <T = any>(sql: string, p: unknown[] = []) => (await query<T>(sql, p))[0];

async function via() {
  await query(`delete from mon_avvisi where studio_id = $1`, [S]);
  await query(`delete from mon_pazienti where studio_id = $1`, [S]);
  await query(`delete from mon_dispositivi where studio_id = $1`, [S]);
  await query(`delete from mon_regole where studio_id = $1`, [S]);
  await query(`delete from mon_registro where studio_id = $1`, [S]);
  await query(`delete from mon_config where studio_id = $1`, [S]);
}

async function main() {
  if (!/referralflow_demo/.test(process.env.DATABASE_URL ?? '')) throw new Error('solo sul database demo');
  try {
    await via();
    // 1. Aprire la pagina semina la demo: tredici pazienti finti, un'ora di storia, gli avvisi già scattati.
    const p0 = await leggi(C_MED);
    const paz: any[] = p0.j.pazienti ?? [];
    const di = (codice: string) => paz.find((x) => x.codice === codice);
    verifica(p0.stato === 200 && p0.j.ambiente === 'demo' && paz.length === 13 && p0.j.riepilogo.monitorati === 11, `panoramica: demo, 13 pazienti finti, 11 monitorati (${p0.stato}, ${paz.length})`);
    verifica(di('DEMO-001').stato === 'nessun_avviso' && di('DEMO-003').stato === 'avviso_attenzione' && di('DEMO-004').stato === 'avviso_alta' && di('DEMO-004').avvisi.prioritario.livello === 2, 'senza avvisi, attenzione (FC alta a riposo), alta priorità (saturazione): ognuno al suo posto');
    verifica(di('DEMO-005').stato === 'dati_insufficienti' && di('DEMO-005').connessione === 'interrotta' && di('DEMO-005').avvisi.tecnici === 1 && di('DEMO-006').stato === 'dati_insufficienti' && di('DEMO-006').qualita < 45, 'dispositivo scollegato e segnale scarso: «dati insufficienti», NON «nessun avviso»');
    verifica(di('DEMO-011').stato === 'interrotto' && di('DEMO-011').parametri.length === 0 && di('DEMO-013').stato === 'interrotto' && di('DEMO-007').batteria < 15 && di('DEMO-007').avvisi.tecnici === 1, 'monitoraggio terminato o in pausa: «interrotto»; batteria bassa: avviso tecnico, parametri a posto');
    verifica(di('DEMO-009').dispositivi.length === 3 && di('DEMO-008').intermittente === true && di('DEMO-008').parametri.every((x: any) => x.modo === 'intermittente') && !di('DEMO-002').parametri.some((x: any) => x.codice === 'fr'), 'tre dispositivi su un paziente; misure a intervalli dichiarate tali; un parametro che il dispositivo non misura non c\'è');

    // 2. Isolamento: tutto demo, nessuna cartella vera, e il database rifiuta i miscugli.
    const iso = await uno<{ reali: number; con_cartella: number; non_simulate: number }>(
      `select (select count(*) from mon_misure where ambiente <> 'demo')::int as reali, (select count(*) from mon_pazienti where patient_id is not null)::int as con_cartella, (select count(*) from mon_misure where provenienza <> 'simulato')::int as non_simulate`);
    const rifiuta = async (sql: string, par: unknown[]) => query(sql, par).then(() => false, () => true);
    const [vero] = await query<{ id: string }>(`select id from patients where studio_id = $1 limit 1`, [S]);
    const r1 = vero ? await rifiuta(`insert into mon_pazienti (studio_id, ambiente, patient_id, codice, nome) values ($1, 'demo', $2, 'X-1', 'x')`, [S, vero.id]) : true;
    const r2 = await rifiuta(`insert into mon_misure (ambiente, paziente_id, dispositivo_id, parametro, valore, acquisita_il, provenienza) select 'reale', p.id, d.id, 'fc', 70, now(), 'misurato' from mon_pazienti p, mon_dispositivi d where p.studio_id = $1 limit 1`, [S]);
    const r3 = await rifiuta(`insert into mon_misure (ambiente, paziente_id, dispositivo_id, parametro, valore, acquisita_il, provenienza) select 'demo', p.id, d.id, 'fc', 70, now(), 'misurato' from mon_pazienti p, mon_dispositivi d where p.studio_id = $1 limit 1`, [S]);
    verifica(iso.reali === 0 && iso.con_cartella === 0 && iso.non_simulate === 0 && r1 && r2 && r3, 'isolamento: solo dati demo e simulati, nessun paziente demo con una cartella; il database rifiuta cartella vera su paziente demo, misura «reale» su paziente demo, misura demo non simulata');

    // 3. Attribuzione: ogni misura è del paziente a cui il suo dispositivo era abbinato in quel momento.
    const attr = await uno<{ sbagliate: number; totale: number }>(
      `select count(*) filter (where not exists (select 1 from mon_abbinamenti ab where ab.dispositivo_id = m.dispositivo_id and ab.paziente_id = m.paziente_id and ab.dal <= m.acquisita_il and (ab.al is null or ab.al >= m.acquisita_il)))::int as sbagliate, count(*)::int as totale from mon_misure m`);
    verifica(attr.totale > 5000 && attr.sbagliate === 0, `attribuzione: ${attr.totale} misure, nessuna fuori dall'abbinamento del suo dispositivo (${attr.sbagliate})`);

    // 4. Doppioni e dati fuori ordine.
    const [{ ultimo }] = await query<{ ultimo: Date }>(`select ultimo_giro as ultimo from mon_config where studio_id = $1`, [S]);
    const t = (s: number) => new Date(ultimo.getTime() + s * 1000);
    const g1 = await giro(S, { ora: t(60) });
    await query(`update mon_config set ultimo_giro = $2 where studio_id = $1`, [S, ultimo]);   // lo stesso minuto, una seconda volta
    const g2 = await giro(S, { ora: t(60) });
    verifica(g1.fatto && g1.misure > 50 && g2.fatto && g2.misure === 0 && g2.tracce === 0 && g2.aperti === 0, `doppioni: lo stesso intervallo rimandato non aggiunge niente (${g1.misure} poi ${g2.misure})`);
    const rec = await uno<{ n: number; prima: boolean; in_ordine: boolean }>(
      `select count(*)::int as n, bool_and(m.ricevuta_il > m.acquisita_il + interval '2 minutes') as prima, bool_and(m.acquisita_il < p.ultimo_dato) as in_ordine from mon_misure m join mon_pazienti p on p.id = m.paziente_id where p.codice = 'DEMO-012' and m.recuperata`);
    verifica(rec.n > 100 && rec.prima && rec.in_ordine && di('DEMO-012').parametri.every((x: any) => !x.recuperata), `dati recuperati dopo una disconnessione (${rec.n}): tenuti col loro orario vero, segnati come storici, e il valore «attuale» non è uno di loro`);

    // 5. Avvisi: uno per paziente e regola, anche dopo molti giri; presa in carico, permessi, chiusura motivata.
    for (let i = 2; i <= 5; i++) await giro(S, { ora: t(60 * i) });
    const dup = await uno<{ n: number }>(`select count(*)::int as n from (select paziente_id, regola_chiave from mon_avvisi where studio_id = $1 and stato <> 'chiuso' group by 1, 2 having count(*) > 1) x`, [S]);
    const [a3] = await query<any>(`select a.* from mon_avvisi a join mon_pazienti p on p.id = a.paziente_id where p.codice = 'DEMO-003' and a.regola_chiave = 'fc_alta'`);
    const l1 = await uno<{ n: number }>(`select count(*)::int as n from mon_avvisi a join mon_pazienti p on p.id = a.paziente_id where p.codice = 'DEMO-004' and a.regola_chiave = 'spo2_bassa'`);
    verifica(dup.n === 0 && !!a3 && a3.livello === 1 && a3.regola_versione === 1 && /Frequenza cardiaca sopra 120 bpm per almeno 2 min/.test(a3.spiegazione) && /Regola illustrativa «FC alta a riposo», versione 1/.test(a3.spiegazione) && l1.n === 0,
      'un solo avviso per paziente e regola; spiegazione leggibile con regola e versione; con l\'alta priorità aperta non si apre anche l\'attenzione sullo stesso parametro');
    const not = await uno<{ interne: number; esterne: number }>(`select count(*) filter (where canale = 'interna' and stato = 'consegnata')::int as interne, count(*) filter (where canale = 'esterna' and stato = 'non_inviata_demo')::int as esterne from mon_notifiche where avviso_id = $1`, [a3.id]);
    verifica(not.interne >= 1 && not.esterne >= 1, `notifiche: quella interna registrata, quella esterna NON inviata e scritto il perché (${not.interne}, ${not.esterne})`);
    const seg = await manda(C_SEG, { azione: 'avviso', id: a3.id, cosa: 'prendi' });
    const med = await manda(C_MED, { azione: 'avviso', id: a3.id, cosa: 'prendi' });
    const bis = await manda(C_MED, { azione: 'avviso', id: a3.id, cosa: 'prendi' });
    const senza = await manda(C_MED, { azione: 'avviso', id: a3.id, cosa: 'chiudi', motivazione: '' });
    verifica(seg.stato === 403 && med.stato === 200 && bis.stato === 409 && senza.stato === 400, `presa in carico: la segreteria consulta ma non prende (403), il medico sì (200), due volte no (409); chiudere senza motivazione no (400)`);

    // 6. Rientro ≠ chiusura: il parametro torna a posto, l'avviso resta finché una persona non lo chiude.
    const [p3] = await query<{ id: string }>(`select id from mon_pazienti where studio_id = $1 and codice = 'DEMO-003'`, [S]);
    await scenario(S, p3.id, 'normalizza', null, null, t(300));
    for (let i = 6; i <= 12; i++) await giro(S, { ora: t(60 * i) });
    const dopo = await uno<any>(`select stato, rientrato_il from mon_avvisi where id = $1`, [a3.id]);
    verifica(dopo.stato === 'in_carico' && dopo.rientrato_il != null, 'il parametro rientra (isteresi): segnato, ma l\'avviso resta in carico');
    const chiudi = await manda(C_MED, { azione: 'avviso', id: a3.id, cosa: 'chiudi', motivazione: 'Verificato al telefono: prova end-to-end.' });
    const passi = await query<{ azione: string; autore: string | null; motivazione: string | null }>(`select azione, autore, motivazione from mon_azioni where avviso_id = $1 order by id`, [a3.id]);
    verifica(chiudi.stato === 200 && passi.map((x) => x.azione).join() === 'sistema:generato,preso_in_carico,sistema:rientrato,chiuso' && passi[1].autore != null && /prova end-to-end/.test(passi[3].motivazione ?? ''), `registro delle azioni: generato, preso in carico, rientrato, chiuso — con autore e motivazione (${passi.map((x) => x.azione).join()})`);

    // 7. Uno scenario dal simulatore: i valori salgono gradualmente e l'avviso scatta quando la regola è soddisfatta.
    const [p1] = await query<{ id: string }>(`select id from mon_pazienti where studio_id = $1 and codice = 'DEMO-001'`, [S]);
    const sim = await manda(C_MED, { azione: 'simulatore', cosa: 'evento', tipo: 'tachicardia', paziente: p1.id });
    const subito = await uno<{ n: number }>(`select count(*)::int as n from mon_avvisi where paziente_id = $1`, [p1.id]);
    // (lo scenario parte dall'ora vera del server; qui il tempo simulato è già più avanti, quindi il picco è già pieno)
    for (let i = 13; i <= 18; i++) await giro(S, { ora: t(60 * i) });
    const [alta] = await query<any>(`select livello, regola_chiave, valori from mon_avvisi where paziente_id = $1 and stato <> 'chiuso' order by livello desc limit 1`, [p1.id]);
    verifica(sim.stato === 200 && subito.n === 0 && alta?.livello === 2 && alta.regola_chiave === 'fc_molto_alta' && alta.valori.minimo > 150, `scenario «FC molto alta»: nessun avviso al clic, avviso di livello 2 quando la regola è soddisfatta (${alta?.regola_chiave})`);
    const [p2] = await query<{ id: string }>(`select id from mon_pazienti where studio_id = $1 and codice = 'DEMO-002'`, [S]);
    await scenario(S, p2.id, 'interrompi', null, null, t(60 * 18));
    for (let i = 19; i <= 23; i++) await giro(S, { ora: t(60 * i) });
    const scoll = await uno<{ n: number; misure: number }>(`select (select count(*) from mon_avvisi where paziente_id = $1 and regola_chiave = 'tec_disconnesso' and categoria = 'tecnico' and livello is null)::int as n, (select count(*) from mon_misure where paziente_id = $1 and acquisita_il > $2)::int as misure`, [p2.id, t(60 * 18 + 30)]);
    verifica(scoll.n === 1 && scoll.misure === 0, 'connessione interrotta: avviso TECNICO (senza livello), e durante il buco nessuna misura inventata');

    // 8. Regole a versioni, soglie del paziente, registro; permessi su regole e dispositivi.
    const tecR = await manda(C_TEC, { azione: 'regola', chiave: 'fc_alta', cambi: { soglia: 125 } });
    const male = await manda(C_MED, { azione: 'regola', chiave: 'fc_alta', cambi: { soglia: 125, rientro: 130 } });
    const bene = await manda(C_MED, { azione: 'regola', chiave: 'fc_alta', cambi: { soglia: 125, rientro: 115 } });
    const vers = await query<{ versione: number; soglia: number }>(`select versione, (definizione->>'soglia')::float as soglia from mon_regole where studio_id = $1 and chiave = 'fc_alta' order by versione`, [S]);
    const vecchio = await uno<{ v: number }>(`select regola_versione as v from mon_avvisi where id = $1`, [a3.id]);
    const sp = await manda(C_MED, { azione: 'soglia_paziente', paziente: p3.id, chiave: 'fc_alta', soglia: 140, rientro: 130 });
    const reg = await uno<{ n: number }>(`select count(*)::int as n from mon_registro where studio_id = $1 and azione in ('regola:nuova_versione', 'soglia:paziente') and autore is not null`, [S]);
    verifica(tecR.stato === 403 && male.stato === 400 && /isteresi/.test(male.j.errore ?? '') && bene.stato === 200 && bene.j.versione === 2 && vers.length === 2 && vers[0].soglia === 120 && vers[1].soglia === 125 && vecchio.v === 1 && sp.stato === 200 && reg.n === 2,
      'regole: il tecnico non le tocca (403); rientro dal lato sbagliato rifiutato; una modifica è la versione 2 e la 1 resta; l\'avviso vecchio dice ancora versione 1; soglia del singolo paziente; tutto nel registro con l\'autore');
    const [d1] = await query<{ id: string }>(`select d.id from mon_dispositivi d join mon_abbinamenti ab on ab.dispositivo_id = d.id and ab.al is null where ab.paziente_id = $1 limit 1`, [p2.id]);
    const medD = await manda(C_MED, { azione: 'dispositivo', cosa: 'stacca', dispositivo: d1.id });
    const stacca = await manda(C_ADM, { azione: 'dispositivo', cosa: 'stacca', dispositivo: d1.id });
    const sbagliato = await manda(C_ADM, { azione: 'dispositivo', cosa: 'abbina', dispositivo: d1.id, paziente: p1.id, conferma: 'DEMO-002' });
    const giusto = await manda(C_ADM, { azione: 'dispositivo', cosa: 'abbina', dispositivo: d1.id, paziente: p1.id, conferma: 'demo-001' });
    const storia = await uno<{ righe: number; vecchie_di_p2: number; di_p1: number }>(
      `select (select count(*) from mon_abbinamenti where dispositivo_id = $1)::int as righe, (select count(*) from mon_misure where dispositivo_id = $1 and paziente_id = $2)::int as vecchie_di_p2, (select count(*) from mon_misure where dispositivo_id = $1 and paziente_id = $3)::int as di_p1`, [d1.id, p2.id, p1.id]);
    verifica(medD.stato === 403 && stacca.stato === 200 && sbagliato.stato === 400 && giusto.stato === 200 && storia.righe === 2 && storia.vecchie_di_p2 > 100 && storia.di_p1 === 0,
      'dispositivi: il medico non li gestisce (403); riabbinare chiede il codice del paziente giusto; lo storico resta e i dati di prima restano del paziente di prima');

    // 9. Vista tecnica: chi gestisce i dispositivi non vede i valori dei pazienti.
    const tec = await leggi(C_TEC);
    const dett = await fetch(`${url}/${p3.id}?intervallo=1h`, { headers: { cookie: C_TEC } }).then((r) => r.json());
    const ecgT = await fetch(`${url}/${p3.id}?ecg=1&da=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`, { headers: { cookie: C_TEC } });
    const aiT = await manda(C_TEC, { azione: 'assistente', paziente: p3.id, da: new Date(Date.now() - 3600_000).toISOString(), a: new Date().toISOString() });
    verifica(tec.stato === 200 && tec.j.vista_tecnica === true && tec.j.pazienti.every((x: any) => x.parametri.every((v: any) => v.valore == null && v.testo == null) && Object.keys(x.andamenti).length === 0) && dett.serie.every((x: any) => x.punti.length === 0) && dett.dispositivi.length > 0 && ecgT.status === 403 && aiT.stato === 403,
      'tecnico: vede stato dei dispositivi e avvisi tecnici, non valori, grafici, tracciato né riassunti');
    const fuori = await fetch(url);
    verifica(fuori.status === 401, 'senza sessione niente');

    // 10. L'AI è spenta su questo server: il resto ha funzionato, e il riassunto dice che è un modello fisso.
    const ai = await manda(C_MED, { azione: 'assistente', paziente: p3.id, da: new Date(Date.now() - 3600_000).toISOString(), a: new Date().toISOString(), domanda: 'Che cosa è cambiato nelle ultime due ore?' });
    verifica(ai.stato === 200 && ai.j.fonte === 'modello_fisso' && /senza AI/.test(ai.j.nota ?? '') && /Periodo analizzato/.test(ai.j.testo ?? '') && ai.j.dati_usati.length > 0 && /SIMULATI/.test(ai.j.avvertenza ?? '') && ai.j.collegamenti.some((c: any) => c.tipo === 'avviso'),
      `AI indisponibile: riassunto dichiarato «modello fisso, senza AI», con periodo, dati usati e collegamenti (${ai.j.fonte})`);
    const det = await fetch(`${url}/${p3.id}?intervallo=1h`, { headers: { cookie: C_MED } }).then((r) => r.json());
    const ecg = await fetch(`${url}/${p3.id}?ecg=1&da=${encodeURIComponent(new Date(Date.now() - 6 * 60_000).toISOString())}&secondi=600`, { headers: { cookie: C_MED } }).then((r) => r.json());
    verifica(det.paziente.cartella == null && det.serie.find((x: any) => x.codice === 'fc').punti.length > 100 && det.serie.find((x: any) => x.codice === 'fc').soglie.some((g: any) => g.personale && g.soglia === 140) && det.ecg.disponibile && ecg.pezzi.length > 0 && ecg.pezzi[0].hz === 125 && ecg.pezzi[0].provenienza === 'simulato',
      'dettaglio: nessuna cartella per il paziente demo, serie e soglie (anche quella personale), tracciato a pezzi con frequenza di campionamento e provenienza');

    // 11. Ripristino: tutto torna allo stato iniziale.
    const rip = await manda(C_MED, { azione: 'simulatore', cosa: 'ripristina' });
    const fine = await uno<{ regole: number; avvisi: number; versioni: number }>(`select (select count(*) from mon_regole where studio_id = $1)::int as regole, (select count(*) from mon_avvisi where studio_id = $1)::int as avvisi, (select max(versione) from mon_regole where studio_id = $1)::int as versioni`, [S]);
    verifica(rip.stato === 200 && fine.regole === 15 && fine.versioni === 1 && fine.avvisi === 7, `«Ripristina lo stato iniziale»: regole di nuovo alla versione 1, i sette avvisi di partenza (${fine.avvisi})`);
    void ripristinaDemo;
  } finally {
    await via().catch(() => null);
    await pool.end();
  }
  console.log(`${ok} ok, ${no} no`);
  process.exit(no ? 1 : 0);
}
main().catch((e) => { console.error('NO errore', e?.message ?? e); process.exit(1); });
