'use client';

import { useActionState, useState } from 'react';
import { updateProfile } from '@/app/settings/actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const initialState = { status: 'idle', message: '' };

export function ProfileForm({ profile }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [preferredPronouns, setPreferredPronouns] = useState(profile?.preferred_pronouns || '');

  return (
    <>
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === 'success' && (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">First name</Label>
            <Input
              id="first_name"
              name="first_name"
              type="text"
              required
              maxLength={80}
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">
              Last name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="last_name"
              name="last_name"
              type="text"
              maxLength={80}
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="preferred_pronouns">
            Preferred pronouns <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="preferred_pronouns"
            name="preferred_pronouns"
            type="text"
            list="pronoun-options"
            maxLength={80}
            placeholder="Select or enter your own"
            value={preferredPronouns}
            onChange={(event) => setPreferredPronouns(event.target.value)}
          />
          <datalist id="pronoun-options">
            <option value="he/him" />
            <option value="she/her" />
            <option value="they/them" />
          </datalist>
          <p className="text-xs text-muted-foreground">Choose a suggestion or type the pronouns you use.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={24}
            pattern="[a-z0-9_]+"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-describedby="username-help"
          />
          <p id="username-help" className="text-xs text-muted-foreground">
            3–24 lowercase letters, numbers, or underscores.
          </p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Updating…' : 'Update profile'}
        </Button>
      </form>
    </>
  );
}
