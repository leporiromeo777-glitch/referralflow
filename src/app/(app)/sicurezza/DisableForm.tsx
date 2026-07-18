'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { disable2fa, type DisableState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-ghost btn-small" type="submit" disabled={pending}>
      {pending ? 'Verifica…' : 'Disattiva la 2FA'}
    </button>
  );
}

export function DisableForm() {
  const [state, formAction] = useFormState<DisableState, FormData>(disable2fa, {});
  return (
    <form action={formAction} className="disable-2fa">
      <label>
        Per disattivare, inserisca un codice valido (dall&rsquo;app o di recupero)
        <input name="code" autoComplete="one-time-code" placeholder="000000 oppure abcd-efgh"
          required className="code-input" />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
