// Pazienti di PROVA con dati inventati e documenti PDF scaricabili (13.9.2026),
// per provare cartella, bot e ricerca documenti senza toccare persone vere.
//   npm run dati-prova            crea (idempotente: se esistono già, non duplica)
//   npm run dati-prova -- --elimina   toglie tutto ciò che ha creato
// Tutto è inventato; i PDF lo dichiarano in testa. Gli id creati stanno in
// ~/.referralflow-dati-prova.json per la cancellazione.
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { query } from '../src/lib/db';
import { putFile, deleteFile } from '../src/lib/storage';

const REGISTRO = path.join(os.homedir(), '.referralflow-dati-prova.json');

type Doc = { titolo: string; categoria: 'referto' | 'ecg' | 'imaging' | 'lettera' | 'consenso' | 'altro'; righe: string[] };
type Paziente = {
  cognome: string; nome: string; nascita: string; telefono: string; sesso: 'M' | 'F';
  quesito: string; urgenza: 'urgente' | 'normale' | 'programmabile'; status: 'ricevuta' | 'da_prenotare' | 'prenotata' | 'vista';
  documenti: Doc[];
};

const PAZIENTI: Paziente[] = [
  {
    cognome: 'Bernasconi', nome: 'Luca', nascita: '1958-03-14', telefono: '+41 91 000 00 01', sesso: 'M',
    quesito: 'Dolore toracico da sforzo, esclusione cardiopatia ischemica', urgenza: 'normale', status: 'vista',
    documenti: [
      { titolo: 'ECG a riposo del 02.09.2026', categoria: 'ecg', righe: ['Ritmo sinusale, FC 68 bpm.', 'PR 160 ms, QRS 92 ms, QTc 410 ms.', 'Asse elettrico normale. Nessuna alterazione della ripolarizzazione.', 'Conclusione: tracciato nei limiti della norma.'] },
      { titolo: 'Test ergometrico del 05.09.2026', categoria: 'referto', righe: ['Protocollo Bruce, 9 minuti, 10,1 MET raggiunti.', 'FC massima 152 bpm (94% della teorica). PA massima 190/85 mmHg.', 'Nessun dolore toracico. ECG da sforzo senza sottoslivellamenti significativi.', 'Conclusione: test negativo per ischemia inducibile a carico massimale.'] },
      { titolo: 'Laboratorio del 01.09.2026', categoria: 'altro', righe: ['Colesterolo totale 5,8 mmol/l, LDL 3,9 mmol/l, HDL 1,1 mmol/l, trigliceridi 1,7 mmol/l.', 'Glicemia a digiuno 5,4 mmol/l, HbA1c 5,6%.', 'Creatinina 82 umol/l, eGFR 88 ml/min.', 'NT-proBNP 85 ng/l.'] },
    ],
  },
  {
    cognome: 'Pedrazzini', nome: 'Maria', nascita: '1946-11-02', telefono: '+41 91 000 00 02', sesso: 'F',
    quesito: 'Fibrillazione atriale parossistica, controllo terapia anticoagulante', urgenza: 'normale', status: 'prenotata',
    documenti: [
      { titolo: 'Holter ECG 24 ore del 20.08.2026', categoria: 'ecg', righe: ['Registrazione di 23 ore e 40 minuti, qualità buona.', 'Ritmo sinusale prevalente, FC media 71 bpm (min 48, max 121).', 'Due episodi di fibrillazione atriale parossistica, durata massima 42 minuti, burden 3%.', '312 extrasistoli sopraventricolari, 18 ventricolari isolate. Nessuna pausa superiore a 2 secondi.'] },
      { titolo: 'Ecocardiogramma del 20.08.2026', categoria: 'referto', righe: ['Ventricolo sinistro di dimensioni normali, FE 60%.', 'Atrio sinistro lievemente dilatato, volume indicizzato 38 ml/m2.', 'Insufficienza mitralica lieve. Valvola aortica tricuspide, senza stenosi.', 'Pressione polmonare stimata 28 mmHg. Nessun versamento pericardico.'] },
      { titolo: 'Lettera del 21.05.2026', categoria: 'lettera', righe: ['Caro collega,', 'ho rivisto in data odierna la paziente per il controllo semestrale della fibrillazione atriale parossistica.', 'Clinicamente stabile, PA 132/78 mmHg, FC 70 bpm. Nessun episodio sintomatico riferito.', 'In conclusione, alla luce degli elementi di cui sopra, propongo di lasciare invariata la terapia in atto.', '', 'Terapia:', 'Eliquis 5 mg 1-0-1', 'Concor 2,5 mg 1-0-0', 'Atorvastatina 20 mg 0-0-1', '', 'Cordiali e collegiali saluti.'] },
    ],
  },
  {
    cognome: 'Ortelli', nome: 'Giovanni', nascita: '1962-07-23', telefono: '+41 91 000 00 03', sesso: 'M',
    quesito: 'Ipertensione arteriosa di difficile controllo', urgenza: 'programmabile', status: 'da_prenotare',
    documenti: [
      { titolo: 'Monitoraggio pressorio 24 ore del 28.08.2026', categoria: 'referto', righe: ['Media delle 24 ore 148/91 mmHg; diurna 152/94 mmHg; notturna 136/82 mmHg.', 'Calo notturno 10%, profilo dipper conservato.', 'Carico pressorio diurno 68%.', 'Conclusione: ipertensione arteriosa non controllata sotto terapia.'] },
      { titolo: 'Duplex delle arterie renali del 03.09.2026', categoria: 'imaging', righe: ['Arterie renali di calibro regolare bilateralmente.', 'Velocità di picco sistolico 95 cm/s a destra, 102 cm/s a sinistra.', 'Rapporto reno-aortico inferiore a 3,5. Indice di resistenza intrarenale 0,64.', 'Conclusione: nessun segno di stenosi delle arterie renali.'] },
    ],
  },
  {
    cognome: 'Casanova', nome: 'Elisabetta', nascita: '1975-01-30', telefono: '+41 91 000 00 04', sesso: 'F',
    quesito: 'Palpitazioni e cardiopalmo, esclusione aritmia', urgenza: 'normale', status: 'ricevuta',
    documenti: [
      { titolo: 'ECG del 09.09.2026', categoria: 'ecg', righe: ['Ritmo sinusale, FC 84 bpm.', 'Conduzione atrioventricolare e intraventricolare nei limiti.', 'Nessuna preeccitazione. QTc 402 ms.', 'Conclusione: tracciato normale.'] },
      { titolo: 'Consenso informato del 09.09.2026', categoria: 'consenso', righe: ['Consenso alla trasmissione dei documenti clinici tra lo studio e il medico curante.', 'Firmato dalla paziente in data 09.09.2026.'] },
    ],
  },
  {
    cognome: 'Rusconi', nome: 'Pietro', nascita: '1939-09-08', telefono: '+41 91 000 00 05', sesso: 'M',
    quesito: 'Stenosi aortica moderata, controllo annuale', urgenza: 'normale', status: 'vista',
    documenti: [
      { titolo: 'Ecocardiogramma del 04.09.2026', categoria: 'referto', righe: ['Valvola aortica tricuspide, calcifica, apertura ridotta.', 'Gradiente medio 28 mmHg, massimo 46 mmHg, area valvolare 1,2 cm2 (indicizzata 0,65 cm2/m2).', 'Ventricolo sinistro con ipertrofia concentrica lieve, FE 62%.', 'Conclusione: stenosi aortica moderata, stabile rispetto al 2025.'] },
      { titolo: 'CoroTAC del 12.03.2026', categoria: 'imaging', righe: ['Calcium score 410 (percentile 80 per età e sesso).', 'Malattia coronarica non ostruttiva: placche calcifiche del tronco comune e del RIVA prossimale con stenosi inferiore al 50%.', 'RCx e coronaria destra senza stenosi significative.', 'Conclusione: coronaropatia non ostruttiva.'] },
      { titolo: 'Lettera di dimissione del 15.03.2026', categoria: 'lettera', righe: ['Ricovero per scompenso cardiaco lieve, trattato con diuretico endovenoso.', 'Dimesso in compenso, peso 78 kg.', 'Terapia alla dimissione: Torasemide 10 mg 1-0-0, Entresto 49/51 mg 1-0-1, Concor 5 mg 1-0-0.', 'Controllo cardiologico ambulatoriale a 4 settimane.'] },
    ],
  },
  {
    cognome: 'Galli', nome: 'Sofia', nascita: '1988-05-17', telefono: '+41 91 000 00 06', sesso: 'F',
    quesito: 'Soffio cardiaco riscontrato in visita di medicina generale', urgenza: 'programmabile', status: 'prenotata',
    documenti: [
      { titolo: 'Ecocardiogramma del 08.09.2026', categoria: 'referto', righe: ['Prolasso del lembo posteriore mitralico con insufficienza lieve.', 'Ventricolo sinistro normale, FE 65%. Atrio sinistro normale.', 'Nessuna altra valvulopatia. Nessun versamento.', 'Conclusione: prolasso mitralico con insufficienza lieve, controllo tra 2 anni.'] },
    ],
  },
];

