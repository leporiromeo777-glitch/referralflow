import 'server-only';
import { query } from './db';
import { destinatarioDi } from './dittafono-foglio';
import { profiloMedico } from './referti-medici';
import { cercaSimili } from './somiglianza-nomi';

// «Detto la lettera all'indirizzo del dottor … per il paziente …» (15.10.2026, richiesta dello studio, [[Piattaforma/Dittafono]]):
// il medico si cerca nella rubrica degli invianti, il paziente in cartella, con nomi anche un po' storpiati
// (src/lib/somiglianza-nomi.ts). Se uno solo somiglia chiaramente si usa; se più d'uno, si propongono; se nessuno, si dice.
// Nei log solo l'esito, mai i nomi.

type Persona = { id: string; nome: string };
export type MedicoTrovato = Persona & { destinatario: string; saluto: string };
export type PazienteTrovato = Persona & { nascita: string | null };
export type Esito<T> = { stato: 'trovato' | 'scegli' | 'nessuno'; scelta: T | null; alternative: T[] };

export async function cercaIndirizzo(studioId: string, a: { medicoNome: string; pazienteNome: string; nascita: string | null; donna: boolean; profilo: string | null }):
  Promise<{ medico: Esito<MedicoTrovato> | null; paziente: Esito<PazienteTrovato> | null }> {
  let medico: Esito<MedicoTrovato> | null = null, paziente: Esito<PazienteTrovato> | null = null;
  if (a.medicoNome.trim()) {
    const rubrica = await query<{ id: string; nome: string; specialita: string | null; email: string | null; hin_address: string | null }>(
      'select id, nome, specialita, email, hin_address from referring_doctors where studio_id = $1', [studioId]);
    const formato = (await profiloMedico(studioId, a.profilo))?.formato ?? 'rapporto';
    const di = (d: (typeof rubrica)[number]): MedicoTrovato => ({ id: d.id, nome: d.nome, destinatario: destinatarioDi(d, formato, a.donna), saluto: formato === 'lettera' ? (a.donna ? 'Cara collega,' : 'Caro collega,') : '' });
    const r = cercaSimili(a.medicoNome, rubrica, (d) => d.nome);
    medico = { stato: r.scelta ? 'trovato' : r.alternative.length ? 'scegli' : 'nessuno', scelta: r.scelta ? di(r.scelta) : null, alternative: r.alternative.map(di) };
  }
  if (a.pazienteNome.trim()) {
    let cartella = await query<{ id: string; cognome: string; nome: string; nascita: string | null }>(
      `select id, cognome, nome, to_char(data_nascita, 'DD.MM.YYYY') as nascita from patients where studio_id = $1`, [studioId]);
    // detta anche la data di nascita: vale quella
    if (a.nascita) { const stessa = cartella.filter((p) => p.nascita === a.nascita); if (stessa.length) cartella = stessa; }
    const di = (p: (typeof cartella)[number]): PazienteTrovato => ({ id: p.id, nome: `${p.cognome} ${p.nome}`.trim(), nascita: p.nascita });
    const r = cercaSimili(a.pazienteNome, cartella, (p) => `${p.cognome} ${p.nome}`);
    paziente = { stato: r.scelta ? 'trovato' : r.alternative.length ? 'scegli' : 'nessuno', scelta: r.scelta ? di(r.scelta) : null, alternative: r.alternative.map(di) };
  }
  console.log(`[dittafono-comando] indirizzo medico=${medico?.stato ?? '-'} paziente=${paziente?.stato ?? '-'}`);
  return { medico, paziente };
}
