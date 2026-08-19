'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

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

  const { error } = await supabase.auth.signUp({
    email: formData.get('email'),
    password: formData.get('password'),
    options: {
      emailRedirectTo: `${siteUrl}/callback`,
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