// PDF minimale, una pagina, testo Helvetica: nessuna libreria.
function pdfSemplice(titolo: string, paziente: string, righe: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const testo: string[] = [
    'BT', '/F1 9 Tf', '1 0 0 1 50 800 Tm', `(${esc('DOCUMENTO DI PROVA - dati inventati, nessuna persona reale - ReferralFlow')}) Tj`, 'ET',
    'BT', '/F1 16 Tf', '1 0 0 1 50 760 Tm', `(${esc(titolo)}) Tj`, 'ET',
    'BT', '/F1 11 Tf', '1 0 0 1 50 738 Tm', `(${esc(`Paziente: ${paziente}`)}) Tj`, 'ET',
    'BT', '/F1 11 Tf', '14 TL', '1 0 0 1 50 705 Tm',
  ];
  for (const r of righe) testo.push(`(${esc(r)}) Tj T*`);
  testo.push('ET');
  const contenuto = Buffer.from(testo.join('\n'), 'latin1');
  const oggetti: string[] = [];
  oggetti.push('<< /Type /Catalog /Pages 2 0 R >>');
  oggetti.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  oggetti.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  oggetti.push(`<< /Length ${contenuto.length} >>\nstream\n${contenuto.toString('latin1')}\nendstream`);
  oggetti.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  let corpo = '%PDF-1.4\n';
  const offset: number[] = [];
  oggetti.forEach((o, i) => { offset.push(Buffer.byteLength(corpo, 'latin1')); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(corpo, 'latin1');
  corpo += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n` + offset.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}

async function crea() {
  const [studio] = await query<{ id: string }>(`select id from studios order by created_at limit 1`);
  const [utente] = await query<{ id: string }>(`select id from users where studio_id = $1 order by created_at limit 1`, [studio.id]);
  let registro: { patients: string[]; documents: { id: string; key: string }[]; referrals: string[]; appointments: string[]; doctor: string | null } =
    { patients: [], documents: [], referrals: [], appointments: [], doctor: null };
  try { registro = JSON.parse(await fs.readFile(REGISTRO, 'utf-8')); console.log('dati di prova già presenti: aggiungo solo ciò che manca'); } catch { /* prima volta */ }

  // Medico inviante di prova.
  let dottore = registro.doctor;
  if (!dottore) {
    const [d] = await query<{ id: string }>(
      `insert into referring_doctors (studio_id, nome, studio, email, telefono) values ($1, $2, $3, $4, $5) returning id`,
      [studio.id, 'Dr. med. Andrea Prova', 'Studio medico di prova (dati inventati)', 'prova@referralflow.ch', '+41 91 000 00 00']
    );
    dottore = d.id; registro.doctor = dottore;
  }
  const oggi = new Date();
  let k = 0;
  for (const p of PAZIENTI) {
    let [paz] = await query<{ id: string }>(`select id from patients where studio_id = $1 and cognome = $2 and nome = $3`, [studio.id, p.cognome, p.nome]);
    if (!paz) {
      [paz] = await query<{ id: string }>(`insert into patients (studio_id, cognome, nome, data_nascita, telefono) values ($1, $2, $3, $4, $5) returning id`, [studio.id, p.cognome, p.nome, p.nascita, p.telefono]);
      registro.patients.push(paz.id);
      console.log('paziente', p.cognome, p.nome);
    }
    const [ref] = await query<{ id: string }>(`select id from referrals where patient_id = $1 limit 1`, [paz.id]);
    if (!ref) {
      const appt = p.status === 'prenotata' ? new Date(oggi.getTime() + (k + 1) * 86400000) : null;
      const [r] = await query<{ id: string }>(
        `insert into referrals (studio_id, patient_id, referring_doctor_id, quesito, urgenza, status, canale, appuntamento_at) values ($1, $2, $3, $4, $5::urgenza, $6::referral_status, 'prova', $7) returning id`,
        [studio.id, paz.id, dottore, `${p.quesito} (paziente di prova)`, p.urgenza, p.status, appt ? appt.toISOString() : null]
      );
      registro.referrals.push(r.id);
    }
    // Appuntamento di oggi per i primi tre, così compaiono in agenda.
    if (k < 3) {
      const uid = `prova-${p.cognome.toLowerCase()}-${oggi.toISOString().slice(0, 10)}`;
      const [a] = await query<{ id: string }>(`select id from appointments where studio_id = $1 and external_uid = $2`, [studio.id, uid]);
      if (!a) {
        const inizio = new Date(oggi); inizio.setHours(14 + k, 0, 0, 0);
        const fine = new Date(inizio.getTime() + 30 * 60000);
        const [pr] = await query<{ id: string }>(`select id from providers where studio_id = $1 and attivo order by nome limit 1`, [studio.id]);
        const [ins] = await query<{ id: string }>(
          `insert into appointments (studio_id, provider_id, starts_at, ends_at, titolo, paziente_nome, motivo, luogo, external_uid) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
          [studio.id, pr?.id ?? null, inizio.toISOString(), fine.toISOString(), `${p.cognome} ${p.nome}`, `${p.cognome} ${p.nome}`, p.quesito.split(',')[0], 'Sala 1', uid]
        );
        registro.appointments.push(ins.id);
      }
    }
    for (const d of p.documenti) {
      const [esiste] = await query<{ id: string }>(`select id from patient_documents where patient_id = $1 and nota = $2`, [paz.id, d.titolo]);
      if (esiste) continue;
      const pdf = pdfSemplice(d.titolo, `${p.cognome} ${p.nome} (${p.nascita.split('-').reverse().join('.')})`, d.righe);
      const key = await putFile(pdf, 'application/pdf', '.pdf');
      const filename = `PROVA-${d.titolo.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
      const [doc] = await query<{ id: string }>(
        `insert into patient_documents (studio_id, patient_id, filename, storage_key, categoria, nota, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [studio.id, paz.id, filename, key, d.categoria, d.titolo, utente?.id ?? null]
      );
      registro.documents.push({ id: doc.id, key });
      console.log('   documento', d.titolo);
    }
    k++;
  }
  await fs.writeFile(REGISTRO, JSON.stringify(registro, null, 1), { mode: 0o600 });
  console.log(`fatto: ${registro.patients.length} pazienti, ${registro.documents.length} documenti, ${registro.referrals.length} referral, ${registro.appointments.length} appuntamenti di prova · registro in ${REGISTRO}`);
}

async function elimina() {
  let registro: { patients: string[]; documents: { id: string; key: string }[]; referrals: string[]; appointments: string[]; doctor: string | null };
  try { registro = JSON.parse(await fs.readFile(REGISTRO, 'utf-8')); } catch { console.log('nessun dato di prova registrato'); return; }
  for (const d of registro.documents) { await query(`delete from patient_documents where id = $1`, [d.id]); try { await deleteFile(d.key); } catch { /* già via */ } }
  for (const a of registro.appointments) await query(`delete from appointments where id = $1`, [a]);
  for (const r of registro.referrals) await query(`delete from referrals where id = $1`, [r]);
  for (const p of registro.patients) await query(`delete from patients where id = $1`, [p]);
  if (registro.doctor) await query(`delete from referring_doctors where id = $1`, [registro.doctor]);
  await fs.unlink(REGISTRO);
  console.log('dati di prova eliminati');
}

(process.argv.includes('--elimina') ? elimina() : crea()).then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? e); process.exit(1); });
