import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { totpUri } from '@/lib/totp';
import { PageHero } from '../PageHero';
import { startSetup, cancelSetup } from './actions';
import { ConfirmForm } from './ConfirmForm';
import { DisableForm } from './DisableForm';
import { SetupHelpers } from './SetupHelpers';

export const dynamic = 'force-dynamic';

function dataBreve(d: string): string {
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Sicurezza dell'account: attivazione della verifica in due passaggi (TOTP).
// Aperta a tutti i ruoli — la 2FA è personale, non dello studio.
export default async function Sicurezza() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [u] = await query<{
    email: string; totp_secret: string | null; totp_enabled_at: string | null;
  }>('select email, totp_secret, totp_enabled_at from users where id = $1', [session.id]);
  if (!u) redirect('/login');

  const setupInCorso = !!u.totp_secret && !u.totp_enabled_at;
  // Il QR e l'URI si generano in locale sul server: il segreto non passa mai
  // da servizi terzi.
  const uri = setupInCorso ? totpUri(u.totp_secret!, u.email) : '';
  const qr = setupInCorso ? await QRCode.toDataURL(uri, { width: 220, margin: 1 }) : null;

  return (
    <>
      <PageHero zone="green" eyebrow="Protezione dell'account" title="Sicurezza">
        La verifica in due passaggi (2FA) protegge l&rsquo;accesso anche se la password
        finisce nelle mani sbagliate: oltre alla password serve un codice dal suo
        telefono, che cambia ogni 30 secondi.
      </PageHero>

      {u.totp_enabled_at ? (
        <div className="card">
          <h2>Verifica in due passaggi: attiva ✓</h2>
          <p className="muted">
            Attiva dal {dataBreve(u.totp_enabled_at)}. A ogni accesso, dopo la password,
            le viene chiesto il codice dell&rsquo;app di autenticazione.
          </p>
          <DisableForm />
        </div>
      ) : setupInCorso ? (
        <div className="card">
          <h2>Configurazione in corso</h2>
          <ol className="muted setup-steps">
            <li>
              Apra un&rsquo;app di autenticazione sul telefono (Google Authenticator,
              Microsoft Authenticator, Authy…) — gratuite, dall&rsquo;app store.
            </li>
            <li>Inquadri questo codice QR con l&rsquo;app (dal computer):</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr!} alt="Codice QR per l'app di autenticazione" className="qr-2fa" />
          <div className="card note setup-note">
            <p style={{ margin: 0 }}>
              <strong>Sta leggendo questa pagina dal telefono?</strong> Non può scansionare il QR
              del suo stesso schermo: tocchi <em>«Apri nell&rsquo;app»</em> (apre l&rsquo;app di
              autenticazione già compilata), oppure <em>«Copia la chiave»</em> e nell&rsquo;app
              scelga «Inserisci una chiave di configurazione».
            </p>
          </div>
          <SetupHelpers secret={u.totp_secret!} uri={uri} />
          <p className="tmeta">
            Chiave (se preferisce inserirla a mano):{' '}
            <code className="totp-secret">{u.totp_secret}</code>
          </p>
          <ol className="muted setup-steps" start={3}>
            <li>Inserisca qui sotto il codice a 6 cifre che l&rsquo;app mostra ora:</li>
          </ol>
          <ConfirmForm />
          <form action={cancelSetup} style={{ marginTop: 12 }}>
            <button className="btn btn-ghost btn-small" type="submit">Annulla configurazione</button>
          </form>
        </div>
      ) : (
        <div className="card">
          <h2>Verifica in due passaggi: non attiva</h2>
          <p className="muted">
            Consigliata a tutti — in uno studio medico è la protezione più efficace
            contro il furto di password. Serve solo un telefono con un&rsquo;app di
            autenticazione gratuita. L&rsquo;attivazione richiede due minuti.
          </p>
          <form action={startSetup}>
            <button className="btn btn-primary" type="submit">Attiva la 2FA</button>
          </form>
        </div>
      )}
    </>
  );
}
