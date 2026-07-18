'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { confirmSetup, finishSetup, type ConfirmState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? 'Verifica…' : 'Attiva la 2FA'}
    </button>
  );
}

export function ConfirmForm() {
  const [state, formAction] = useFormState<ConfirmState, FormData>(confirmSetup, {});

  // Codice giusto: i codici di recupero si vedono SOLO qui, una volta.
  // La 2FA si accende davvero solo col bottone qui sotto (finishSetup).
  if (state.recoveryCodes) {
    return (
      <div className="recovery-done">
        <p className="ok-line">✓ Codice corretto. Ultimo passo:</p>
        <p>
          <strong>Salvi subito questi codici di recupero</strong> (li stampi o
          li metta in un posto sicuro): servono per entrare se perde il telefono.
          Ognuno funziona una volta sola e non verranno mostrati mai più.
        </p>
        <ul className="recovery-codes">
          {state.recoveryCodes.map((c) => (
            <li key={c}><code>{c}</code></li>
          ))}
        </ul>
        <form action={finishSetup}>
          <button className="btn btn-primary" type="submit">Ho salvato i codici — attiva la 2FA</button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="feed-form">
      <label>
        Codice a 6 cifre mostrato dall&rsquo;app
        <input name="code" inputMode="numeric" autoComplete="one-time-code"
          placeholder="000000" required className="code-input" />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
