'use client';

import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/password-input';

export function PasswordConfirmationFields({ serverError = '' }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [initialServerError, setInitialServerError] = useState(serverError);
  const confirmationRef = useRef(null);
  const passwordsDoNotMatch = confirmation.length > 0 && password !== confirmation;
  const errorMessage = passwordsDoNotMatch ? 'Passwords do not match.' : initialServerError;

  useEffect(() => {
    confirmationRef.current?.setCustomValidity(errorMessage);
  }, [errorMessage]);

  function updatePassword(value) {
    setInitialServerError('');
    setPassword(value);
  }

  function updateConfirmation(value) {
    setInitialServerError('');
    setConfirmation(value);
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(event) => updatePassword(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">Confirm password</Label>
        <PasswordInput
          ref={confirmationRef}
          id="confirm_password"
          name="confirm_password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => updateConfirmation(event.target.value)}
          aria-invalid={Boolean(errorMessage) || undefined}
          aria-describedby="confirm-password-error"
        />
        <p
          id="confirm-password-error"
          aria-live="polite"
          className="min-h-4 text-xs text-destructive"
        >
          {errorMessage}
        </p>
      </div>
    </>
  );
}
