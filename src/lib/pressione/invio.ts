import 'server-only';
import { createHash } from 'crypto';
import { query } from '../db';
import { putFile } from '../storage';
import { abbinaPaziente } from '../imaging-ordina';
import { leggiFile } from './calcolo';
import { DOCX, allegaReferto, caricaProfilo, impostaGiornoNotte } from './archivio';
import { validaInvio } from './invio-regole';

// Pressione: l'invio dal generatore dei referti Aktiia (20.10.2026,
// [[Piattaforma/Pressione]]). Arriva solo ciò che il medico ha CONFERMATO nel
// generatore. Stessa regola severa della cartella condivisa: nome E data di
// nascita, una persona sola. Se combacia nasce il profilo (con giorno/notte
// del referto) e il referto Word entra nei documenti del paziente; se no
// l'invio aspetta fra gli «arrivi da assegnare», col referto, e una persona
// sceglie. Non si indovina mai. Nei log solo conteggi.

export async function studioDaChiave(intestazione: string | null): Promise<string | null> {
  const a = intestazione ?? '';
  const chiave = a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  if (!chiave) return null;
  const hash = createHash('sha256').update(chiave).digest('hex');
  const [s] = await query<{ id: string }>(`select id from studios where pressione_token_hash = $1 and attivo = true`, [hash]);
  return s?.id ?? null;
}

export type EsitoInvio =
  | { stato: 201; esito: 'nel_profilo'; misure: number; scartate: number; referto: boolean }
  | { stato: 202; esito: 'da_assegnare'; motivo: string; misure: number }
  | { stato: 200; esito: 'gia_presente' | 'gia_in_attesa' }
  | { stato: 400; errore: string };

export async function riceviInvio(studioId: string, corpo: unknown): Promise<EsitoInvio> {
  const v = validaInvio(corpo);
  if ('errore' in v) return { stato: 400, errore: v.errore };
  const letto = leggiFile(v.testo);
  if (letto.errore) return { stato: 400, errore: letto.errore };
  if (letto.misure.length < 10) return { stato: 400, errore: `Solo ${letto.misure.length} misure leggibili: troppo poche per un profilo.` };

  const pazienti = await query<{ id: string; cognome: string; nome: string; data_nascita: string | null }>(
    `select id, cognome, nome, data_nascita::text from patients where studio_id = $1`, [studioId]);
  const abbinato = abbinaPaziente(v.chi.nome, v.chi.nascita, pazienti);

  if (abbinato.id) {
    const c = await caricaProfilo(studioId, null, abbinato.id, { testo: v.testo, apparecchio: v.apparecchio });
    if ('errore' in c) {
      if (c.stato === 409) return { stato: 200, esito: 'gia_presente' };
      return { stato: 400, errore: c.errore };
    }
    await impostaGiornoNotte(c.id, v.sveglia, v.sonno);
    if (v.referto) await allegaReferto(studioId, abbinato.id, null, { dati: v.referto.dati, nome: v.referto.nome });
    console.log(`[pressione] invio Aktiia: profilo con ${c.misure} misure${v.referto ? ' e referto' : ''}`);
    return { stato: 201, esito: 'nel_profilo', misure: c.misure, scartate: c.scartate, referto: !!v.referto };
  }

  const inizio = letto.misure[0].quando, fine = letto.misure[letto.misure.length - 1].quando;
  // Lo stesso invio rimandato mentre aspetta ancora: non si raddoppia.
  const [gia] = await query<{ id: string }>(
    `select id from pa_arrivi where studio_id = $1 and stato = 'in_attesa' and nome_letto = $2 and nascita_letta = $3::date and inizio = $4::timestamp`,
    [studioId, v.chi.nome, v.chi.nascita, inizio]);
  if (gia) return { stato: 200, esito: 'gia_in_attesa' };
  const chiave = v.referto ? await putFile(v.referto.dati, DOCX, '.docx') : null;
  await query(
    `insert into pa_arrivi (studio_id, nome_file, testo, misure, inizio, fine, nome_letto, nascita_letta, stato, motivo, impostazioni, referto_key, referto_nome)
     values ($1,$2,$3,$4,$5::timestamp,$6::timestamp,$7,$8::date,'in_attesa',$9,$10,$11,$12)`,
    [studioId, `Generatore Aktiia${v.referto ? ` · ${v.referto.nome}` : ''}`.slice(0, 200), v.testo, letto.misure.length, inizio, fine,
     v.chi.nome, v.chi.nascita, abbinato.motivo, JSON.stringify({ sveglia: v.sveglia, sonno: v.sonno, apparecchio: v.apparecchio }), chiave, v.referto?.nome ?? null]);
  console.log(`[pressione] invio Aktiia: da assegnare (${abbinato.motivo}), ${letto.misure.length} misure`);
  return { stato: 202, esito: 'da_assegnare', motivo: abbinato.motivo, misure: letto.misure.length };
}
