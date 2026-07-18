import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { updateStudio } from './actions';

export const dynamic = 'force-dynamic';

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
  }>(
    'select nome, slug, specialita, telefono, notify_email from studios where id = $1',
    [session.studioId]
  );
  if (!studio) redirect('/');

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
    </>
  );
}
