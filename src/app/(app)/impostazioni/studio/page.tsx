import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  updateStudio, generaRefertiToken, revocaRefertiToken,
  aggiungiFinestra, rimuoviFinestra,
} from './actions';

export const dynamic = 'force-dynamic';

const GIORNI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

// Dati dello studio, modificabili dall'admin (il middleware recinta
// /impostazioni al solo admin). Lo slug resta fisso: è nei link condivisi.

export default async function ImpostazioniStudio({
  searchParams,
}: {
  searchParams: { ok?: string; err?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [studio] = await query<{
    nome: string; slug: string; specialita: string | null;
    telefono: string | null; notify_email: string | null;
    referti_token_set_at: string | null;
  }>(
    `select nome, slug, specialita, telefono, notify_email,
            referti_token_set_at::text
       from studios where id = $1`,
    [session.studioId]
  );
  if (!studio) redirect('/');

  // Token appena generato: si mostra una volta sola (cookie flash di 2 minuti),
  // poi resta solo l'hash in tabella.
  const tokenNuovo = cookies().get('rf_referti_token')?.value ?? null;

  const finestre = await query<{
    id: string; giorno: number; ora_inizio: string; ora_fine: string; durata_min: number;
  }>(
    `select id, giorno, to_char(ora_inizio, 'HH24:MI') as ora_inizio,
            to_char(ora_fine, 'HH24:MI') as ora_fine, durata_min
       from slot_finestre where studio_id = $1
      order by giorno, ora_inizio`,
    [session.studioId]
  );

  return (
    <>
      <div className="page-head">
        <h1>Dati dello studio</h1>
      </div>
      <p className="muted">
        Questi dati compaiono in «Affida paziente» (nome e specialità aiutano gli
        altri studi a trovarvi), nel bottone di chiamata per le disdette (telefono)
        e negli avvisi email (email notifiche).
      </p>

      {searchParams.ok && (
        <div className="card notice"><p>Dati aggiornati ✓</p></div>
      )}
      {searchParams.err === 'nome' && (
        <p className="error">Il nome dello studio è obbligatorio.</p>
      )}
      {searchParams.err === 'email' && (
        <p className="error">L'email delle notifiche non è valida.</p>
      )}

      <form action={updateStudio} className="card form">
        <div className="grid2">
          <label>Nome dello studio *
            <input name="nome" required maxLength={120} defaultValue={studio.nome} />
          </label>
          <label>Specialità (per la ricerca in «Affida paziente»)
            <input name="specialita" maxLength={200} defaultValue={studio.specialita ?? ''}
              placeholder="Es. Cardiologia: ecocardiogramma, holter, ergometria" />
          </label>
          <label>Telefono (per le disdette dei pazienti)
            <input name="telefono" type="tel" maxLength={40} defaultValue={studio.telefono ?? ''} />
          </label>
          <label>Email notifiche (nuove richieste, disdette)
            <input name="notify_email" type="email" maxLength={160}
              defaultValue={studio.notify_email ?? ''} />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Salva</button>
        </div>
      </form>

      <div className="card">
        <h2>Il vostro modulo pubblico</h2>
        <p className="muted">
          Il link da mettere sul sito dello studio e da dare ai medici invianti —
          le richieste arrivano direttamente nella coda:
        </p>
        <p><a href={`/invia?s=${studio.slug}`} target="_blank">/invia?s={studio.slug}</a></p>
      </div>

      <div className="card">
        <h2>Trascrizione referti (pipeline locale)</h2>
        <p className="muted">
          Token con cui il computer dello studio invia le bozze di referto
          trascritte a <code>/api/referti/bozza</code> (arrivano in «Bozze di
          referto»). È una credenziale: si mostra una volta sola alla
          generazione — copiala subito nella configurazione della pipeline.
          Rigenerarla invalida la precedente.
        </p>

        {tokenNuovo && (
          <div className="card notice">
            <p><strong>Nuovo token generato.</strong> Copialo ora: non verrà più mostrato.</p>
            <p><code style={{ wordBreak: 'break-all' }}>{tokenNuovo}</code></p>
          </div>
        )}

        {studio.referti_token_set_at && !tokenNuovo && (
          <p className="muted">
            Un token è attivo (generato il{' '}
            {new Date(studio.referti_token_set_at).toLocaleDateString('it-CH')}).
            Per motivi di sicurezza non è più visibile: se l'hai perso, rigeneralo.
          </p>
        )}

        <div className="form-actions" style={{ display: 'flex', gap: 8 }}>
          <form action={generaRefertiToken}>
            <button className="btn btn-primary" type="submit">
              {studio.referti_token_set_at ? 'Rigenera token' : 'Genera token'}
            </button>
          </form>
          {studio.referti_token_set_at && (
            <form action={revocaRefertiToken}>
              <button className="btn" type="submit">Revoca (disattiva l'invio)</button>
            </form>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Finestre di disponibilità (slot proposto)</h2>
        <p className="muted">
          Indica quando lo studio visita: dai moduli d'invio il sistema proporrà
          al medico i primi slot liberi (le finestre meno gli impegni già in agenda).
          È solo indicativo — la segreteria conferma l'appuntamento nella Coda;
          nulla viene scritto sull'agenda della Cassa dei Medici.
        </p>

        {searchParams.err === 'finestra' && (
          <p className="error">Controlla giorno, orari (fine dopo inizio) e durata (5–240 min).</p>
        )}

        {finestre.length === 0 ? (
          <p className="muted">
            Nessuna finestra configurata: gli slot proposti non compaiono nei moduli d'invio.
          </p>
        ) : (
          <ul className="finestre">
            {finestre.map((f) => (
              <li key={f.id}>
                <span>
                  <strong>{GIORNI[f.giorno]}</strong> {f.ora_inizio}–{f.ora_fine}
                  {' '}· slot da {f.durata_min} min
                </span>
                <form action={rimuoviFinestra}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn btn-ghost btn-small" type="submit">Rimuovi</button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={aggiungiFinestra} className="form" style={{ marginTop: 12 }}>
          <div className="grid2">
            <label>Giorno
              <select name="giorno" defaultValue="1">
                {[1, 2, 3, 4, 5, 6, 7].map((g) => (
                  <option key={g} value={g}>{GIORNI[g]}</option>
                ))}
              </select>
            </label>
            <label>Durata slot (minuti)
              <input name="durata_min" type="number" min={5} max={240} step={5} defaultValue={30} />
            </label>
            <label>Dalle
              <input name="ora_inizio" type="time" defaultValue="09:00" required />
            </label>
            <label>Alle
              <input name="ora_fine" type="time" defaultValue="12:00" required />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Aggiungi finestra</button>
          </div>
        </form>
      </div>
    </>
  );
}
