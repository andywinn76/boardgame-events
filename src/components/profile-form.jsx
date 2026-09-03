'use client';

import { useActionState, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { updateProfile } from '@/app/settings/actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { AvatarUploader } from '@/components/avatar-uploader';

const initialState = { status: 'idle', message: '', noticeId: null };

export function ProfileForm({ profile, userId }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [preferredPronouns, setPreferredPronouns] = useState(profile?.preferred_pronouns || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [gamesYesPlease, setGamesYesPlease] = useState(profile?.games_yes_please || '');
  const [gamesNoThanks, setGamesNoThanks] = useState(profile?.games_no_thanks || '');
  const [dismissedNoticeId, setDismissedNoticeId] = useState(null);
  const [fadingNoticeId, setFadingNoticeId] = useState(null);
  const noticeVisible = state.status !== 'idle' && state.noticeId !== dismissedNoticeId;
  const noticeFading = state.noticeId === fadingNoticeId;

  useEffect(() => {
    if (!state.noticeId) return;

    const noticeId = state.noticeId;
    const fadeTimer = window.setTimeout(() => setFadingNoticeId(noticeId), 4500);
    const hideTimer = window.setTimeout(() => setDismissedNoticeId(noticeId), 5000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [state.noticeId]);

  function dismissNotice() {
    setFadingNoticeId(state.noticeId);
    window.setTimeout(() => setDismissedNoticeId(state.noticeId), 200);
  }

  return (
    <>
      {noticeVisible && state.status !== 'idle' && (
        <Alert
          variant={state.status === 'error' ? 'destructive' : 'default'}
          className={`transition-opacity duration-500 ${noticeFading ? 'opacity-0' : 'opacity-100'} ${
            state.status === 'success'
              ? 'border-green-300 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : ''
          }`}
        >
          <AlertDescription
            className={`px-8 text-center ${
              state.status === 'success' ? 'text-green-900 dark:text-green-200' : ''
            }`}
          >
            {state.message}
          </AlertDescription>
          <AlertAction>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={dismissNotice}
              className="inline-flex size-6 items-center justify-center rounded-md text-current/70 hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </AlertAction>
        </Alert>
      )}

      <div className={noticeVisible ? 'mt-4' : ''}>
        <AvatarUploader userId={userId} initialAvatarUrl={profile?.avatar_url} />
      </div>

      <form action={formAction} className="mt-5 space-y-4">
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
        <div className="space-y-4 border-t border-border pt-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">About Me</h2>
          <div className="space-y-1.5">
            <Label htmlFor="bio">About me</Label>
            <Textarea
              id="bio"
              name="bio"
              maxLength={1000}
              rows={4}
              placeholder="Tell other players a little about yourself"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="games_yes_please">Yes please</Label>
            <Textarea
              id="games_yes_please"
              name="games_yes_please"
              maxLength={1000}
              rows={3}
              placeholder="Games and genres I love"
              value={gamesYesPlease}
              onChange={(event) => setGamesYesPlease(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="games_no_thanks">No thanks</Label>
            <Textarea
              id="games_no_thanks"
              name="games_no_thanks"
              maxLength={1000}
              rows={3}
              placeholder="Games and genres I don't want to play"
              value={gamesNoThanks}
              onChange={(event) => setGamesNoThanks(event.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Updating…' : 'Update profile'}
        </Button>
      </form>
    </>
  );
}
