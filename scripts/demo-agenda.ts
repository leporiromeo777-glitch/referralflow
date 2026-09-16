// Una giornata inventata per la DEMO (16.9.2026).
//
//   cd ~/referralflow-demo && NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/demo-agenda.ts
//
// Riempie l'agenda di OGGI dello studio «demo» con appuntamenti finti, così la
// piattaforma si può far vedere fuori dallo studio senza portarsi dietro il
// Mac e senza che esca un solo dato vero. Tutto quello che c'è qui dentro è
// inventato: i pazienti non esistono. I MEDICI invece sono quelli veri dello
// studio, perché le regole delle sale ([[Medici/Sale]]) parlano di loro: con
// nomi di fantasia il piano delle stanze non mostrerebbe niente di vero.
//
// Rieseguibile: cancella e rifà gli appuntamenti con external_uid «demo-…».
// Non tocca mai il database dello studio (gira con .env della demo).
import { query } from '../src/lib/db';

// Cognomi e nomi inventati, di suono ticinese ma senza riferimento a nessuno.
const GENTE: [string, string, string][] = [
  ['Delmenico', 'Aurelio', '1948-02-11'], ['Ferrari', 'Nadia', '1971-06-03'], ['Kaufmann', 'Renzo', '1955-10-27'],
  ['Bignasca', 'Ivo', '1963-04-19'], ['Storni', 'Marta', '1980-12-08'], ['Tamò', 'Gianni', '1944-07-30'],
  ['Regazzoni', 'Elsa', '1952-09-14'], ['Bernardi', 'Paolo', '1968-01-22'], ['Cavalli', 'Lidia', '1937-05-06'],
  ['Morosoli', 'Fausto', '1959-11-11'], ['Quadri', 'Emma', '1991-03-25'], ['Antonini', 'Sergio', '1946-08-17'],
  ['Balestra', 'Giulia', '1986-02-02'], ['Pellanda', 'Remo', '1974-10-09'], ['Solari', 'Teresa', '1941-12-29'],
  ['Vassalli', 'Michele', '1965-06-16'],
];
// I pazienti che hanno anche una cartella (li ha creati `dati-prova`): il nome
// deve combaciare, è così che l'agenda e la cartella si riconoscono.
const IN_CARTELLA: [string, string][] = [
  ['Bernasconi', 'Luca'], ['Pedrazzini', 'Maria'], ['Ortelli', 'Giovanni'],
  ['Casanova', 'Elisabetta'], ['Rusconi', 'Pietro'], ['Galli', 'Sofia'],
];

// Chi fa che cosa, nella giornata inventata.
const GIORNATA: { medico: string; prestazione: string; ore: string[] }[] = [
  { medico: 'Dr. med. Marco Moccetti', prestazione: 'Visita cardiologica', ore: ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30'] },
  { medico: 'Prof. Dr. med. Tiziano Moccetti', prestazione: 'Visita cardiologica', ore: ['09:00', '09:30', '10:00', '15:00', '15:30'] },
  { medico: 'Dr.ssa med. Vera Lucia Paiocchi', prestazione: 'Risonanza magnetica', ore: ['08:00', '09:00', '10:00', '14:00'] },
  { medico: 'Daniela Cassani', prestazione: 'Ecocardiogramma', ore: ['08:30', '09:15', '10:00', '10:45', '14:00', '14:45'] },
  { medico: 'Dr. med. Georgios Moschovitis', prestazione: 'Visita cardiologica', ore: ['09:00', '09:45', '10:30', '11:15'] },
  { medico: 'Dr. med. Sebastiano Franscella', prestazione: 'Ergometria', ore: ['08:45', '09:30', '10:15', '15:00'] },
  { medico: 'Dr. med. François Diederik Rego', prestazione: 'Holter ECG 24h', ore: ['08:30', '09:00', '14:30'] },
  { medico: 'Dr. med. Miko Pedrotti', prestazione: 'Ergometria', ore: ['10:00', '11:00', '15:30'] },
];

function alle(giorno: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${giorno}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  const [studio] = await query<{ id: string; nome: string }>(`select id, nome from studios where slug = 'demo'`);
  if (!studio) throw new Error('studio «demo» non trovato: crealo prima con create-studio');
  const medici = await query<{ id: string; nome: string }>(`select id, nome from providers where studio_id = $1`, [studio.id]);
  const catalogo = await query<{ nome: string; durata_min: number; colore: string | null }>(`select nome, durata_min, colore from prestazioni_catalogo where studio_id = $1`, [studio.id]);
  // Il giorno si può dare: «npx tsx scripts/demo-agenda.ts 2026-09-17», e
  // «domani» per la riunione del giorno dopo. Senza argomento è oggi.
  const arg = (process.argv[2] ?? '').trim();
  const giornoDa = (v: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date();
    if (v === 'domani') d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const oggi = giornoDa(arg);

  const via = await query(`delete from appointments where studio_id = $1 and external_uid like $2 returning id`, [studio.id, `demo-${oggi}-%`]);
  if (via.length) console.log(`tolti ${via.length} appuntamenti della demo precedente`);

  let n = 0; let iGente = 0; let iCartella = 0;
  for (const blocco of GIORNATA) {
    const m = medici.find((x) => x.nome === blocco.medico);
    if (!m) { console.log(`medico non trovato, salto: ${blocco.medico}`); continue; }
    const pres = catalogo.find((c) => c.nome === blocco.prestazione);
    for (const ora of blocco.ore) {
      // Un paziente su tre ha anche la cartella: gli altri sono «solo in
      // agenda», che è la situazione più comune anche nello studio vero.
      let nomeAgenda: string;
      if (n % 3 === 0 && iCartella < IN_CARTELLA.length) {
        const [cog, nom] = IN_CARTELLA[iCartella++];
        nomeAgenda = `${cog} ${nom}`;
      } else {
        const [cog, nom, nato] = GENTE[iGente++ % GENTE.length];
        nomeAgenda = `${cog} ${nom} (${nato.split('-').reverse().join('.')} / N° ${900000 + iGente})`;
      }
      const inizio = alle(oggi, ora);
      const fine = new Date(inizio.getTime() + (pres?.durata_min ?? 30) * 60000);
      await query(
        `insert into appointments (studio_id, provider_id, starts_at, ends_at, titolo, paziente_nome, motivo, colore, external_uid, stato_medionline)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'fissato')`,
        [studio.id, m.id, inizio.toISOString(), fine.toISOString(), nomeAgenda, nomeAgenda, blocco.prestazione, pres?.colore ?? null, `demo-${oggi}-${n}`]
      );
      n++;
    }
  }
  console.log(`giornata inventata: ${n} appuntamenti di oggi (${oggi}) in «${studio.nome}»`);
  const conta = await query<{ medico: string; quanti: string }>(
    `select p.nome as medico, count(*)::text as quanti from appointments a join providers p on p.id = a.provider_id
     where a.studio_id = $1 and a.starts_at::date = $2::date group by p.nome order by p.nome`, [studio.id, oggi]);
  for (const r of conta) console.log(`  ${r.medico}: ${r.quanti}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
