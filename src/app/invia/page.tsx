import { query } from '@/lib/db';
import { createWebsiteReferral } from './actions';
import { slotProposti } from '@/lib/slot';

export const dynamic = 'force-dynamic';

// Modulo pubblico d'invio referral, pensato per essere linkato (bottone) dal sito
// web dello studio. Senza token: il medico si presenta da solo.
// Multi-studio: lo studio destinatario arriva da ?s=<slug>; se la piattaforma ha
// un solo studio, il parametro può mancare (retrocompatibilità col link già condiviso).

type Studio = { id: string; nome: string; slug: string };

async function resolveStudio(slug?: string): Promise<Studio | null> {
  if (slug) {
    const [s] = await query<Studio>(
      'select id, nome, slug from studios where slug = $1 and attivo',
      [slug]
    );
    return s ?? null;
  }
  const studios = await query<Studio>('select id, nome, slug from studios limit 2');
  return studios.length === 1 ? studios[0] : null;
}

export default async function InviaPubblico({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; s?: string };
}) {
  const studio = await resolveStudio(searchParams.s);

  if (!studio) {
    return (
      <main className="public">
        <div className="brand brand-lg center">Referral<span>Flow</span></div>
        <div className="card notice">
          <h2>Link non valido</h2>
          <p className="muted">
            Questo link non indica a quale studio inviare la referral. Usi il link
            presente sul sito web dello studio a cui vuole inviare il paziente.
          </p>
        </div>
      </main>
    );
  }

  const base = `/invia?s=${studio.slug}`;
  const slots = searchParams.ok ? [] : await slotProposti(studio.id);

  return (
    <main className="public">
      <div className="brand brand-lg center">Referral<span>Flow</span></div>
      <p className="muted center">{studio.nome} — invio referral per medici</p>

      {searchParams.ok ? (
        <div className="card notice">
          <h2>Referral inviata ✓</h2>
          <p className="muted">
            Grazie. La segreteria prenderà in carico la richiesta e contatterà il paziente;
            riceverà gli aggiornamenti all'indirizzo email indicato. Può chiudere questa
            pagina o inviare un'altra richiesta.
          </p>
          <a className="btn" href={base}>Invia un'altra referral</a>
        </div>
      ) : (
        <form action={createWebsiteReferral} className="card form">
          <input type="hidden" name="studio_slug" value={studio.slug} />
          {/* honeypot anti-spam: non rimuovere, resta invisibile */}
          <input type="text" name="sito_web" tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: 'absolute', left: '-5000px', width: 1, height: 1 }} />

          {searchParams.error === 'medico' && (
            <p className="error">Inserisca il suo nome e un indirizzo email valido.</p>
          )}
          {searchParams.error === 'nome' && (
            <p className="error">Inserisca cognome e nome del paziente.</p>
          )}

          <fieldset>
            <legend>Medico inviante</legend>
            <div className="grid2">
              <label>Nome e cognome *<input name="medico_nome" required maxLength={120} /></label>
              <label>Studio<input name="medico_studio" maxLength={120} /></label>
              <label>Email *<input name="medico_email" type="email" required maxLength={160} /></label>
              <label>Telefono<input name="medico_telefono" type="tel" maxLength={40} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Paziente</legend>
            <div className="grid2">
              <label>Cognome *<input name="cognome" required maxLength={120} /></label>
              <label>Nome *<input name="nome" required maxLength={120} /></label>
              <label>Data di nascita<input name="data_nascita" type="date" /></label>
              <label>Telefono<input name="telefono" type="tel" maxLength={40} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Richiesta</legend>
            <label>Quesito clinico
              <textarea name="quesito" rows={3} maxLength={2000} placeholder="Motivo dell'invio…" />
            </label>
            <label>Urgenza
              <select name="urgenza" defaultValue="normale">
                <option value="urgente">Urgente</option>
                <option value="normale">Normale</option>
                <option value="programmabile">Programmabile</option>
              </select>
            </label>
            <label>Allegati (ECG, lettera, esami — facoltativi, max 5 file da 10 MB)
              <input type="file" name="allegati" multiple accept=".pdf,.png,.jpg,.jpeg" />
            </label>
          </fieldset>

          {slots.length > 0 && (
            <fieldset>
              <legend>Quando preferirebbe? (facoltativo)</legend>
              <p className="muted small">
                Slot indicativi liberi. La segreteria conferma e ricontatta il paziente.
              </p>
              <div className="slot-scelta">
                {slots.map((s) => (
                  <label key={s.iso} className="slot-opt">
                    <input type="radio" name="slot_proposto" value={s.iso} />
                    <span>{s.label}</span>
                  </label>
                ))}
                <label className="slot-opt">
                  <input type="radio" name="slot_proposto" value="" defaultChecked />
                  <span>Indifferente</span>
                </label>
              </div>
            </fieldset>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Invia referral</button>
          </div>
        </form>
      )}
      <p className="muted small center">
        I dati inseriti sono trattati in modo conforme alla nLPD e conservati in Svizzera.
        {' '}<a href="/privacy">Informativa privacy</a>
      </p>
    </main>
  );
}
