'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { verify2fa } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? 'Verifica…' : 'Conferma'}
    </button>
  );
}

export function VerifyForm() {
  const [state, formAction] = useFormState(verify2fa, {});
  return (
    <form action={formAction} className="card auth-card">
      <div className="brand brand-lg">
        Referral<span>Flow</span>
      </div>
      <p className="muted center">Verifica in due passaggi</p>
      <label>
        Codice a 6 cifre dall&rsquo;app di autenticazione
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          required
        />
      </label>
      <p className="muted small">
        Ha perso l&rsquo;accesso all&rsquo;app? Inserisca qui sopra uno dei codici di
        recupero salvati all&rsquo;attivazione (es. <code>abcd-efgh</code>).
      </p>
      {state?.error && <p className="error">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
