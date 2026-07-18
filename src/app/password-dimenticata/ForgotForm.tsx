'use client';

import { useFormStatus } from 'react-dom';
import { requestReset } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary fp-send" type="submit" disabled={pending}>
      {pending ? 'Invio…' : 'Invia il link'}
    </button>
  );
}

// Struttura ispirata al mockup (lucchetto, spiegazione, card del metodo, tasto
// grande in fondo), palette verde ReferralFlow.
export function ForgotForm() {
  return (
    <form action={requestReset} className="fp-form">
      <p className="muted center fp-lede">
        Inserisci l&rsquo;email del tuo accesso: ti mandiamo un link per scegliere una nuova
        password.
      </p>
      <div className="fp-method">
        <span className="fp-method-ic" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
          </svg>
        </span>
        <label className="fp-method-lb">
          Via email
          <input name="email" type="email" required autoComplete="username" placeholder="La tua email" />
        </label>
      </div>
      <SubmitButton />
    </form>
  );
}
