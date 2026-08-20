'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function numberOrNull(value) {
  return value ? Number(value) : null;
}

function milesToKilometers(value) {
  const miles = numberOrNull(value);
  return miles == null ? null : Math.round(miles * 1.609344);
}

function profileResult(status, message) {
  return { status, message, noticeId: crypto.randomUUID() };
}

export async function updatePreferences(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.from('user_preferences').upsert({
    user_id: user.id,
    preferred_weight_min: numberOrNull(formData.get('preferred_weight_min')),
    preferred_weight_max: numberOrNull(formData.get('preferred_weight_max')),
    max_playtime_minutes: numberOrNull(formData.get('max_playtime_minutes')),
    preferred_player_min: numberOrNull(formData.get('preferred_player_min')),
    preferred_player_max: numberOrNull(formData.get('preferred_player_max')),
    travel_radius_km: milesToKilometers(formData.get('travel_radius_miles')),
    teaching_ok: formData.get('teaching_ok') === 'on',
    new_to_hobby: formData.get('new_to_hobby') === 'on',
    notify_email: formData.get('notify_email') === 'on',
    notify_new_nearby: formData.get('notify_new_nearby') === 'on',
    default_share_scope: formData.get('default_share_scope') || 'hosts_only',
  });

  if (error) {
    redirect(`/settings/preferences?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/settings/preferences');
}

export async function updateProfile(_previousState, formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const username = String(formData.get('username') || '').trim().toLowerCase();
  const firstName = String(formData.get('first_name') || '').trim();
  const lastName = String(formData.get('last_name') || '').trim();
  const preferredPronouns = String(formData.get('preferred_pronouns') || '').trim();
  const bio = String(formData.get('bio') || '').trim();
  const gamesYesPlease = String(formData.get('games_yes_please') || '').trim();
  const gamesNoThanks = String(formData.get('games_no_thanks') || '').trim();

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return profileResult('error', 'Username must be 3–24 characters using only lowercase letters, numbers, and underscores.');
  }

  if (!firstName) {
    return profileResult('error', 'First name is required.');
  }

  if (firstName.length > 80 || lastName.length > 80) {
    return profileResult('error', 'Names must be 80 characters or fewer.');
  }

  if (preferredPronouns.length > 80) {
    return profileResult('error', 'Preferred pronouns must be 80 characters or fewer.');
  }

  if (bio.length > 1000 || gamesYesPlease.length > 1000 || gamesNoThanks.length > 1000) {
    return profileResult('error', 'About Me and game preference fields must be 1,000 characters or fewer.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      username,
      first_name: firstName,
      last_name: lastName || null,
      preferred_pronouns: preferredPronouns || null,
      bio: bio || null,
      games_yes_please: gamesYesPlease || null,
      games_no_thanks: gamesNoThanks || null,
      display_name: [firstName, lastName].filter(Boolean).join(' '),
    })
    .eq('id', user.id);

  if (error) {
    const message = error.code === '23505' ? 'That username is already taken.' : error.message;
    return profileResult('error', message);
  }

  revalidatePath('/', 'layout');
  return profileResult('success', 'Your profile has been updated.');
}

export async function addConsideration(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const label = formData.get('label');
  if (!label) {
    redirect(`/settings/considerations?error=${encodeURIComponent('Label is required')}`);
  }

  const severityRaw = formData.get('severity');

  const { error } = await supabase.from('user_considerations').insert({
    user_id: user.id,
    kind: formData.get('kind') || 'other',
    label,
    details: formData.get('details') || null,
    severity: severityRaw ? Number(severityRaw) : null,
    visibility: formData.get('visibility') || 'hosts_only',
  });

  if (error) {
    redirect(`/settings/considerations?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/settings/considerations');
  redirect('/settings/considerations');
}

export async function deleteConsideration(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const id = formData.get('id');

  await supabase.from('user_considerations').delete().eq('id', id);

  revalidatePath('/settings/considerations');
}

export async function updateConsideration(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const id = String(formData.get('id') || '');
  const label = String(formData.get('label') || '').trim();
  const kind = String(formData.get('kind') || 'other');
  const visibility = String(formData.get('visibility') || 'hosts_only');
  const severityRaw = formData.get('severity');
  const allowedKinds = ['vision', 'hearing', 'mobility', 'allergy', 'dietary', 'sensory', 'other'];
  const allowedVisibilities = ['private', 'hosts_only', 'attendees', 'public'];

  if (!id || !label || !allowedKinds.includes(kind) || !allowedVisibilities.includes(visibility)) {
    redirect(`/settings/considerations?error=${encodeURIComponent('Please provide valid consideration details.')}`);
  }

  const severity = severityRaw ? Number(severityRaw) : null;
  if (severity != null && ![1, 2, 3].includes(severity)) {
    redirect(`/settings/considerations?error=${encodeURIComponent('Severity must be between 1 and 3.')}`);
  }

  const { error } = await supabase
    .from('user_considerations')
    .update({
      kind,
      label,
      details: String(formData.get('details') || '').trim() || null,
      severity,
      visibility,
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    redirect(`/settings/considerations?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/settings/considerations');
}

export async function regenerateIcsToken() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const token = crypto.randomUUID().replace(/-/g, '');

  await supabase.from('profiles').update({ ics_token: token }).eq('id', user.id);

  revalidatePath('/settings/preferences');
}
