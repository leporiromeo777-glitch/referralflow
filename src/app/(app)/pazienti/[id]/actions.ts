'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/cartella';
import { generaOllama } from '@/lib/ollama';

// Controllo AI nel tempo: confronta i referti confermati del paziente e
// segnala variazioni numeriche importanti o incoerenze tra un referto e
// l'altro. SOLO osservazioni sui dati forniti, mai diagnosi; il risultato
// resta sulla scheda finché non viene rigenerato.
export async function controlloNelTempo(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) redirect('/pazienti');

  const [paz] = await query<{ cognome: string; nome: string }>(
    'select cognome, nome from patients where id = $1 and studio_id = $2',
    [id, session.studioId]
  );
  if (!paz) redirect('/pazienti');

  const referti = await query<{ testo: string; quando: string }>(
    `select coalesce(testo_finale, payload ->> 'testo_corretto') as testo,
            to_char(created_at, 'DD.MM.YYYY') as quando
       from referti_bozze
      where studio_id = $1 and stato = 'confermata'
        and (lower(payload -> 'campi_estratti' ->> 'nome_paziente') = lower($2)
             or lower(payload -> 'campi_estratti' ->> 'nome_paziente') = lower($3))
      order by created_at asc limit 6`,
    [session.studioId, `${paz.cognome} ${paz.nome}`, `${paz.nome} ${paz.cognome}`]
  );

  if (referti.length < 2) {
    redirect(`/pazienti/${id}?ai=pochi`);
  }

  const corpo = referti
    .map((r) => `REFERTO DEL ${r.quando}:\n${r.testo.slice(0, 1800)}`)
    .join('\n\n');
  const prompt = [
    'Sei un assistente di controllo qualità in uno studio cardiologico. Qui sotto ci sono',
    'i referti dello stesso paziente in ordine di data. Confrontali e segnala SOLO:',
    '- valori numerici che cambiano in modo marcato tra un referto e l\'altro (cita i due valori e le date);',
    '- incoerenze evidenti (es. lato destro/sinistro, esami citati e poi smentiti).',
    'Regole: non inventare MAI valori; cita solo numeri presenti nei testi; niente diagnosi',
    'né consigli terapeutici; elenco puntato breve in italiano. Se non c\'è nulla da',
    'segnalare, scrivi esattamente: Nessuna osservazione.',
    '',
    corpo,
  ].join('\n');

  const esito = await generaOllama(prompt, { timeoutMs: 150_000 });
  if (esito) {
    await query(
      'update patients set controllo_ai = $3, controllo_ai_at = now() where id = $1 and studio_id = $2',
      [id, session.studioId, esito.slice(0, 4000)]
    );
    revalidatePath(`/pazienti/${id}`);
    redirect(`/pazienti/${id}`);
  }
  redirect(`/pazienti/${id}?ai=errore`);
}
