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

export async function updateUsername(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const username = String(formData.get('username') || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    redirect(
      `/settings/preferences?error=${encodeURIComponent('Username must be 3–24 characters using only lowercase letters, numbers, and underscores.')}`
    );
  }

  const { error } = await supabase.from('profiles').update({ username }).eq('id', user.id);

  if (error) {
    const message = error.code === '23505' ? 'That username is already taken.' : error.message;
    redirect(`/settings/preferences?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/', 'layout');
  redirect('/settings/preferences?updated=username');
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
