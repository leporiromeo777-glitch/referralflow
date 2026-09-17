/* Una bozza INVENTATA per la demo, con la stessa forma di quelle vere: testo
   dettato e testo corretto, le verifiche che la catena solleva, la fiducia.
   Nessuna parola viene da un referto vero — è scritta qui, di sana pianta. */
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://centrocardiologicoticino@localhost:5432/referralflow_demo' });

const GREZZO = `paziente bernasconi luca nato il quattordici marzo millenovecentocinquantotto controllo a sei mesi per fibrillazione atriale parossistica riferisce due episodi di cardiopalmo serale della durata di qualche minuto risolti spontaneamente niente dispnea niente dolore toracico pressione centotrenta su ottanta frequenza sessantotto ritmica ecg ritmo sinusale eco ventricolo sinistro non dilatato frazione di eiezione sessanta per cento atrio sinistro lievemente dilatato terapia prosegue eliquis cinque milligrammi due volte al giorno e bisoprololo due virgola cinque controllo fra sei mesi`;

const CORRETTO = `Paziente: Bernasconi Luca, 14.03.1958.
Motivo: controllo a sei mesi per fibrillazione atriale parossistica.

Anamnesi recente: riferisce due episodi di cardiopalmo serale, della durata di qualche minuto, risolti spontaneamente. Niente dispnea, niente dolore toracico.

Esame obiettivo: PA 130/80 mmHg, FC 68 bpm ritmica.
ECG: ritmo sinusale.
Ecocardiografia: ventricolo sinistro non dilatato, frazione di eiezione 60%. Atrio sinistro lievemente dilatato.

Terapia: prosegue apixaban 5 mg due volte al giorno e bisoprololo 2.5 mg.
Conclusione: quadro stabile. Controllo fra sei mesi.`;

const payload = {
  dettato_il: new Date().toISOString(),
  versione_catena: 'demo',
  testo_grezzo: GREZZO,
  testo_corretto: CORRETTO,
  testo_strutturato: CORRETTO,
  parole: [],
  medico: { id: 'mm', nome: 'Dr. med. Marco Moccetti', formato: 'rapporto', modalita: 'referto' },
  campi_estratti: { nome_paziente: 'Bernasconi Luca', data_nascita: '14.03.1958', tipo_esame: 'Visita cardiologica' },
  fiducia: { punteggio: 0.86, motivo: 'audio pulito, nessun segmento incerto lungo' },
  // Le verifiche: quello che la catena NON decide da sola e lascia a chi rivede.
  divergenze: [
    { campo: 'terapia', a: 'apixaban 5 mg', b: 'Eliquis 5 mg', nota: 'nel dettato il nome commerciale, nel referto il principio attivo' },
  ],
  allarmi_numerici: [
    { misura: 'frazione di eiezione', valore: '60%', nota: 'confermare: nel referto precedente era 55%' },
  ],
  frasi_da_chiarire: [
    { frase: 'due episodi di cardiopalmo serale', nota: 'durata esatta non dettata' },
  ],
  frasi_non_supportate: [],
  incoerenze: [], divagazioni: [], doppioni_dubbi: [], doppioni_tolti: [], segmenti_dubbi: [],
  note_segreteria: [], avvisi: [], numeri: [], terapia: ['apixaban 5 mg 2x/die', 'bisoprololo 2.5 mg'],
  richiede_revisione: true,
};

const [{ id: studio }] = (await pool.query(`select id from studios where slug = 'demo'`)).rows;
await pool.query(`delete from referti_bozze where studio_id = $1 and payload->>'versione_catena' = 'demo'`, [studio]);
await pool.query(`delete from referti_audio where studio_id = $1 and storage_key like 'demo/%'`, [studio]);
// La bozza vuole un audio da cui viene: ne mettiamo uno finto, «fatto», senza
// file sul disco — nella demo non c'è niente da riascoltare, ed è giusto così.
const { rows: aud } = await pool.query(
  `insert into referti_audio (studio_id, filename, storage_key, content_type, tipo, stato, medico)
   values ($1, 'dettatura-demo.ds2', 'demo/dettatura-demo.ds2', 'audio/x-dss', 'referto', 'fatto', 'marco-moccetti')
   returning id`, [studio]);
payload.file_id = aud[0].id;
const { rows } = await pool.query(
  `insert into referti_bozze (studio_id, file_id, payload, stato, tipo, medico, created_at)
   values ($1, $2, $3::jsonb, 'bozza', 'referto', 'marco-moccetti', now() - interval '6 minutes') returning id`,
  [studio, aud[0].id, JSON.stringify(payload)]);
console.log(`bozza inventata nella demo: ${rows[0].id}`);
await pool.end();
