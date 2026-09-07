import 'server-only';
import { query } from './db';
import { registraEvento, impronta } from './referti-eventi';

// «Word» e «PDF» dalla pagina della bozza (2026-09-07, richiesta
// dell'utente: le modifiche fatte nella revisione guidata non arrivavano nel
// Word scaricato). I due bottoni ora INVIANO il modulo della revisione
// (testo com'è nella casella + campi estratti corretti): qui si salva tutto
// nel referto, come «Inserisci nel referto», e poi si genera il documento
// dal testo salvato. Solo sulle bozze aperte; su un referto confermato non
// si tocca nulla. Mai contenuti nei log.

const MAX_TESTO = 200_000;

export async function salvaDalModulo(
  form: FormData | null,
  studioId: string,
  bozzaId: string,
  utenteId: string,
  origine: 'word' | 'pdf'
): Promise<void> {
  if (!form) return;
  const testo = String(form.get('testo') ?? '').slice(0, MAX_TESTO);
  const campi: Record<string, string> = {};
  form.forEach((v, k) => {
    if (k.startsWith('campo__') && typeof v === 'string') {
      campi[k.slice('campo__'.length).slice(0, 80)] = v.trim().slice(0, 2000);
    }
  });
  if (!testo.trim()) return;
  const conCampi = Object.keys(campi).length > 0;
  const [agg] = await query<{ id: string }>(
    `update referti_bozze
        set testo_finale = $3,
            campi_confermati = case when $4::boolean then $5::jsonb else campi_confermati end
      where id = $1 and studio_id = $2 and stato = 'bozza'
      returning id`,
    [bozzaId, studioId, testo, conCampi, JSON.stringify(campi)]
  );
  if (agg) {
    await registraEvento(studioId, bozzaId, 'testo_salvato', utenteId, {
      impronta_testo: impronta(testo), caratteri: testo.length, origine,
    });
  }
}
