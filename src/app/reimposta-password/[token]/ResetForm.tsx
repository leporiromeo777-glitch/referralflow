'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { doReset, type ResetState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary fp-send" type="submit" disabled={pending}>
      {pending ? 'Salvo…' : 'Imposta la nuova password'}
    </button>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useFormState<ResetState, FormData>(doReset, {});
  return (
    <form action={formAction} className="fp-form">
      <input type="hidden" name="token" value={token} />
      <label>
        Nuova password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label>
        Ripeti la password
        <input name="password2" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <p className="muted small">Almeno 8 caratteri.</p>
      {state.error && <p className="error">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
