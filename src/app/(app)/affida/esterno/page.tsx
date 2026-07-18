import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { documentiPaziente, CATEGORIE, DocumentoPaziente, isUuid } from '@/lib/cartella';
import { inviaAdEsterno } from '../actions';

export const dynamic = 'force-dynamic';

// Affida un paziente a uno studio esterno (fuori piattaforma): lo studio
// riceve una email neutra con un link sicuro dove vede i dettagli e risponde.

export default async function AffidaEsterno({
  searchParams,
}: {
  searchParams: { e?: string; err?: string; paz?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [ext] = await query<{
    id: string; nome: string; specialita: string | null; email: string;
    telefono: string | null; n_precedenti: number;
  }>(
    `select es.id, es.nome, es.specialita, es.email, es.telefono,
            count(er.id)::int as n_precedenti
       from external_studios es
       left join external_referrals er on er.external_studio_id = es.id
      where es.id = $1 and es.studio_id = $2 and es.attivo = true
      group by es.id`,
    [searchParams.e ?? '', session.studioId]
  );
  if (!ext) notFound();

  // Paziente già scelto (da una referral): dati compilati e cartella allegabile.
  type Paz = {
    id: string; cognome: string; nome: string;
    data_nascita: string | null; telefono: string | null;
  };
  let paziente: Paz | null = null;
  let dossier: DocumentoPaziente[] = [];
  if (searchParams.paz && isUuid(searchParams.paz)) {
    const [p] = await query<Paz>(
      `select id, cognome, nome, data_nascita::text, telefono
         from patients where id = $1 and studio_id = $2`,
      [searchParams.paz, session.studioId]
    );
    paziente = p ?? null;
    if (paziente) dossier = await documentiPaziente(paziente.id, session.studioId);
  }

  return (
    <>
      <div className="page-head">
        <Link href="/affida" className="back">← Affida paziente</Link>
        <h1>Affida a {ext.nome}</h1>
        <span className="badge">esterno</span>
      </div>
      <p className="muted">
        {ext.nome} riceverà una email neutra (senza dati del paziente) con un link
        sicuro: lì vedrà i dettagli e risponderà «prendiamo in carico» o «non possiamo».
        Seguirai la risposta da «Inviati».
      </p>

      {ext.n_precedenti === 0 && (
        <div className="card notice first-send">
          <p>
            <strong>Primo affido a questo studio?</strong> Anticipa l'email con una
            telefonata («vi arriva una mail da ReferralFlow con i dettagli»): così la
            segreteria la aspetta e non la scambia per una mail sospetta.
          </p>
          {ext.telefono && (
            <a className="btn btn-small" href={`tel:${ext.telefono.replace(/\s+/g, '')}`}>
              ☎ Chiama {ext.nome} ({ext.telefono})
            </a>
          )}
        </div>
      )}

      <form action={inviaAdEsterno} className="card form">
        <input type="hidden" name="external_studio_id" value={ext.id} />
        {paziente && <input type="hidden" name="paz" value={paziente.id} />}

        {searchParams.err === 'nome' && (
          <p className="error">Inserisci cognome e nome del paziente.</p>
        )}
        {searchParams.err === 'email' && (
          <p className="error">
            Invio email non riuscito: il link non arriverebbe allo studio. Controlla la
            configurazione SMTP o riprova.
          </p>
        )}
        {searchParams.err === 'consenso' && (
          <p className="error">
            Per inviare documenti della cartella serve la conferma del consenso del paziente.
          </p>
        )}

        <fieldset>
          <legend>Paziente</legend>
          <div className="grid2">
            <label>Cognome *<input name="cognome" required maxLength={120}
              defaultValue={paziente?.cognome ?? ''} /></label>
            <label>Nome *<input name="nome" required maxLength={120}
              defaultValue={paziente?.nome ?? ''} /></label>
            <label>Data di nascita<input name="data_nascita" type="date"
              defaultValue={paziente?.data_nascita ?? ''} /></label>
            <label>Telefono<input name="telefono" type="tel" maxLength={40}
              defaultValue={paziente?.telefono ?? ''} /></label>
          </div>
        </fieldset>

        {paziente && dossier.length > 0 && (
          <fieldset>
            <legend>Documenti dalla cartella del paziente</legend>
            {dossier.map((d) => (
              <label key={d.id} className="check-line" style={{ fontWeight: 400 }}>
                <input type="checkbox" name="doc_ids" value={d.id} />{' '}
                {d.filename} <span className="tmeta">({CATEGORIE[d.categoria] ?? d.categoria})</span>
              </label>
            ))}
            <label className="check-line" style={{ marginTop: 8 }}>
              <input type="checkbox" name="consenso" value="1" />{' '}
              Il paziente acconsente alla trasmissione dei documenti selezionati
              allo studio destinatario (obbligatorio se si allegano documenti)
            </label>
          </fieldset>
        )}

        <fieldset>
          <legend>Richiesta</legend>
          <label>Quesito clinico
            <textarea name="quesito" rows={3} maxLength={2000}
              placeholder="Motivo dell'invio e prestazione richiesta…" />
          </label>
          <label>Urgenza
            <select name="urgenza" defaultValue="normale">
              <option value="urgente">Urgente</option>
              <option value="normale">Normale</option>
              <option value="programmabile">Programmabile</option>
            </select>
          </label>
          <label>Allegati (ECG, lettera — facoltativi, max 5 file da 10 MB)
            <input type="file" name="allegati" multiple accept=".pdf,.png,.jpg,.jpeg" />
          </label>
        </fieldset>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Invia l'affido</button>
        </div>
        <p className="tmeta">
          Il link è riservato e scade automaticamente dopo 60 giorni.
        </p>
      </form>
    </>
  );
}
