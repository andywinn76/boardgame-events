'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://boardgame-events.vercel.app').replace(/\/$/, '');

function safeNext(value) {
  // Only ever redirect within the app -- a bare "/path" is safe, but "//host/path"
  // or "https://host/path" is browser-parsed as an off-site redirect.
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export async function login(formData) {
  const supabase = await createClient();

  const next = safeNext(formData.get('next'));

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (error) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/', 'layout');
  redirect(next);
}

export async function signup(formData) {
  const supabase = await createClient();
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const firstName = String(formData.get('first_name') || '').trim();
  const lastName = String(formData.get('last_name') || '').trim();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirm_password') || '');

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    redirect(
      `/signup?error=${encodeURIComponent(
        'Username must be 3 to 24 characters using only lowercase letters, numbers, and underscores.'
      )}`
    );
  }

  if (!firstName) {
    redirect(`/signup?error=${encodeURIComponent('First name is required.')}`);
  }

  if (firstName.length > 80 || lastName.length > 80) {
    redirect(`/signup?error=${encodeURIComponent('Names must be 80 characters or fewer.')}`);
  }

  if (password.length < 6) {
    redirect(`/signup?error=${encodeURIComponent('Password must be at least 6 characters.')}`);
  }

  if (password !== confirmPassword) {
    redirect(`/signup?error=${encodeURIComponent('Passwords do not match.')}`);
  }

  const { data: existingProfile, error: usernameCheckError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (usernameCheckError) {
    redirect(
      `/signup?error=${encodeURIComponent('Could not check username availability. Please try again.')}`
    );
  }

  if (existingProfile) {
    redirect(`/signup?error=${encodeURIComponent('That username is already taken.')}`);
  }

  const { error } = await supabase.auth.signUp({
    email: formData.get('email'),
    password,
    options: {
      emailRedirectTo: `${siteUrl}/callback`,
      data: {
        username,
        first_name: firstName,
        last_name: lastName || null,
      },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/signup/check-email');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
