'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { login } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? 'Accesso…' : 'Accedi'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(login, {});
  return (
    <form action={formAction} className="card auth-card">
      <div className="brand brand-lg">
        Referral<span>Flow</span>
      </div>
      <p className="muted center">La piattaforma delle referral tra studi medici</p>
      <label>
        Email
        <input name="email" type="email" required autoComplete="username" />
      </label>
      <label>
        Password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <p className="fp-forgot-link">
        <a href="/password-dimenticata">Password dimenticata?</a>
      </p>
      {state?.error && <p className="error">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
